import asyncio
import json
import os
import re
import urllib.parse
from collections import defaultdict
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func
import models
from integracoes.pncp import _eh_concessionaria_ou_bigtech

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
CNPJ_CACHE_FILE = os.path.join(CACHE_DIR, "cnpj_detalhado_cache.json")

_MEM_CNPJ_CACHE = None


def _carregar_cache_cnpj() -> dict:
    global _MEM_CNPJ_CACHE
    if _MEM_CNPJ_CACHE is not None:
        return _MEM_CNPJ_CACHE
    if os.path.exists(CNPJ_CACHE_FILE):
        try:
            with open(CNPJ_CACHE_FILE, "r", encoding="utf-8") as f:
                _MEM_CNPJ_CACHE = json.load(f)
                return _MEM_CNPJ_CACHE
        except Exception:
            pass
    _MEM_CNPJ_CACHE = {}
    return _MEM_CNPJ_CACHE


def _salvar_cache_cnpj():
    global _MEM_CNPJ_CACHE
    if _MEM_CNPJ_CACHE is None:
        return
    try:
        with open(CNPJ_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_MEM_CNPJ_CACHE, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"  [Sede/Cartel] Aviso ao salvar cache CNPJ: {e}")


async def consultar_cnpj_detalhado_receita(cnpj: str) -> dict:
    cnpj_limpo = re.sub(r"\D", "", str(cnpj or ""))
    if len(cnpj_limpo) != 14:
        return {}

    cache = _carregar_cache_cnpj()
    if cnpj_limpo in cache and cache[cnpj_limpo].get("logradouro") is not None:
        return cache[cnpj_limpo]

    url = f"https://brasilapi.com.br/api/cnpj/v1/{cnpj_limpo}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VigilanteParlamentar/2.0",
        "Accept": "application/json",
    }
    for tentativa in range(2):
        try:
            async with httpx.AsyncClient(timeout=12.0, headers=headers) as client:
                r = await client.get(url)
                if r.status_code == 200:
                    d = r.json()
                    qsa = d.get("qsa", []) or []
                    socios = [
                        s.get("nome_socio", "").strip()
                        for s in qsa
                        if s.get("nome_socio")
                    ]
                    tipo_log = (d.get("descricao_tipo_de_logradouro") or "").strip()
                    log_nome = (d.get("logradouro") or "").strip()
                    logradouro_full = f"{tipo_log} {log_nome}".strip()
                    tel1 = re.sub(r"\D", "", str(d.get("ddd_telefone_1") or ""))
                    tel2 = re.sub(r"\D", "", str(d.get("ddd_telefone_2") or ""))
                    telefone = tel1 or tel2 or ""

                    info = {
                        "cnpj": cnpj_limpo,
                        "razao_social": d.get("razao_social") or "",
                        "nome_fantasia": d.get("nome_fantasia") or "",
                        "logradouro": logradouro_full,
                        "numero": str(d.get("numero") or "").strip(),
                        "complemento": str(d.get("complemento") or "").strip(),
                        "bairro": str(d.get("bairro") or "").strip(),
                        "cep": re.sub(r"\D", "", str(d.get("cep") or "")),
                        "municipio": str(d.get("municipio") or "").strip(),
                        "uf": str(d.get("uf") or "").strip(),
                        "telefone": telefone,
                        "email": str(d.get("email") or "").strip().lower(),
                        "porte": str(d.get("porte") or d.get("descricao_porte") or "").strip(),
                        "capital_social": float(d.get("capital_social") or 0.0),
                        "data_abertura": str(d.get("data_inicio_atividade") or ""),
                        "cnae_principal": str(d.get("cnae_fiscal_descricao") or ""),
                        "situacao_cadastral": str(
                            d.get("descricao_situacao_cadastral") or "ATIVA"
                        ).upper(),
                        "qsa_socios": ", ".join(socios),
                    }
                    cache[cnpj_limpo] = info
                    return info
                elif r.status_code == 429:
                    await asyncio.sleep(1.2)
        except Exception:
            await asyncio.sleep(0.5)
    return {}


def _gerar_url_google_maps(info: dict, razao: str) -> str:
    partes = []
    if info.get("logradouro"):
        num = info.get("numero") or ""
        partes.append(f"{info['logradouro']}, {num}".strip(", "))
    if info.get("bairro"):
        partes.append(info["bairro"])
    if info.get("municipio") and info.get("uf"):
        partes.append(f"{info['municipio']} - {info['uf']}")
    if info.get("cep"):
        partes.append(info["cep"])
    if not partes:
        partes.append(razao)
    query = urllib.parse.quote_plus(", ".join(partes))
    return f"https://www.google.com/maps/search/?api=1&query={query}"


async def sincronizar_dossie_fornecedores_deputado(
    db: Session, deputado_id: int, max_fornecedores: int = 15
) -> int:
    """
    Constrói o Dossiê Físico, Societário (QSA) e de Rede/Cartel dos principais fornecedores
    privados do deputado na Cota Parlamentar (CEAP).
    """
    deputado = (
        db.query(models.Deputado).filter(models.Deputado.id == deputado_id).first()
    )
    if not deputado:
        return 0

    despesas = (
        db.query(models.DespesaCEAP)
        .filter(
            models.DespesaCEAP.deputado_id == deputado_id,
            models.DespesaCEAP.fornecedor_cnpj.isnot(None),
        )
        .all()
    )
    if not despesas:
        return 0

    por_cnpj_valor = defaultdict(float)
    por_cnpj_notas = defaultdict(int)
    por_cnpj_cat = defaultdict(lambda: defaultdict(float))

    for d in despesas:
        val = float(d.valor or 0.0)
        if val <= 0:
            continue
        por_cnpj_valor[d.fornecedor_cnpj] += val
        por_cnpj_notas[d.fornecedor_cnpj] += 1
        por_cnpj_cat[d.fornecedor_cnpj][d.tipo_despesa or "Outras Despesas"] += val

    ranking = sorted(por_cnpj_valor.items(), key=lambda kv: kv[1], reverse=True)

    db.query(models.DossieFornecedorGabinete).filter(
        models.DossieFornecedorGabinete.deputado_id == deputado_id
    ).delete(synchronize_session=False)
    db.commit()

    selecionados = []
    for cnpj_raw, total_val in ranking:
        cnpj_limpo = re.sub(r"\D", "", str(cnpj_raw or ""))
        if len(cnpj_limpo) != 14:
            continue
        forn_db = (
            db.query(models.Fornecedor).filter(models.Fornecedor.cnpj == cnpj_raw).first()
        )
        razao_ini = forn_db.razao_social if forn_db and forn_db.razao_social else f"CNPJ {cnpj_limpo}"
        if _eh_concessionaria_ou_bigtech(razao_ini, cnpj_limpo):
            continue
        selecionados.append((cnpj_raw, cnpj_limpo, forn_db, total_val))
        if len(selecionados) >= max_fornecedores:
            break

    inseridos = 0
    for cnpj_raw, cnpj_limpo, forn_db, total_val in selecionados:
        info = await consultar_cnpj_detalhado_receita(cnpj_limpo)
        await asyncio.sleep(0.2)

        razao = (
            info.get("razao_social")
            or (forn_db.razao_social if forn_db else "")
            or f"CNPJ {cnpj_limpo}"
        )
        if _eh_concessionaria_ou_bigtech(razao, cnpj_limpo):
            continue

        cats = por_cnpj_cat[cnpj_raw]
        cat_top = max(cats.items(), key=lambda x: x[1])[0] if cats else "Despesa Parlamentar"

        qsa_socios = info.get("qsa_socios") or (forn_db.qsa_nomes if forn_db else "") or ""
        capital = (
            info.get("capital_social")
            if info.get("capital_social") is not None
            else (forn_db.capital_social if forn_db and forn_db.capital_social else 0.0)
        )
        municipio = info.get("municipio") or (forn_db.municipio if forn_db else "") or ""
        uf = info.get("uf") or (forn_db.uf if forn_db else "") or ""
        cnae = info.get("cnae_principal") or (forn_db.cnae_fiscal_descricao if forn_db else "") or ""
        situacao = (
            info.get("situacao_cadastral")
            or (forn_db.situacao_cadastral if forn_db else "ATIVA")
            or "ATIVA"
        )
        data_ab = (
            info.get("data_abertura")
            or (forn_db.data_inicio_atividade if forn_db else "")
            or ""
        )

        # Atualiza também a tabela Fornecedor se faltavam dados
        if forn_db:
            if qsa_socios and not forn_db.qsa_nomes:
                forn_db.qsa_nomes = qsa_socios
            if capital and not forn_db.capital_social:
                forn_db.capital_social = capital
            if municipio and not forn_db.municipio:
                forn_db.municipio = municipio
            if uf and not forn_db.uf:
                forn_db.uf = uf

        url_maps = _gerar_url_google_maps(
            {
                "logradouro": info.get("logradouro"),
                "numero": info.get("numero"),
                "bairro": info.get("bairro"),
                "municipio": municipio,
                "uf": uf,
                "cep": info.get("cep"),
            },
            razao,
        )

        dossie = models.DossieFornecedorGabinete(
            deputado_id=deputado_id,
            cnpj=cnpj_limpo,
            razao_social=razao,
            nome_fantasia=info.get("nome_fantasia") or "",
            logradouro=info.get("logradouro") or "",
            numero=info.get("numero") or "",
            complemento=info.get("complemento") or "",
            bairro=info.get("bairro") or "",
            cep=info.get("cep") or "",
            municipio=municipio,
            uf=uf,
            telefone=info.get("telefone") or "",
            email=info.get("email") or "",
            porte=info.get("porte") or "",
            capital_social=float(capital or 0.0),
            data_abertura=data_ab,
            cnae_principal=cnae,
            situacao_cadastral=situacao,
            qsa_socios=qsa_socios,
            total_recebido_deputado=round(total_val, 2),
            qtd_notas_deputado=por_cnpj_notas[cnpj_raw],
            categoria_principal_gasto=cat_top,
            url_google_maps=url_maps,
            indicio_cartel_ou_fantasma=False,
            detalhe_indicio=None,
        )
        db.add(dossie)
        inseridos += 1

    db.commit()
    _salvar_cache_cnpj()
    avaliar_indicios_cartel_e_sede_fantasma(db, deputado_id)
    return inseridos


def avaliar_indicios_cartel_e_sede_fantasma(db: Session, deputado_id: int):
    """
    Cruza todos os DossieFornecedorGabinete do banco para identificar:
      1. Empresas distintas compartilhando o mesmo CEP + Número ou mesmo Telefone (Cartel / Contabilidade de Fachada)
      2. Empresas distintas compartilhando o mesmo Sócio no QSA (Rede Societária Oculta)
      3. Sede Fantasma / Inconsistência Física (Sem número S/N, sem telefone, capital irrisório ou baixada/inapta)
      4. Fornecedor compartilhado por múltiplos deputados na Câmara
    """
    meus_dossies = (
        db.query(models.DossieFornecedorGabinete)
        .filter(models.DossieFornecedorGabinete.deputado_id == deputado_id)
        .all()
    )
    if not meus_dossies:
        return

    todos_dossies = db.query(models.DossieFornecedorGabinete).all()

    # Mapas globais por CEP, Telefone e Sócio QSA (apenas raízes de CNPJ distintas: cnpj[:8])
    por_cep_num = defaultdict(list)
    por_cep = defaultdict(list)
    por_telefone = defaultdict(list)
    por_socio = defaultdict(list)
    por_cnpj_deps = defaultdict(set)

    for d in todos_dossies:
        por_cnpj_deps[d.cnpj].add(d.deputado_id)
        if d.cep and len(d.cep) == 8:
            por_cep[d.cep].append(d)
            chave_end = f"{d.cep}_{(d.numero or '').strip().upper()}"
            por_cep_num[chave_end].append(d)
        if d.telefone and len(d.telefone) >= 8:
            por_telefone[d.telefone].append(d)
        if d.qsa_socios:
            for s in d.qsa_socios.split(","):
                s_clean = s.strip().upper()
                if len(s_clean) > 5:
                    por_socio[s_clean].append(d)

    for d in meus_dossies:
        motivos = []
        raiz = d.cnpj[:8]

        # 1. Mesmo CEP + Número ou Mesmo CEP entre empresas de raízes de CNPJ diferentes
        if d.cep and len(d.cep) == 8:
            chave_end = f"{d.cep}_{(d.numero or '').strip().upper()}"
            outros_end = [
                x for x in por_cep_num[chave_end] if x.cnpj[:8] != raiz
            ]
            if outros_end:
                nomes_outros = sorted({x.razao_social[:32] for x in outros_end})
                motivos.append(
                    f"Sede Compartilhada (Mesmo CEP {d.cep} e Nº {d.numero}) com outra(s) empresa(s) da CEAP: {', '.join(nomes_outros[:2])}"
                )
            else:
                outros_cep = [x for x in por_cep[d.cep] if x.cnpj[:8] != raiz]
                if outros_cep and not d.cep.startswith("70"):  # Evita falsos positivos na Esplanada/Asa Sul DF
                    nomes_cep = sorted({x.razao_social[:32] for x in outros_cep})
                    motivos.append(
                        f"Cluster no Mesmo CEP ({d.cep}) com outra fornecedora da CEAP: {', '.join(nomes_cep[:2])}"
                    )

        # 2. Mesmo Telefone cadastrado na Receita Federal entre empresas distintas
        if d.telefone and len(d.telefone) >= 8:
            outros_tel = [x for x in por_telefone[d.telefone] if x.cnpj[:8] != raiz]
            if outros_tel:
                nomes_tel = sorted({x.razao_social[:32] for x in outros_tel})
                motivos.append(
                    f"Compartilha o mesmo Telefone na Receita ({d.telefone}) com outra empresa fornecedora: {', '.join(nomes_tel[:2])}"
                )

        # 3. Mesmo Sócio no QSA entre empresas distintas (Rede Societária)
        if d.qsa_socios:
            for s in d.qsa_socios.split(","):
                s_clean = s.strip().upper()
                if len(s_clean) > 5:
                    outros_soc = [x for x in por_socio[s_clean] if x.cnpj[:8] != raiz]
                    if outros_soc:
                        nomes_soc = sorted({x.razao_social[:30] for x in outros_soc})
                        motivos.append(
                            f"Rede Societária (QSA): Sócio {s_clean} também é dono de {', '.join(nomes_soc[:2])}"
                        )
                        break

        # 4. Sede Fantasma / Inconsistência Cadastral Física
        sit_up = (d.situacao_cadastral or "ATIVA").upper()
        if sit_up in {"INAPTA", "BAIXADA", "SUSPENSA", "NULA"}:
            motivos.append(
                f"Situação Cadastral Irregular na Receita Federal ({sit_up}) faturando R$ {d.total_recebido_deputado:,.2f}"
            )

        cat_up = (d.categoria_principal_gasto or "").upper()
        eh_servico_intangivel = any(
            k in cat_up for k in ("DIVULG", "CONSULT", "ASSESSORIA", "PESQUIS", "LOCA", "ESCRIT")
        )
        num_up = (d.numero or "").strip().upper()
        if eh_servico_intangivel and d.total_recebido_deputado >= 6000.0:
            if num_up in {"S/N", "SN", "SEM NUMERO", "0", ""} and d.logradouro:
                motivos.append(
                    f"Endereço sem numeração predial definida ('{d.logradouro}, {d.numero or 'S/N'}') prestando serviços de {d.categoria_principal_gasto}"
                )
            if (d.capital_social or 0.0) <= 3000.0 and d.capital_social >= 0:
                motivos.append(
                    f"Subcapitalização Física: Capital Social de R$ {d.capital_social:,.2f} frente a R$ {d.total_recebido_deputado:,.2f} recebidos do gabinete"
                )
            if not d.telefone and not d.email and d.logradouro:
                motivos.append(
                    "Ausência total de Telefone e E-mail de contato no cadastro da Receita Federal"
                )

        # 5. Fornecedor multi-gabinetes na Câmara
        qtd_deps = len(por_cnpj_deps[d.cnpj])
        if qtd_deps >= 2 and eh_servico_intangivel:
            motivos.append(
                f"Fornecedor recorrente contratado por {qtd_deps} gabinetes parlamentares auditados"
            )

        if motivos:
            d.indicio_cartel_ou_fantasma = True
            d.detalhe_indicio = " | ".join(motivos)
        else:
            d.indicio_cartel_ou_fantasma = False
            d.detalhe_indicio = None

    db.commit()
