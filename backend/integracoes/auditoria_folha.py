"""
Bloco 6 — Auditoria de Folha de Gabinete, Dupla Lotação, Diário Oficial da União (CEAF/CGU),
Cargos de Natureza Especial (CNE Extra-Cota) e Conflito Societário com Fornecedores (QSA).
"""
from datetime import datetime, timedelta
from collections import defaultdict
import zipfile
import io
import csv
import json
import os
import re
import unicodedata
import httpx
from sqlalchemy.orm import Session
import models
from integracoes.nepotismo_cruzado import _extrair_sobrenomes_raros

CAMARA_FUNCIONARIOS_JSON_URL = "https://dadosabertos.camara.leg.br/arquivos/funcionarios/json/funcionarios.json"

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
FOLHA_CACHE_FILE = os.path.join(CACHE_DIR, "auditoria_folha_cache.json")

_MEM_FOLHA_CACHE = None

# Tabela referencial de remuneração bruta mensal dos cargos comissionados da Câmara (SP01..SP25 e CNE07..CNE15)
TABELA_SALARIAL_SP_BASE = {
    1: 1584.10, 2: 1821.70, 3: 2059.32, 4: 2296.95, 5: 2613.76,
    6: 2930.58, 7: 3326.60, 8: 3722.62, 9: 4118.65, 10: 4593.88,
    11: 5069.10, 12: 5544.33, 13: 6098.77, 14: 6653.20, 15: 7286.84,
    16: 7920.48, 17: 8633.32, 18: 9346.16, 19: 10138.21, 20: 10930.25,
    21: 11801.50, 22: 12672.75, 23: 13623.21, 24: 14652.87, 25: 15698.32,
}

TABELA_SALARIAL_CNE = {
    "CNE07": 19240.39,
    "CNE09": 16890.15,
    "CNE10": 15420.80,
    "CNE11": 14180.45,
    "CNE12": 13120.60,
    "CNE13": 12190.30,
    "CNE14": 11350.00,
    "CNE15": 10680.25,
}


def _norm(txt: str) -> str:
    if not txt:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(txt).upper())
    limpo = "".join(c for c in nfkd if not unicodedata.combining(c))
    limpo = re.sub(r"[^A-Z\s]", " ", limpo)
    return re.sub(r"\s+", " ", limpo).strip()


def _estimar_remuneracao(codigo_cargo: str, grupo: str) -> float:
    cod = (codigo_cargo or "").strip().upper()
    if cod in TABELA_SALARIAL_CNE:
        return TABELA_SALARIAL_CNE[cod]
    if cod.startswith("CNE"):
        return 13500.00
    m = re.match(r"SP(\d{2})([CSU]?)", cod)
    if m:
        nivel = int(m.group(1))
        sufixo = m.group(2)
        base = TABELA_SALARIAL_SP_BASE.get(nivel, 4500.0)
        # Sufixo 'C' possui 100% da Gratificação de Representação de Gabinete
        if sufixo == "C":
            return round(base * 1.42, 2)
        return round(base, 2)
    if "EFETIVO" in (grupo or "").upper() or "RJU" in (grupo or "").upper():
        return 24500.00
    return 4800.00


async def _carregar_indice_folha_e_ceaf() -> dict:
    """
    Carrega do cache local (ou constrói a partir da API de Dados Abertos da Câmara e do CEAF/CGU)
    o índice de funcionários por deputado, servidores com dupla lotação na Câmara e expulsões no DOU (CEAF).
    """
    global _MEM_FOLHA_CACHE
    if _MEM_FOLHA_CACHE is not None:
        return _MEM_FOLHA_CACHE

    if os.path.exists(FOLHA_CACHE_FILE):
        try:
            with open(FOLHA_CACHE_FILE, "r", encoding="utf-8") as f:
                _MEM_FOLHA_CACHE = json.load(f)
                if _MEM_FOLHA_CACHE.get("por_deputado"):
                    return _MEM_FOLHA_CACHE
        except Exception:
            pass

    headers = {"User-Agent": "Mozilla/5.0"}
    por_deputado = defaultdict(list)
    por_nome = defaultdict(list)
    ceaf_hits = {}

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=headers) as client:
        # 1. Baixa relação nacional de funcionários da Câmara (15.253 registros)
        try:
            r = await client.get(CAMARA_FUNCIONARIOS_JSON_URL)
            if r.status_code == 200:
                dados = r.json().get("dados", [])
                for item in dados:
                    if item.get("codGrupo") == 5:
                        continue  # Ignora o próprio registro de deputado titular
                    nm = _norm(item.get("nome", ""))
                    resumo = {
                        "ponto": item.get("ponto") or "",
                        "codGrupo": item.get("codGrupo"),
                        "grupo": item.get("grupo") or "Secretário Parlamentar",
                        "nome": item.get("nome") or "",
                        "cargo": item.get("cargo") or "SP",
                        "lotacao": item.get("lotacao") or "",
                        "atoNomeacao": item.get("atoNomeacao") or "",
                        "dataNomeacao": item.get("dataNomeacao") or "",
                        "dataInicioHistorico": item.get("dataInicioHistorico") or "",
                        "dataPubNomeacao": item.get("dataPubNomeacao") or "",
                        "funcao": item.get("funcao") or "",
                        "uriLotacao": item.get("uriLotacao") or "",
                    }
                    if nm:
                        por_nome[nm].append(resumo)
                    uri = str(item.get("uriLotacao") or "")
                    if "/deputados/" in uri:
                        dep_id_str = uri.split("/deputados/")[-1].strip()
                        por_deputado[dep_id_str].append(resumo)
        except Exception as e:
            print(f"[Bloco 6] Aviso ao baixar funcionarios.json da Câmara: {e}")

        # 2. Baixa CEAF da CGU (Cadastro de Expulsões da Administração Federal - DOU)
        ceaf_por_nome = defaultdict(list)
        for delta in range(1, 8):
            dt_str = (datetime.now() - timedelta(days=delta)).strftime("%Y%m%d")
            url_ceaf = f"https://portaldatransparencia.gov.br/download-de-dados/ceaf/{dt_str}"
            try:
                rc = await client.get(url_ceaf, timeout=25.0)
                if rc.status_code == 200 and len(rc.content) > 1000:
                    z = zipfile.ZipFile(io.BytesIO(rc.content))
                    with z.open(z.namelist()[0]) as f:
                        text = io.TextIOWrapper(f, encoding="latin-1", errors="replace")
                        reader = csv.reader(text, delimiter=";")
                        next(reader, None)
                        for row in reader:
                            if len(row) > 18:
                                nm_c = _norm(row[4])
                                if nm_c and len(nm_c.split()) >= 3:
                                    ceaf_por_nome[nm_c].append({
                                        "cpf_mask": row[3],
                                        "nome": row[4],
                                        "punicao": row[5],
                                        "processo": row[7],
                                        "data_publicacao": row[10],
                                        "dou": row[11],
                                        "cargo_origem": row[15] or row[16],
                                        "orgao_origem": row[17],
                                        "fundamento": (row[21] if len(row) > 21 else "")[:180],
                                    })
                    break
            except Exception as e:
                print(f"[Bloco 6] Aviso ao baixar CEAF/{dt_str}: {e}")

        for nm, funcs in por_nome.items():
            if nm in ceaf_por_nome:
                ceaf_hits[nm] = ceaf_por_nome[nm][0]

    duplas_lotacoes = {
        nm: [
            {"cargo": x["cargo"], "grupo": x["grupo"], "lotacao": x["lotacao"], "ponto": x["ponto"]}
            for x in lista
        ]
        for nm, lista in por_nome.items()
        if len(lista) > 1
    }

    _MEM_FOLHA_CACHE = {
        "por_deputado": dict(por_deputado),
        "duplas_lotacoes": duplas_lotacoes,
        "ceaf_hits": ceaf_hits,
    }
    try:
        with open(FOLHA_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_MEM_FOLHA_CACHE, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    return _MEM_FOLHA_CACHE


async def sincronizar_auditoria_folha_deputado(db: Session, deputado_id: int) -> int:
    """
    Sincroniza para o deputado no Bloco 6:
      1. Dossiê funcional de cada servidor do gabinete (Ponto, Grupo, Nível SP01..SP25 / CNE07..CNE15, Salário Estimado, Ato no Diário)
      2. Detecção de Expulsões no Diário Oficial da União (CEAF / CGU - Demissão ou Destituição)
      3. Detecção de Dupla Lotação Simultânea na Câmara dos Deputados
      4. Detecção de Conflito Societário / Familiar com Empresas Fornecedoras da Cota (QSA × Gabinete)
      5. Detecção de Cargos de Natureza Especial Extra-Cota (CNEs pagos fora da verba de gabinete) e Giro Recente de Portarias
    """
    dep = db.query(models.Deputado).filter(models.Deputado.id == deputado_id).first()
    if not dep:
        return 0

    db.query(models.AuditoriaFolhaGabinete).filter(
        models.AuditoriaFolhaGabinete.deputado_id == deputado_id
    ).delete(synchronize_session=False)
    db.commit()

    indice = await _carregar_indice_folha_e_ceaf()
    staff_lista = indice.get("por_deputado", {}).get(str(deputado_id), [])
    duplas = indice.get("duplas_lotacoes", {})
    ceaf_hits = indice.get("ceaf_hits", {})

    # Mapa de URLs diretas de remuneração já salvas em AssessorGabinete
    assessores_db = (
        db.query(models.AssessorGabinete)
        .filter(models.AssessorGabinete.deputado_id == deputado_id)
        .all()
    )
    url_por_nome = {_norm(a.nome): a.remuneracao_url for a in assessores_db if a.remuneracao_url}

    # Dossiês de fornecedores contratados pelo gabinete (para cruzar QSA × Folha)
    dossies_forn = (
        db.query(models.DossieFornecedorGabinete)
        .filter(models.DossieFornecedorGabinete.deputado_id == deputado_id)
        .all()
    )

    inseridos = 0
    for item in staff_lista:
        nome_serv = item.get("nome") or ""
        nm_norm = _norm(nome_serv)
        ponto = item.get("ponto") or "S/M"
        grupo = item.get("grupo") or "Secretário Parlamentar"
        cargo = item.get("cargo") or "SP"
        funcao = item.get("funcao") or cargo
        ato = item.get("atoNomeacao") or "PORTARIA"
        dt_hist = item.get("dataInicioHistorico") or ""
        dt_pub = item.get("dataPubNomeacao") or item.get("dataNomeacao") or ""
        rem_est = _estimar_remuneracao(cargo, grupo)

        url_comp = url_por_nome.get(nm_norm) or f"https://www.camara.leg.br/transparencia/recursos-humanos/funcionarios?search={nome_serv.replace(' ', '+')}"

        anomalias = []
        tipos = []
        gravidade = "BAIXA"

        # 1. Checagem CEAF / CGU (Expulsão / Demissão / Destituição no Diário Oficial da União - DOU)
        if nm_norm in ceaf_hits:
            c_info = ceaf_hits[nm_norm]
            gravidade = "ALTA"
            tipos.append("EXPULSAO_CEAF_DOU")
            anomalias.append(
                f"REGISTRO NO CEAF/CGU (DIÁRIO OFICIAL DA UNIÃO): Homônimo integral / servidor com portaria de '{c_info.get('punicao')}' publicada no {c_info.get('dou')} em {c_info.get('data_publicacao')} (Órgão de origem: {c_info.get('orgao_origem')} | Proc.: {c_info.get('processo')})."
            )

        # 2. Checagem de Dupla Lotação Simultânea na Câmara dos Deputados
        if nm_norm in duplas and len(duplas[nm_norm]) > 1:
            outras = [
                f"{x['cargo']} ({x['lotacao']})"
                for x in duplas[nm_norm]
                if x.get("ponto") != ponto or x.get("lotacao") != item.get("lotacao")
            ]
            if outras:
                gravidade = "ALTA"
                tipos.append("DUPLA_LOTACAO_CAMARA")
                anomalias.append(
                    f"DUPLA LOTAÇÃO / REGISTRO SIMULTÂNEO NA CÂMARA: Servidor consta simultaneamente vinculado a: {'; '.join(outras)}."
                )

        # 3. Checagem de Conflito Societário / Familiar com Empresa Fornecedora da Cota (QSA × Folha)
        tokens_serv = set(_extrair_sobrenomes_raros(nome_serv))
        if tokens_serv and dossies_forn:
            for df in dossies_forn:
                if not df.qsa_socios:
                    continue
                qsa_norm = _norm(df.qsa_socios)
                if nm_norm and nm_norm in qsa_norm:
                    gravidade = "ALTA"
                    tipos.append("SOCIO_DIRETO_FORNECEDOR_CEAP")
                    anomalias.append(
                        f"SÓCIO-ADMINISTRADOR DE FORNECEDORA DO GABINETE: Figura diretamente no QSA da empresa '{df.razao_social}' (CNPJ {df.cnpj}, sediada em {df.municipio}/{df.uf}), que recebeu R$ {df.total_recebido_deputado:,.2f} da Cota Parlamentar deste deputado."
                    )
                    break
                tokens_qsa = set(_extrair_sobrenomes_raros(df.qsa_socios))
                comum = sorted(tokens_serv.intersection(tokens_qsa))
                if comum:
                    gravidade = "ALTA"
                    tipos.append("VINCULO_FAMILIAR_QSA_FORNECEDOR")
                    anomalias.append(
                        f"CONFLITO FAMILIAR COM FORNECEDOR DA COTA (QSA): Compartilha o sobrenome familiar '{', '.join(comum)}' com o Quadro Societário ({df.qsa_socios[:90]}) da fornecedora '{df.razao_social}' (CNPJ {df.cnpj}, {df.municipio}/{df.uf}), paga com R$ {df.total_recebido_deputado:,.2f} pela CEAP."
                    )
                    break

        # 4. Checagem de Cargo de Natureza Especial Extra-Cota (CNE lotado no gabinete)
        if item.get("codGrupo") == 2 or cargo.upper().startswith("CNE"):
            if gravidade == "BAIXA":
                gravidade = "MEDIA"
            tipos.append("CARGO_CNE_EXTRA_COTA")
            anomalias.append(
                f"CARGO DE NATUREZA ESPECIAL EXTRA-COTA ({cargo}): Remuneração estimada de R$ {rem_est:,.2f}/mês custeada fora do limite ordinário da Verba de Gabinete ({funcao or 'Assessoria Especial'})."
            )

        # 5. Checagem de Giro de Portaria / Recalibração Salarial Recente no Diário da Câmara
        if ato == "PORTARIA" and dt_hist and dt_pub and dt_pub > dt_hist:
            try:
                ano_h = int(dt_hist[:4])
                ano_p = int(dt_pub[:4])
                if (ano_p - ano_h) >= 2:
                    if gravidade == "BAIXA":
                        gravidade = "MEDIA"
                    tipos.append("GIRO_PORTARIA_RECALIBRACAO")
                    anomalias.append(
                        f"RECALIBRAÇÃO DE NÍVEL / PORTARIA RECENTE NO DIÁRIO: No gabinete desde {dt_hist}, mas teve nova Portaria publicada em {dt_pub} para o nível {cargo} (R$ {rem_est:,.2f}/mês)."
                    )
            except Exception:
                pass

        indicio = len(anomalias) > 0
        detalhe_str = " | ".join(anomalias) if anomalias else (
            f"Lotação regular no gabinete ({cargo} — {grupo}). Início histórico: {dt_hist or 'N/D'} | Último ato ({ato}): {dt_pub or 'N/D'}."
        )
        tipo_str = " + ".join(tipos) if tipos else "REGULAR"

        db.add(models.AuditoriaFolhaGabinete(
            deputado_id=dep.id,
            ponto_matricula=ponto,
            nome_servidor=nome_serv,
            grupo_funcional=grupo,
            codigo_cargo=cargo,
            funcao_detalhe=funcao or f"Secretário Parlamentar ({cargo})",
            remuneracao_estimada=rem_est,
            ato_nomeacao=ato,
            data_inicio_historico=dt_hist,
            data_pub_nomeacao=dt_pub,
            indicio_fantasma_ou_acumulo=indicio,
            tipo_anomalia=tipo_str,
            gravidade=gravidade,
            detalhe_auditoria=detalhe_str,
            url_comprovante=url_comp,
        ))
        inseridos += 1

    db.commit()
    return inseridos
