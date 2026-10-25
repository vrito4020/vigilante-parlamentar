import asyncio
import json
import os
import re
import unicodedata
import httpx
from sqlalchemy.orm import Session
import models

DATAJUD_KEY = "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
TSE_API_URL = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1"
TSE_ELEICAO_ID = "2040602022"

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
RADAR_CACHE_FILE = os.path.join(CACHE_DIR, "radar_judiciario_cache.json")

_MEM_RADAR_CACHE = None
_TSE_UF_LIST_CACHE = {}

MAPA_TIPOS_CERTIDAO_TSE = {
    "11": ("Justiça Estadual de 1º Grau", "Certidão Criminal Estadual (1ª Instância)"),
    "12": ("Justiça Estadual de 2º Grau (TJ)", "Certidão Criminal Estadual (2ª Instância)"),
    "13": ("Justiça Criminal / Cível (Objeto e Pé)", "Certidão Judicial de Objeto e Pé (Processo Ativo Declarado)"),
    "14": ("Justiça Federal de 1º Grau (TRF)", "Certidão Criminal Federal (1ª Instância)"),
    "15": ("Justiça Federal de 2º Grau (TRF)", "Certidão Criminal Federal (2ª Instância)"),
    "16": ("Foro por Prerrogativa de Função (STF / STJ)", "Certidão Judicial de Foro Especial (1º Grau)"),
    "17": ("Foro por Prerrogativa de Função (STF / STJ)", "Certidão Judicial de Foro Especial (2º Grau)"),
}


def _norm(txt: str) -> str:
    if not txt:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(txt).upper())
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


def _formatar_cnj(num: str) -> str:
    limpo = re.sub(r"\D", "", str(num or ""))
    if len(limpo) == 20:
        return f"{limpo[:7]}-{limpo[7:9]}.{limpo[9:13]}.{limpo[13]}.{limpo[14:16]}.{limpo[16:]}"
    return str(num or "")


async def _consultar_datajud_tre(uf: str, num_processo: str) -> dict:
    num_limpo = re.sub(r"\D", "", str(num_processo or ""))
    if len(num_limpo) < 15 or not uf:
        return {}

    endpoint = f"https://api-publica.datajud.cnj.jus.br/api_publica_tre-{uf.lower()}/_search"
    headers = {
        "Authorization": DATAJUD_KEY,
        "Content-Type": "application/json",
        "User-Agent": "VigilanteParlamentar/2.0",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, verify=False, headers=headers) as client:
            r = await client.post(
                endpoint,
                json={"size": 1, "query": {"match": {"numeroProcesso": num_limpo}}},
            )
            if r.status_code == 200:
                hits = r.json().get("hits", {}).get("hits", [])
                if hits:
                    return hits[0].get("_source", {})
    except Exception as e:
        print(f"  [DataJud CNJ] Aviso ao consultar processo {num_limpo} no TRE-{uf}: {e}")
    return {}


async def _buscar_candidato_tse_detalhado(dep: models.Deputado) -> dict:
    uf = (dep.uf or "").upper()
    if not uf:
        return {}

    headers = {"User-Agent": "Mozilla/5.0"}
    async with httpx.AsyncClient(timeout=25.0, headers=headers) as client:
        if uf not in _TSE_UF_LIST_CACHE:
            try:
                r = await client.get(
                    f"{TSE_API_URL}/candidatura/listar/2022/{uf}/{TSE_ELEICAO_ID}/6/candidatos"
                )
                if r.status_code == 200:
                    _TSE_UF_LIST_CACHE[uf] = r.json().get("candidatos", [])
                else:
                    _TSE_UF_LIST_CACHE[uf] = []
            except Exception:
                _TSE_UF_LIST_CACHE[uf] = []

        candidatos = _TSE_UF_LIST_CACHE.get(uf, [])
        nome_parl = _norm(dep.nome)
        nome_civ = _norm(dep.nome_civil or dep.nome)

        match = None
        for c in candidatos:
            c_urna = _norm(c.get("nomeUrna", ""))
            c_comp = _norm(c.get("nomeCompleto", ""))
            if c_urna == nome_parl or c_comp == nome_civ:
                match = c
                break
        if not match:
            for c in candidatos:
                c_urna = _norm(c.get("nomeUrna", ""))
                c_comp = _norm(c.get("nomeCompleto", ""))
                if nome_parl in c_urna or (nome_civ and nome_civ in c_comp):
                    match = c
                    break
        if not match:
            return {}

        cand_id = match.get("id")
        try:
            r_det = await client.get(
                f"{TSE_API_URL}/candidatura/buscar/2022/{uf}/{TSE_ELEICAO_ID}/candidato/{cand_id}"
            )
            if r_det.status_code == 200:
                return r_det.json()
        except Exception as e:
            print(f"  [Radar TSE] Aviso ao buscar detalhes do candidato {cand_id}: {e}")
    return {}


async def sincronizar_radar_judiciario_deputado(db: Session, deputado_id: int) -> int:
    """
    Sincroniza para o deputado no Bloco 5 (Radar Judiciário):
      1. Processos Judiciais do Deputado no CNJ DataJud (TRE/TSE: Registro e Prestação de Contas, Movimentações e Incidentes)
      2. Certidões Judiciais de Objeto e Pé (Processos Criminais / Cíveis / Foro Especial declarados ao TSE)
      3. Processos Administrativos Sancionadores (CGU / TCU / TCE) de empresas contratadas pelo gabinete ou emendas
    """
    dep = db.query(models.Deputado).filter(models.Deputado.id == deputado_id).first()
    if not dep:
        return 0

    db.query(models.ProcessoJudicialRadar).filter(
        models.ProcessoJudicialRadar.deputado_id == deputado_id
    ).delete(synchronize_session=False)
    db.commit()

    inseridos = 0
    det_tse = await _buscar_candidato_tse_detalhado(dep)
    uf = (dep.uf or "BR").upper()
    cand_id = det_tse.get("id")
    url_dossie_tse = (
        f"https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/{TSE_ELEICAO_ID}/{uf}/{cand_id}"
        if cand_id
        else "https://divulgacandcontas.tse.jus.br/"
    )

    # 1. PROCESSOS JUDICIAIS NO CNJ DATAJUD (Registro de Candidatura & Prestação de Contas Eleitorais)
    processos_cnj = []
    if det_tse.get("numeroProcesso"):
        processos_cnj.append((det_tse["numeroProcesso"], "Registro de Candidatura (RRC)"))
    if det_tse.get("numeroProcessoPrestContas"):
        processos_cnj.append((det_tse["numeroProcessoPrestContas"], "Prestação de Contas Eleitorais"))

    for num_proc, rotulo_default in processos_cnj:
        dj = await _consultar_datajud_tre(uf, num_proc)
        await asyncio.sleep(0.15)

        num_fmt = _formatar_cnj(num_proc)
        if dj:
            classe_nome = dj.get("classe", {}).get("nome") or rotulo_default
            orgao_nome = dj.get("orgaoJulgador", {}).get("nome") or f"TRE-{uf}"
            assuntos_lista = [a.get("nome", "") for a in (dj.get("assuntos") or []) if a.get("nome")]
            assuntos_str = ", ".join(assuntos_lista[:3]) or rotulo_default
            movs = dj.get("movimentos") or []
            qtd_movs = len(movs)

            # Identifica movimentações críticas no CNJ DataJud
            termos_criticos = ("IMPUGNA", "RECURSO", "DILIG", "INTIMA", "DESAPROVA", "RESSALVA", "INELEG", "INDEFER", "EMBARGO")
            movs_criticos = [
                m.get("nome", "")
                for m in movs
                if any(t in _norm(m.get("nome", "")) for t in termos_criticos)
            ]
            ult_mov = movs[-1].get("nome", "Trânsito / Arquivamento") if movs else "Distribuído"
            if movs_criticos:
                resumo_crit = ", ".join(list(dict.fromkeys(movs_criticos))[:3])
                ult_mov = f"Último: {ult_mov} | Incidentes: {resumo_crit}"

            data_aj = str(dj.get("dataAjuizamento") or "")
            if len(data_aj) >= 8:
                data_aj = f"{data_aj[6:8]}/{data_aj[4:6]}/{data_aj[:4]}"

            risco = "ALTA" if qtd_movs >= 80 else ("MEDIA" if qtd_movs >= 40 or movs_criticos else "BAIXA")

            db.add(models.ProcessoJudicialRadar(
                deputado_id=dep.id,
                numero_processo=num_fmt,
                tribunal=f"CNJ DataJud — TRE-{uf}",
                classe_processual=classe_nome,
                orgao_julgador=orgao_nome,
                assuntos=assuntos_str,
                polo_alvo=f"Deputado {dep.nome} (Titular)",
                qtd_movimentacoes=qtd_movs,
                ultima_movimentacao=ult_mov[:240],
                data_ajuizamento_ou_certidao=data_aj or "2022",
                grau_risco=risco,
                url_consulta=url_dossie_tse,
            ))
            inseridos += 1
        else:
            db.add(models.ProcessoJudicialRadar(
                deputado_id=dep.id,
                numero_processo=num_fmt,
                tribunal=f"Justiça Eleitoral — TRE-{uf}",
                classe_processual=rotulo_default,
                orgao_julgador=f"Tribunal Regional Eleitoral ({uf})",
                assuntos=rotulo_default,
                polo_alvo=f"Deputado {dep.nome} (Titular)",
                qtd_movimentacoes=1,
                ultima_movimentacao=f"Situação TSE: {det_tse.get('descricaoSituacao', 'Deferido')}",
                data_ajuizamento_ou_certidao="2022",
                grau_risco="BAIXA",
                url_consulta=url_dossie_tse,
            ))
            inseridos += 1

    # 2. CERTIDÕES JUDICIAIS DE OBJETO E PÉ (codTipo == '13') E FORO ESPECIAL (STF/STJ/TRF)
    arquivos = det_tse.get("arquivos") or []
    certidoes_objeto_pe = [a for a in arquivos if str(a.get("codTipo")) == "13"]
    certidoes_foro_esp = [a for a in arquivos if str(a.get("codTipo")) in ("16", "17")]

    for idx, cert in enumerate(certidoes_objeto_pe, start=1):
        nome_arq = cert.get("nome") or f"Certidao_Objeto_e_Pe_{idx}.pdf"
        id_arq = cert.get("idArquivo") or idx
        db.add(models.ProcessoJudicialRadar(
            deputado_id=dep.id,
            numero_processo=f"OBJETO-PE-{id_arq}",
            tribunal="Justiça Estadual / Federal (Certidão de Objeto e Pé)",
            classe_processual=f"Certidão de Objeto e Pé #{idx} (Processo Judicial Ativo Declarado)",
            orgao_julgador="Vara Criminal / Cível / Fazenda Pública",
            assuntos="Apontamento positivo em certidão judicial exigindo juntada de Certidão de Objeto e Pé (Súmula TSE)",
            polo_alvo=f"Deputado {dep.nome} ({dep.nome_civil or dep.nome})",
            qtd_movimentacoes=len(certidoes_objeto_pe),
            ultima_movimentacao=f"Documento Judicial Anexado: {nome_arq} ({len(certidoes_objeto_pe)} certidões de Objeto e Pé no dossiê)",
            data_ajuizamento_ou_certidao="Eleições 2022 / Vigente",
            grau_risco="ALTA" if len(certidoes_objeto_pe) >= 3 else "MEDIA",
            url_consulta=url_dossie_tse,
        ))
        inseridos += 1

    for idx, cert in enumerate(certidoes_foro_esp, start=1):
        id_arq = cert.get("idArquivo") or idx
        db.add(models.ProcessoJudicialRadar(
            deputado_id=dep.id,
            numero_processo=f"FORO-ESP-{id_arq}",
            tribunal="Supremo Tribunal Federal (STF) / STJ / TRF",
            classe_processual="Certidão Judicial de Foro por Prerrogativa de Função",
            orgao_julgador="Tribunal Superior / Foro Especial",
            assuntos="Certidão Criminal de Prerrogativa de Função Parlamentar",
            polo_alvo=f"Deputado {dep.nome}",
            qtd_movimentacoes=1,
            ultima_movimentacao=f"Certidão protocolada no registro judicial TSE ({cert.get('nome', '')})",
            data_ajuizamento_ou_certidao="2022",
            grau_risco="MEDIA",
            url_consulta=url_dossie_tse,
        ))
        inseridos += 1

    # 3. PROCESSOS ADMINISTRATIVOS SANCIONADORES (CGU / TCU / TCE) CONTRA EMPRESAS DO ECOSSISTEMA DO GABINETE
    cnpjs_forn = [
        c[0]
        for c in db.query(models.DespesaCEAP.fornecedor_cnpj)
        .filter(models.DespesaCEAP.deputado_id == dep.id)
        .distinct()
        .all()
        if c[0]
    ]
    if cnpjs_forn:
        sancoes_ceap = (
            db.query(models.SancaoFornecedor)
            .filter(models.SancaoFornecedor.cnpj.in_(cnpjs_forn))
            .all()
        )
        for s in sancoes_ceap:
            forn_obj = db.query(models.Fornecedor).filter_by(cnpj=s.cnpj).first()
            nome_f = forn_obj.razao_social if forn_obj else s.cnpj
            db.add(models.ProcessoJudicialRadar(
                deputado_id=dep.id,
                numero_processo=s.numero_processo or f"PROC-{s.cadastro}-{s.cnpj[:8]}",
                tribunal=f"{s.cadastro} / {s.orgao_sancionador or 'CGU'}",
                classe_processual=s.categoria_sancao or "Processo Administrativo de Responsabilização",
                orgao_julgador=f"{s.orgao_sancionador or 'Órgão Sancionador'} ({s.uf_orgao or 'BR'})",
                assuntos=s.fundamentacao_legal or "Impedimento de Licitar e Contratar / Lei Anticorrupção",
                polo_alvo=f"Fornecedor CEAP: {nome_f[:40]} (CNPJ {s.cnpj})",
                qtd_movimentacoes=1,
                ultima_movimentacao=f"Sanção Vigente de {s.data_inicio or 'N/D'} até {s.data_final or 'Indeterminado'}",
                data_ajuizamento_ou_certidao=s.data_inicio or "Ativo",
                grau_risco="ALTA",
                url_consulta="https://portaldatransparencia.gov.br/sancoes",
            ))
            inseridos += 1

    favs_sanc = (
        db.query(models.FavorecidoEmenda)
        .filter(
            models.FavorecidoEmenda.deputado_id == dep.id,
            models.FavorecidoEmenda.sancionado_cgu == True,
        )
        .all()
    )
    for fv in favs_sanc[:10]:
        m_proc = re.search(r"Proc:\s*([^\)]+)", fv.detalhe_sancao or "")
        num_p = m_proc.group(1).strip() if m_proc else f"CEIS-{fv.cnpj_favorecido}"
        db.add(models.ProcessoJudicialRadar(
            deputado_id=dep.id,
            numero_processo=num_p,
            tribunal="Controladoria-Geral da União (CEIS / CNEP)",
            classe_processual="Processo Sancionador de Favorecido de Emenda",
            orgao_julgador=f"Ente Sancionador ({fv.municipio}/{fv.uf})",
            assuntos=fv.detalhe_sancao or "Proibição de Contratar com o Poder Público",
            polo_alvo=f"Favorecido Emenda: {fv.nome_favorecido[:38]} (R$ {fv.valor_recebido:,.2f})",
            qtd_movimentacoes=1,
            ultima_movimentacao=fv.detalhe_sancao or "Sanção ativa no CEIS/CNEP",
            data_ajuizamento_ou_certidao=fv.ano_mes or "Vigente",
            grau_risco="ALTA",
            url_consulta="https://portaldatransparencia.gov.br/sancoes",
        ))
        inseridos += 1

    db.commit()
    return inseridos
