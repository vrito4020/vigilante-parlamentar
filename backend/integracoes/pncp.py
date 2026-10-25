import asyncio
import httpx
import re
from sqlalchemy.orm import Session
from sqlalchemy import func
import models

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VigilanteParlamentar/2.0",
    "Accept": "application/json",
    "Connection": "close",
}

CONCESSIONARIAS_E_BIGTECHS_IGNORADAS = [
    "TAM LINHAS",
    "LATAM",
    "GOL LINHAS",
    "AZUL LINHAS",
    "PASSAREDO",
    "VOEPASS",
    "MAP TRANSPORTES AEREOS",
    "TELEFONICA",
    "CLARO",
    "NEXTEL",
    "VIVO",
    "TIM S",
    "OI S.A",
    "OI MOVEL",
    "STARLINK",
    "EMBRATEL",
    "ALGAR TELECOM",
    "BRISANET",
    "EMPRESA BRASILEIRA DE CORREIOS",
    "CORREIOS E TELEGRAFOS",
    "CGMP CENTRO DE GESTAO",
    "SEM PARAR",
    "CONECTCAR",
    "VELOE",
    "COMPANHIA DE SANEAMENTO",
    "SABESP",
    "SANEPAR",
    "COPASA",
    "CAESB",
    "EMBASA",
    "CAGECE",
    "COMPANHIA ENERGETICA",
    "CEMIG",
    "COPEL",
    "CELESC",
    "ELETROPAULO",
    "ENEL",
    "NEOENERGIA",
    "EQUATORIAL",
    "LIGHT SERVICOS",
    "CEB DISTRIBUICAO",
    "CPFL",
    "BANCO DO BRASIL",
    "CAIXA ECONOMICA",
    "IMPRENSA NACIONAL",
    "SERPRO",
    "DATAPREV",
    "FACEBOOK",
    "META PLATFORMS",
    "GOOGLE",
    "MICROSOFT",
    "AMAZON",
    "APPLE",
    "KALUNGA",
    "CASCOL COMBUSTIVEIS",
    "LOCALIZA RENT A CAR",
    "LOCALIZA FLEET",
    "MOVIDA LOCACAO",
]

RADICAIS_CNPJ_IGNORADOS = {
    "02012862",  # TAM / LATAM
    "07575651",  # GOL
    "09296295",  # AZUL
    "02558157",  # TELEFONICA / VIVO
    "40432544",  # CLARO
    "66970229",  # CLARO NXT / NEXTEL
    "02421421",  # TIM
    "76535764",  # OI
    "34028316",  # CORREIOS
    "04088208",  # SEM PARAR / CGMP
    "40154884",  # STARLINK
    "13347016",  # FACEBOOK BRASIL
    "06990590",  # GOOGLE BRASIL
    "43283811",  # KALUNGA
    "00306597",  # CASCOL COMBUSTIVEIS (Rede de postos DF)
}


def _eh_concessionaria_ou_bigtech(razao_social: str, cnpj_limpo: str = "") -> bool:
    if cnpj_limpo:
        if cnpj_limpo.startswith("000000") or len(set(cnpj_limpo)) <= 2:
            return True
        if len(cnpj_limpo) >= 8 and cnpj_limpo[:8] in RADICAIS_CNPJ_IGNORADOS:
            return True
    if not razao_social:
        return False
    nome_up = razao_social.upper()
    return any(termo in nome_up for termo in CONCESSIONARIAS_E_BIGTECHS_IGNORADAS)


async def consultar_contratos_cnpj_pncp(cnpj: str) -> list:
    """
    Consulta o Portal Nacional de Contratações Públicas (PNCP) buscando contratos
    firmados por um CNPJ específico com prefeituras, governos estaduais ou união.
    Inclui retentativa automática para tolerar oscilações do balanceador do PNCP.
    """
    cnpj_limpo = re.sub(r"\D", "", str(cnpj or ""))
    if len(cnpj_limpo) != 14:
        return []

    url = (
        f"https://pncp.gov.br/api/search/"
        f"?q={cnpj_limpo}&tipos_documento=contrato&pagina=1&tamanho_pagina=15"
    )
    for tentativa in range(3):
        try:
            async with httpx.AsyncClient(
                timeout=18.0, headers=HEADERS, verify=False
            ) as client:
                r = await client.get(url)
                if r.status_code == 200:
                    data = r.json()
                    return data.get("items", []) or []
                elif r.status_code == 429:
                    await asyncio.sleep(1.5 * (tentativa + 1))
        except Exception:
            if tentativa < 2:
                await asyncio.sleep(0.8 * (tentativa + 1))
            else:
                print(f"  [PNCP] Timeout após 3 tentativas no CNPJ {cnpj_limpo}")
    return []


async def sincronizar_contratos_pncp_deputado(
    db: Session, deputado_id: int, max_fornecedores: int = 20
) -> int:
    """
    Seleciona os maiores fornecedores privados da Cota Parlamentar (CEAP) do deputado
    e cruza com a base nacional de contratos públicos no PNCP (Prefeituras, Estados e União).
    """
    deputado = (
        db.query(models.Deputado).filter(models.Deputado.id == deputado_id).first()
    )
    if not deputado:
        return 0

    ranking_fornecedores = (
        db.query(
            models.DespesaCEAP.fornecedor_cnpj,
            func.sum(models.DespesaCEAP.valor).label("total_ceap"),
        )
        .filter(
            models.DespesaCEAP.deputado_id == deputado_id,
            models.DespesaCEAP.fornecedor_cnpj.isnot(None),
        )
        .group_by(models.DespesaCEAP.fornecedor_cnpj)
        .order_by(func.sum(models.DespesaCEAP.valor).desc())
        .all()
    )

    candidatos = []
    for cnpj_raw, total_ceap in ranking_fornecedores:
        cnpj_limpo = re.sub(r"\D", "", str(cnpj_raw or ""))
        if len(cnpj_limpo) != 14:
            continue

        forn = (
            db.query(models.Fornecedor)
            .filter(models.Fornecedor.cnpj == cnpj_raw)
            .first()
        )
        razao = forn.razao_social if forn and forn.razao_social else f"CNPJ {cnpj_limpo}"
        if _eh_concessionaria_ou_bigtech(razao, cnpj_limpo):
            continue

        candidatos.append((cnpj_raw, cnpj_limpo, razao, float(total_ceap or 0.0)))
        if len(candidatos) >= max_fornecedores:
            break

    # Remove registros antigos do deputado para atualizar
    db.query(models.ContratoPublicoPNCP).filter(
        models.ContratoPublicoPNCP.deputado_id == deputado_id
    ).delete(synchronize_session=False)
    db.commit()

    inseridos = 0
    controles_vistos = set()

    for cnpj_raw, cnpj_limpo, razao, _ in candidatos:
        items = await consultar_contratos_cnpj_pncp(cnpj_limpo)
        await asyncio.sleep(0.35)

        for item in items:
            forn_item_cnpj = re.sub(
                r"\D", "", str(item.get("fornecedor_cnpj") or item.get("ni_fornecedor") or "")
            )
            if forn_item_cnpj and forn_item_cnpj != cnpj_limpo:
                continue

            nome_forn_exibicao = item.get("fornecedor_nome") or razao
            if _eh_concessionaria_ou_bigtech(nome_forn_exibicao, cnpj_limpo):
                continue

            valor_global = float(item.get("valor_global") or 0.0)
            if valor_global <= 0:
                continue

            num_controle = str(item.get("numero_controle_pncp") or item.get("id") or "")
            chave_unica = f"{cnpj_limpo}_{num_controle}_{valor_global}"
            if chave_unica in controles_vistos:
                continue
            controles_vistos.add(chave_unica)

            orgao = (
                item.get("orgao_nome")
                or item.get("unidade_nome")
                or "Órgão Público não especificado"
            )
            uf_orgao = item.get("uf") or ""
            municipio_orgao = item.get("municipio_nome") or ""
            esfera = item.get("esfera_nome") or item.get("poder_nome") or "Executivo"
            objeto = (
                item.get("description")
                or item.get("title")
                or "Objeto contratual não detalhado"
            )
            if len(objeto) > 450:
                objeto = objeto[:447] + "..."

            data_ass = item.get("data_assinatura") or item.get("data_publicacao_pncp") or ""
            if data_ass and "T" in str(data_ass):
                data_ass = str(data_ass).split("T")[0]

            novo = models.ContratoPublicoPNCP(
                deputado_id=deputado_id,
                fornecedor_cnpj=cnpj_limpo,
                fornecedor_nome=nome_forn_exibicao,
                orgao_publico=orgao,
                uf_orgao=uf_orgao,
                municipio_orgao=municipio_orgao,
                esfera=esfera,
                objeto_contrato=objeto,
                valor_global=valor_global,
                data_assinatura=str(data_ass)[:20] if data_ass else None,
                numero_controle_pncp=num_controle,
            )
            db.add(novo)
            inseridos += 1

    db.commit()
    print(
        f"  [PNCP] Deputado {deputado.nome} ({deputado_id}): "
        f"{inseridos} contratos públicos encontrados em {len(candidatos)} fornecedores CEAP."
    )
    return inseridos
