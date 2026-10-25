"""
Motor de Detecção Forense do Vigilante Parlamentar (v6 - Expandido com 21 Heurísticas).

Audita a Cota para o Exercício da Atividade Parlamentar (CEAP) dos deputados federais
cruzando dados da Câmara dos Deputados, Receita Federal (BrasilAPI) e TSE (DivulgaCandContas).

Princípios Forenses Adotados:
  1. MATERIALIDADE: Pisos financeiros mínimos por regra para evitar falsos alarmes em quantias irrisórias.
  2. ISENÇÃO DE MONOPÓLIOS NATURAIS: Concessionárias públicas de energia, água, saneamento e gás são isentas.
  3. COMPANHIAS AÉREAS: Bilhetes corporativos da Câmara não geram falsos alarmes de duplicidade por reemissão de trechos,
     e notas zeradas (R$ 0,00 de créditos/glosas) são ignoradas.
  4. DETECÇÃO CRÍTICA & NOVAS REGRAS FORENSES:
     - Auditoria de QSA / Nepotismo (Sócios da empresa com parentesco/sobrenome do deputado)
     - Incompatibilidade Estrita de CNAE (Oficinas, salões de beleza, comércio de roupas faturando consultoria/divulgação)
     - Subcapitalização Crítica (Capital social <= R$ 2.000 emitindo notas vultosas em serviços intangíveis)
     - Conflito de Presença em Plenário (Gastos presenciais no estado de origem em dias de votações deliberativas)
     - Anomalia de Fim de Ano / "Queima de Cota" (Picos > 200% em nov/dez para esgotar a CEAP)
     - Rede / Cartel de Fornecedores Partidários (Mesmo fornecedor atendendo múltiplos deputados do mesmo partido)
  5. PONTUAÇÃO BALANCEADA: Índice de Risco de 0 a 100 com teto de 1,5x por regra reincidente.
"""
from collections import defaultdict
from datetime import datetime, timedelta
import re
import unicodedata

from sqlalchemy.orm import Session
import models

# ---------------------------------------------------------------------------
# PESOS FORENSES (Ponderação no Índice de Risco de 0 a 100)
# ---------------------------------------------------------------------------
PESOS = {
    "FORNECEDOR_SANCIONADO_CEIS_CNEP": 50,
    "EMENDA_FAVORECIDO_SANCIONADO_CGU": 50,
    "TRIANGULACAO_EMENDA_FORNECEDOR_CEAP": 50,
    "FORNECEDOR_CEAP_SUPERCONTRATO_EXECUTIVO": 45,
    "CARTEL_ENDERECO_OU_CONTATO_FORNECEDORES": 45,
    "REDE_SOCIETARIA_OCULTA_FORNECEDORES": 45,
    "NEPOTISMO_CRUZADO_INTERGABINETES": 45,
    "CONTAS_IRREGULARES_TCU": 45,
    "ASSESSOR_SOCIO_FORNECEDOR": 45,
    "ASSESSOR_DOADOR_CAMPANHA_TSE": 40,
    "COINCIDENCIA_TERRITORIAL_CONTRATO_EMENDA": 40,
    "VINCULO_SOCIETARIO_OU_NEPOTISMO": 40,
    "CLA_FAMILIAR_NO_GABINETE": 35,
    "SEDE_FANTASMA_OU_ENDERECO_INCONSISTENTE": 35,
    "QUID_PRO_QUO_DOADOR_CAMPANHA": 35,
    "VOLUME_CRITICO_EMENDA_PIX": 35,
    "NOTA_FISCAL_EMPRESA_EXTINTA": 45,
    "NOTA_FISCAL_DUPLICADA": 35,
    "EMPRESA_RECEM_CRIADA": 35,
    "ESTOURO_TETO_MEI": 35,
    "CNAE_INCOMPATIVEL_ESTRITO": 35,
    "CONFLITO_PRESENCA_PLENARIO": 35,
    "REDE_FORNECEDOR_PARTIDARIO": 30,
    "SUBCAPITALIZACAO_CRITICA": 30,
    "CAPITAL_SOCIAL_INCOMPATIVEL": 30,
    "TELETRANSPORTE_DISTANCIA_IMPOSSIVEL": 30,
    "COMBUSTIVEL_GRAVE": 30,
    "CONCENTRACAO_MUNICIPIO_EMENDA": 25,
    "QUEIMA_DE_COTA_FIM_DE_ANO": 25,
    "FRACIONAMENTO_DE_DESPESA": 20,
    "MONOPOLIO_SETORIAL": 20,
    "CNAE_INCOMPATIVEL": 20,
    "EMPRESA_BAIXADA_APOS_PAGAMENTOS": 15,
    "GASTOS_CONCORRENTES_MESMA_DATA": 15,
    "COMBUSTIVEL_DESPROPORCIONAL": 10,
    "POSSIVEL_DUPLICIDADE": 10,
    "PATRIMONIO_ELEVADO": 5,
}

SITUACOES_IRREGULARES = {"INAPTA", "BAIXADA", "SUSPENSA", "NULA"}

# Categorias com expectativa de concorrência aberta (serviços imateriais)
CATEGORIAS_SENSIVEIS = ("DIVULG", "CONSULT", "PESQUIS", "ASSESSORIA")

# Matriz estrita de CNAEs alheios a serviços intelectuais
CNAES_ALHEIOS_ESTRITOS = (
    "VESTUARIO", "ROUPA", "CALCADO", "TECIDO", "BELEZA", "CABELEIREIR", "ESTETICA",
    "MECANIC", "OFICINA", "AUTOPECAS", "REPARACAO DE VEICULO", "CONSTRU", "OBRA",
    "ALVENARIA", "TINTAS", "RESTAURANTE", "LANCHONETE", "BAR", "PADARIA", "ACOUGUE",
    "FARMAC", "DROGARIA", "COMBUSTIV", "LUBRIFIC"
)

# Concessionárias públicas isentas de monopólio e duplicidade trivial
CNAES_UTILIDADE = (
    "ENERGIA", "ELETRIC", "TELECOMUNIC", "TELEFON", "AGUA", "SANEAMENTO", "GAS",
    "ENEL", "EQUATORIAL", "CPFL", "LIGHT", "CEMIG", "COPEL", "CELESC", "NEOENERGIA",
    "ENERGISA", "SABESP", "COPASA", "SANEPAR", "CEDAE", "CLARO", "VIVO", "TIM", "OI S.A"
)

# Despesas presenciais físicas para verificação de teletransporte e simultaneidade
DESPESAS_PRESENCIAIS = ("COMBUST", "ALIMENT", "RESTAURANTE", "HOSPED", "HOTEL")

# Limites financeiros e parâmetros operacionais
MIN_VALOR_EXTINTA = 50.0
MIN_VALOR_DUPLICADA = 100.0
DIAS_EMPRESA_RECEM_CRIADA = 90
MIN_TOTAL_RECEM_CRIADA = 5_000.0
TETO_MEI_ALERTA = 50_000.0
CAPITAL_MAXIMO_SUSPEITO = 5_000.0
MIN_CONTRATO_CAPITAL = 15_000.0
MULTIPLO_CAPITAL = 10
JANELA_FRACIONAMENTO_DIAS = 7
MIN_NOTAS_FRACIONAMENTO = 3
MIN_TOTAL_FRACIONAMENTO = 5_000.0
PERCENTUAL_MONOPOLIO_GLOBAL = 30.0
MIN_TOTAL_COTA_MONOPOLIO = 15_000.0
MIN_VALOR_CNAE = 2_000.0
DIAS_BAIXA_APOS_PAGAMENTO = 180
MIN_TOTAL_BAIXA_APOS = 5_000.0
MIN_VALOR_POSSIVEL_DUPLICIDADE = 400.0
LIMITE_COMBUSTIVEL_NOTA = 600.0
LIMITE_COMBUSTIVEL_GRAVE = 1_500.0
LIMITE_COMBUSTIVEL_MENSAL_POSTO = 2_000.0
PATRIMONIO_LIMIAR = 10_000_000.0

# Sobrenomes comuns que sozinhos não indicam necessariamente nepotismo direto
SOBRENOMES_COMUNS = {"SILVA", "SANTOS", "SOUZA", "SOUSA", "OLIVEIRA", "PEREIRA", "LIMA", "CARVALHO", "FERREIRA", "RODRIGUES", "ALVES"}


def _brl(valor: float) -> str:
    return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _data_br(d) -> str:
    return d.strftime("%d/%m/%Y") if hasattr(d, "strftime") else str(d)


def _parse_data(texto):
    if not texto:
        return None
    try:
        return datetime.strptime(str(texto)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _normalizar(txt: str) -> str:
    if not txt:
        return ""
    nfkd = unicodedata.normalize('NFKD', txt.upper())
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


def _nome_fornecedor(d) -> str:
    if d and d.fornecedor_rel and d.fornecedor_rel.razao_social:
        return d.fornecedor_rel.razao_social
    return (d.fornecedor_cnpj if d else "") or "Fornecedor não informado"


def _fornecedor_confiavel(f) -> bool:
    return f is not None and (f.situacao_cadastral or "DESCONHECIDO") != "DESCONHECIDO"


def _eh_utilidade(f) -> bool:
    if not f:
        return False
    cnae = (f.cnae_fiscal_descricao or "").upper()
    nome = (f.razao_social or "").upper()
    return any(t in cnae or t in nome for t in CNAES_UTILIDADE)


def _num_doc_valido(num: str) -> bool:
    if not num:
        return False
    limpo = re.sub(r'[^A-Z0-9]', '', str(num).upper())
    return bool(limpo) and limpo not in {"0", "SN", "NONE", "NULL", "SEM", "NA"}


def _eh_cia_aerea(f, d=None) -> bool:
    tipo = (d.tipo_despesa or "").upper() if d else ""
    if any(k in tipo for k in ("PASSAGEM", "AEREA", "AÉREA", "SIGEPA")):
        return True
    nome = (f.razao_social or "").upper() if f else ""
    return any(c in nome for c in ("GOL LINHAS", "TAM LINHAS", "LATAM", "AZUL LINHAS", "VOEPASS", "PASSAREDO"))


def rodar_motor_heuristicas_por_deputado(db: Session, deputado_id: int):
    # Limpa alertas anteriores para recalcular
    db.query(models.Alerta).filter(models.Alerta.deputado_id == deputado_id).delete()

    dep = db.query(models.Deputado).filter(models.Deputado.id == deputado_id).first()
    if not dep:
        return

    # Despesas válidas
    despesas = [
        d for d in db.query(models.DespesaCEAP).filter(models.DespesaCEAP.deputado_id == dep.id).all()
        if (d.valor or 0.0) > 0.0
    ]
    alertas = []  # Tuplas: (tipo, severidade, descricao, valor, despesa_id)

    por_cnpj = defaultdict(list)
    for d in despesas:
        por_cnpj[d.fornecedor_cnpj].append(d)

    # -----------------------------------------------------------------------
    # 0. AUDITORIA MULTI-BASE: CGU (CEIS/CNEP/CEPIM), TCU, GABINETE E TSE
    # -----------------------------------------------------------------------
    # 0.1 Empresas Sancionadas / Inidôneas (CEIS/CNEP/CEPIM) e Contas Irregulares TCU
    for cnpj, lista in por_cnpj.items():
        sancoes = db.query(models.SancaoFornecedor).filter(models.SancaoFornecedor.cnpj == cnpj).all()
        if not sancoes:
            continue
        f = lista[0].fornecedor_rel
        nome_forn = f.razao_social if f and f.razao_social else cnpj
        total_pago = sum(d.valor for d in lista)

        sancoes_tcu = [s for s in sancoes if "TCU" in (s.cadastro or "").upper() or "TRIBUNAL DE CONTAS" in (s.orgao_sancionador or "").upper()]
        sancoes_cgu = [s for s in sancoes if s not in sancoes_tcu]

        if sancoes_cgu:
            s0 = sancoes_cgu[0]
            alertas.append((
                "FORNECEDOR_SANCIONADO_CEIS_CNEP", "ALTA",
                f"Fornecedor contratado com cota parlamentar ({nome_forn} - CNPJ {cnpj}) consta no {s0.cadastro} "
                f"({s0.categoria_sancao} — Órgão: {s0.orgao_sancionador}). Está formalmente proibido de licitar e contratar com o Poder Público. "
                f"Total recebido da CEAP: {_brl(total_pago)}.",
                total_pago, lista[0].id,
            ))

        if sancoes_tcu:
            st0 = sancoes_tcu[0]
            alertas.append((
                "CONTAS_IRREGULARES_TCU", "ALTA",
                f"Fornecedor ({nome_forn} - CNPJ {cnpj}) possui registro de inidoneidade / contas julgadas irregulares "
                f"por Tribunal de Contas ({st0.orgao_sancionador} — Processo {st0.numero_processo or 'S/N'}). "
                f"Pagamentos na cota somam {_brl(total_pago)}.",
                total_pago, lista[0].id,
            ))

    # 0.2 Cruzamento Folha de Gabinete (Secretários Parlamentares) vs. QSA da Receita Federal
    assessores_db = db.query(models.AssessorGabinete).filter(models.AssessorGabinete.deputado_id == dep.id).all()
    nomes_assessores_map = {_normalizar(a.nome): a for a in assessores_db if a.nome}

    if nomes_assessores_map:
        for cnpj, lista in por_cnpj.items():
            f = lista[0].fornecedor_rel
            if not f or not f.qsa_nomes or _eh_utilidade(f) or _eh_cia_aerea(f):
                continue
            socios = [s.strip() for s in f.qsa_nomes.split(",") if s.strip()]
            for soc in socios:
                soc_norm = _normalizar(soc)
                if soc_norm in nomes_assessores_map:
                    assessor_obj = nomes_assessores_map[soc_norm]
                    total = sum(d.valor for d in lista)
                    alertas.append((
                        "ASSESSOR_SOCIO_FORNECEDOR", "ALTA",
                        f"Sócio ou administrador da empresa contratada ({f.razao_social}), Sr(a). {assessor_obj.nome}, "
                        f"exerce cargo comissionado ({assessor_obj.cargo}) no gabinete do próprio deputado contratante ({dep.nome}). "
                        f"Faturamento via CEAP: {_brl(total)}.",
                        total, lista[0].id,
                    ))
                    break

    # 0.3 Cruzamento Doações e Fornecedores de Campanha Eleitoral (TSE) vs. Fornecedores CEAP (Quid Pro Quo)
    doacoes_db = db.query(models.DoacaoCampanha).filter(models.DoacaoCampanha.deputado_id == dep.id).all()
    if doacoes_db:
        doadores_por_doc = {d.cpf_cnpj_doador: d for d in doacoes_db if d.cpf_cnpj_doador}
        doadores_por_nome = {_normalizar(d.nome_doador): d for d in doacoes_db if d.nome_doador}

        for cnpj, lista in por_cnpj.items():
            f = lista[0].fornecedor_rel
            if _eh_utilidade(f) or _eh_cia_aerea(f):
                continue
            total_ceap = sum(d.valor for d in lista)
            nome_forn = f.razao_social if f and f.razao_social else cnpj

            # Match direto por CNPJ (doador ou fornecedor de campanha que passou a receber da CEAP)
            if cnpj in doadores_por_doc:
                d_tse = doadores_por_doc[cnpj]
                alertas.append((
                    "QUID_PRO_QUO_DOADOR_CAMPANHA", "ALTA" if d_tse.tipo_recurso == "DOADOR_CAMPANHA" else "MEDIA",
                    f"Vínculo eleitoral TSE detectado: o fornecedor {nome_forn} (CNPJ {cnpj}) atuou diretamente na campanha eleitoral de 2022 "
                    f"do parlamentar ({d_tse.tipo_recurso.replace('_', ' ')}: {_brl(d_tse.valor)}) e, após a posse, recebeu {_brl(total_ceap)} "
                    f"em reembolsos da Cota Parlamentar (CEAP).",
                    total_ceap, lista[0].id,
                ))
                continue

            # Match indireto: Pessoa Física Doadora de Campanha que é Sócia (QSA) da empresa contratada na CEAP
            if f and f.qsa_nomes:
                socios = [s.strip() for s in f.qsa_nomes.split(",") if s.strip()]
                for soc in socios:
                    soc_norm = _normalizar(soc)
                    if soc_norm in doadores_por_nome:
                        d_tse = doadores_por_nome[soc_norm]
                        alertas.append((
                            "QUID_PRO_QUO_DOADOR_CAMPANHA", "ALTA",
                            f"Retorno de campanha (Quid Pro Quo): o sócio {soc} da empresa contratada {nome_forn} "
                            f"foi financiador direto da campanha eleitoral do parlamentar no TSE ({_brl(d_tse.valor)}) e sua empresa "
                            f"passou a faturar {_brl(total_ceap)} na cota parlamentar.",
                            total_ceap, lista[0].id,
                        ))
                        break

    # -----------------------------------------------------------------------
    # 1. AUDITORIA DE QUADRO SOCIETÁRIO (QSA) VS. DEPUTADO (NEPOTISMO / AUTOCONTRATAÇÃO) (ALTA)
    # -----------------------------------------------------------------------
    nome_dep_completo = _normalizar(dep.nome_civil or dep.nome)
    partes_dep = [p for p in nome_dep_completo.split() if len(p) > 2 and p not in {"DOS", "DAS", "DA", "DE", "DO"}]
    sobrenomes_dep = [p for p in partes_dep[1:] if p not in SOBRENOMES_COMUNS]

    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        if not f or not f.qsa_nomes:
            continue
        socios = [s.strip() for s in f.qsa_nomes.split(",") if s.strip()]
        for soc in socios:
            soc_norm = _normalizar(soc)
            # Match exato de nome civil ou compartilhamento de sobrenome raro/familiar
            if soc_norm == nome_dep_completo:
                total = sum(d.valor for d in lista)
                alertas.append((
                    "VINCULO_SOCIETARIO_OU_NEPOTISMO", "ALTA",
                    f"Autocontratação detectada: o sócio da empresa {f.razao_social} no QSA da Receita Federal ({soc}) "
                    f"possui o mesmo nome civil do parlamentar. Faturamento acumulado de {_brl(total)}.",
                    total, lista[0].id,
                ))
                break
            elif any(sn in soc_norm.split() for sn in sobrenomes_dep) and not _eh_utilidade(f) and not _eh_cia_aerea(f):
                total = sum(d.valor for d in lista)
                if total >= 3_000.0:
                    alertas.append((
                        "VINCULO_SOCIETARIO_OU_NEPOTISMO", "ALTA",
                        f"Indício de nepotismo / favorecimento: o sócio {soc} da empresa {f.razao_social} "
                        f"compartilha sobrenome familiar direto com o parlamentar ({dep.nome}). "
                        f"Contratos somam {_brl(total)} na cota pública.",
                        total, lista[0].id,
                    ))
                    break

    # -----------------------------------------------------------------------
    # 2. INCOMPATIBILIDADE ESTRITA DE CNAE VS. TIPO DE DESPESA (ALTA)
    # -----------------------------------------------------------------------
    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        if not _fornecedor_confiavel(f):
            continue
        cnae_texto = _normalizar(f"{f.cnae_fiscal_descricao or ''} {f.cnaes_secundarios or ''}")
        sensiveis = [d for d in lista if any(c in (d.tipo_despesa or "").upper() for c in CATEGORIAS_SENSIVEIS)]
        if sensiveis and any(alheio in cnae_texto for alheio in CNAES_ALHEIOS_ESTRITOS):
            total = sum(d.valor for d in sensiveis)
            if total >= MIN_VALOR_CNAE:
                alertas.append((
                    "CNAE_INCOMPATIVEL_ESTRITO", "ALTA",
                    f"Incompatibilidade estrita: {_brl(total)} faturados como '{sensiveis[0].tipo_despesa.strip()}', "
                    f"mas o CNAE da empresa {f.razao_social} na Receita Federal é '{f.cnae_fiscal_descricao}'. "
                    f"Ramo incompatível com a execução de serviços intelectuais.",
                    total, sensiveis[0].id,
                ))

    # -----------------------------------------------------------------------
    # 3. SUBCAPITALIZAÇÃO CRÍTICA (CAPITAL SOCIAL IRRISÓRIO COM NOTA VULTOSA) (ALTA)
    # -----------------------------------------------------------------------
    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        if not _fornecedor_confiavel(f) or f.capital_social is None:
            continue
        sensiveis = [d for d in lista if any(c in (d.tipo_despesa or "").upper() for c in CATEGORIAS_SENSIVEIS)]
        if not sensiveis:
            continue
        total = sum(d.valor for d in sensiveis)
        maior_nota = max(d.valor for d in sensiveis)
        capital = f.capital_social
        if capital <= 2_000.0 and (maior_nota >= 15_000.0 or total >= 25_000.0):
            alertas.append((
                "SUBCAPITALIZACAO_CRITICA", "ALTA",
                f"Subcapitalização crítica: {f.razao_social} possui capital social de apenas {_brl(capital)}, "
                f"mas emitiu nota de {_brl(maior_nota)} em serviços discricionários ({maior_nota / max(capital, 1):.0f}x o capital formal da empresa).",
                total, sensiveis[0].id,
            ))

    # -----------------------------------------------------------------------
    # 4. CONFLITO DE PRESENÇA EM PLENÁRIO (SESSÕES DELIBERATIVAS DA CÂMARA) (ALTA)
    # -----------------------------------------------------------------------
    # Terças e quartas-feiras em período legislativo (fevereiro a junho, agosto a dezembro)
    for d in despesas:
        if d.data and d.data.weekday() in (1, 2):  # 1 = Terça, 2 = Quarta
            if d.data.month not in (1, 7):  # Fora do recesso parlamentar
                tipo = (d.tipo_despesa or "").upper()
                if any(p in tipo for p in DESPESAS_PRESENCIAIS):
                    f = d.fornecedor_rel
                    uf_forn = (f.uf or "").strip().upper() if f else ""
                    if uf_forn and uf_forn not in {"DF", "GO"} and not _eh_cia_aerea(f, d):
                        alertas.append((
                            "CONFLITO_PRESENCA_PLENARIO", "ALTA",
                            f"Despesa presencial ({tipo.lower()}) de {_brl(d.valor)} em {_data_br(d.data)} "
                            f"registrada em {f.municipio}/{uf_forn} em dia típico de votação e sessão deliberativa presencial em Brasília (DF).",
                            d.valor, d.id,
                        ))
                        break  # Sinaliza uma ocorrência emblemática

    # -----------------------------------------------------------------------
    # 5. ANOMALIA DE FIM DE ANO / "QUEIMA DE COTA" EM NOVEMBRO E DEZEMBRO (MÉDIA)
    # -----------------------------------------------------------------------
    por_mes_intangivel = defaultdict(float)
    primeira_desp_nov_dez = None
    for d in despesas:
        if d.data:
            tipo = (d.tipo_despesa or "").upper()
            if any(k in tipo for k in CATEGORIAS_SENSIVEIS) or "IMPRESS" in tipo or "LOCA" in tipo:
                ano_mes = d.data.strftime("%Y-%m")
                por_mes_intangivel[ano_mes] += d.valor
                if d.data.month in (11, 12) and not primeira_desp_nov_dez:
                    primeira_desp_nov_dez = d

    meses_regulares = [v for k, v in por_mes_intangivel.items() if int(k.split("-")[1]) <= 10]
    meses_fim_ano = [v for k, v in por_mes_intangivel.items() if int(k.split("-")[1]) in (11, 12)]
    if meses_regulares and meses_fim_ano:
        media_regular = sum(meses_regulares) / len(meses_regulares)
        pico_fim_ano = max(meses_fim_ano)
        if pico_fim_ano >= 20_000.0 and pico_fim_ano >= (media_regular * 3.0):
            alertas.append((
                "QUEIMA_DE_COTA_FIM_DE_ANO", "MEDIA",
                f"Pico de gastos de fim de ano ('queima de cota'): no encerramento do exercício, os gastos discricionários atingiram "
                f"{_brl(pico_fim_ano)}, um salto de mais de {(pico_fim_ano / max(media_regular, 1) - 1) * 100:.0f}% em relação à média mensal regular ({_brl(media_regular)}).",
                pico_fim_ano, primeira_desp_nov_dez.id if primeira_desp_nov_dez else None,
            ))

    # -----------------------------------------------------------------------
    # 6. CONCENTRAÇÃO DE FORNECEDOR ENTRE MÚLTIPLOS DEPUTADOS (REDE PARTIDÁRIA) (ALTA)
    # -----------------------------------------------------------------------
    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        if _eh_utilidade(f) or _eh_cia_aerea(f):
            continue
        # Verifica no banco local quantos deputados do mesmo partido contratam esse mesmo CNPJ
        outros_deps = db.query(models.Deputado).join(models.DespesaCEAP).filter(
            models.DespesaCEAP.fornecedor_cnpj == cnpj,
            models.Deputado.partido == dep.partido,
            models.Deputado.id != dep.id
        ).distinct().all()

        if len(outros_deps) >= 2:
            total_deste_dep = sum(d.valor for d in lista)
            alertas.append((
                "REDE_FORNECEDOR_PARTIDARIO", "ALTA",
                f"Fornecedor compartilhado em rede partidária: {f.razao_social} atende simultaneamente {len(outros_deps) + 1} "
                f"parlamentares do mesmo partido ({dep.partido}). Padrão de concentração de contratos em consultoria/marketing partidário.",
                total_deste_dep, lista[0].id,
            ))
            break

    # -----------------------------------------------------------------------
    # 7. SITUAÇÃO CADASTRAL IRREGULAR (BAIXADA, INAPTA, SUSPENSA OU NULA) (ALTA)
    # -----------------------------------------------------------------------
    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        if not _fornecedor_confiavel(f) or f.situacao_cadastral not in SITUACOES_IRREGULARES:
            continue
        data_sit = _parse_data(f.data_situacao_cadastral)
        if data_sit:
            apos = [d for d in lista if d.data and d.data > data_sit]
            total_apos = sum(d.valor for d in apos)
            if apos and total_apos >= MIN_VALOR_EXTINTA:
                alertas.append((
                    "NOTA_FISCAL_EMPRESA_EXTINTA", "ALTA",
                    f"{len(apos)} nota(s) fiscal(is) somando {_brl(total_apos)} emitida(s) por "
                    f"{f.razao_social} DEPOIS de a empresa constar como {f.situacao_cadastral} "
                    f"na Receita Federal (desde {_data_br(data_sit)}). Indício grave de nota fiscal fria ou empresa fantasma.",
                    total_apos, apos[0].id,
                ))
                continue

            total = sum(d.valor for d in lista)
            datas_com_valor = [d.data for d in lista if d.data]
            if datas_com_valor and total >= MIN_TOTAL_BAIXA_APOS:
                ultima = max(datas_com_valor)
                if timedelta(0) <= (data_sit - ultima) <= timedelta(days=DIAS_BAIXA_APOS_PAGAMENTO):
                    alertas.append((
                        "EMPRESA_BAIXADA_APOS_PAGAMENTOS", "MEDIA",
                        f"{f.razao_social} recebeu {_brl(total)} da cota e passou a constar como {f.situacao_cadastral} "
                        f"em {_data_br(data_sit)}, apenas {(data_sit - ultima).days} dias após o último pagamento.",
                        total, lista[-1].id,
                    ))
        else:
            total = sum(d.valor for d in lista)
            if total >= MIN_VALOR_EXTINTA:
                alertas.append((
                    "NOTA_FISCAL_EMPRESA_EXTINTA", "ALTA",
                    f"{f.razao_social} consta com situação cadastral '{f.situacao_cadastral}' na Receita Federal, "
                    f"tendo faturado {_brl(total)} em {len(lista)} nota(s) fiscal(is) junto ao parlamentar.",
                    total, lista[0].id,
                ))

    # -----------------------------------------------------------------------
    # 8. EMPRESA RECÉM-CRIADA / CASULO SOB DEMANDA (ALTA)
    # -----------------------------------------------------------------------
    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        if not _fornecedor_confiavel(f) or not f.data_inicio_atividade:
            continue
        data_fundacao = _parse_data(f.data_inicio_atividade)
        if not data_fundacao:
            continue
        datas_validas = [d.data for d in lista if d.data]
        if not datas_validas:
            continue
        primeira_nota = min(datas_validas)
        total = sum(d.valor for d in lista)
        delta_dias = (primeira_nota - data_fundacao).days
        if 0 <= delta_dias <= DIAS_EMPRESA_RECEM_CRIADA and total >= MIN_TOTAL_RECEM_CRIADA:
            alertas.append((
                "EMPRESA_RECEM_CRIADA", "ALTA",
                f"{f.razao_social} foi fundada na Receita Federal em {_data_br(data_fundacao)}, "
                f"apenas {delta_dias} dias antes do primeiro pagamento pelo parlamentar ({_data_br(primeira_nota)}), "
                f"acumulando {_brl(total)} faturados. Padrão de empresa casulo criada sob demanda para captar verba pública.",
                total, lista[0].id,
            ))

    # -----------------------------------------------------------------------
    # 9. ESTOURO DO TETO DE MEI VIA COTA PÚBLICA (ALTA)
    # -----------------------------------------------------------------------
    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        if not _fornecedor_confiavel(f) or not getattr(f, "opcao_pelo_mei", False):
            continue
        total = sum(d.valor for d in lista)
        if total >= TETO_MEI_ALERTA:
            pct_teto = (total / 81_000.0) * 100
            alertas.append((
                "ESTOURO_TETO_MEI", "ALTA",
                f"{f.razao_social} opera no regime MEI (teto anual legal de R$ 81.000,00) "
                f"e recebeu {_brl(total)} deste único parlamentar ({pct_teto:.0f}% do limite nacional anual). "
                f"Indício forte de contratação contínua de pessoa física disfarçada de PJ ou burla tributária.",
                total, lista[0].id,
            ))

    # -----------------------------------------------------------------------
    # 10. TELETRANSPORTE ESPAÇO-TEMPORAL (> 800 KM) (ALTA)
    # -----------------------------------------------------------------------
    por_data_presencial = defaultdict(list)
    for d in despesas:
        tipo = (d.tipo_despesa or "").upper()
        if any(p in tipo for p in DESPESAS_PRESENCIAIS) and d.data:
            f = d.fornecedor_rel
            uf_forn = (f.uf or "").strip().upper() if f else ""
            if uf_forn and not _eh_cia_aerea(f, d):
                por_data_presencial[d.data].append((d, uf_forn, f.municipio or ""))

    datas_alertadas_teletransporte = set()
    for data, itens in por_data_presencial.items():
        ufs = {item[1] for item in itens}
        if len(ufs) > 1 and data not in datas_alertadas_teletransporte:
            d1, uf1, mun1 = itens[0]
            d2, uf2, mun2 = next(item for item in itens if item[1] != uf1)
            fronteira_imediata = (uf1 in {"DF", "GO"} and uf2 in {"DF", "GO"})
            if not fronteira_imediata:
                datas_alertadas_teletransporte.add(data)
                valor_envolvido = d1.valor + d2.valor
                alertas.append((
                    "TELETRANSPORTE_DISTANCIA_IMPOSSIVEL", "ALTA",
                    f"Despesas presenciais registradas na mesma data ({_data_br(data)}) em estados distantes (> 800 km): "
                    f"{_nome_fornecedor(d1)} em {mun1}/{uf1} ({_brl(d1.valor)}) e "
                    f"{_nome_fornecedor(d2)} em {mun2}/{uf2} ({_brl(d2.valor)}). "
                    f"Indício de teletransporte físico ou cessão de cota para uso de terceiros.",
                    valor_envolvido, d1.id,
                ))

    # -----------------------------------------------------------------------
    # 11. SIMULTANEIDADE GEOGRÁFICA / GASTOS CONCORRENTES (MÉDIA)
    # -----------------------------------------------------------------------
    for data, itens in por_data_presencial.items():
        if data in datas_alertadas_teletransporte or len(itens) < 2:
            continue
        cidades = {f"{item[2]}/{item[1]}".strip("/") for item in itens if item[2]}
        if len(cidades) > 1:
            d1 = itens[0][0]
            val_total = sum(item[0].valor for item in itens)
            alertas.append((
                "GASTOS_CONCORRENTES_MESMA_DATA", "MEDIA",
                f"Despesas presenciais simultâneas registradas na mesma data ({_data_br(data)}) em municípios distintos: "
                f"{', '.join(list(cidades)[:3])}, somando {_brl(val_total)}. Recomenda-se conferência dos canhotos originais.",
                val_total, d1.id,
            ))
            break

    # -----------------------------------------------------------------------
    # 12. NOTA FISCAL DUPLICADA (ALTA) & POSSÍVEL DUPLICIDADE (BAIXA)
    # -----------------------------------------------------------------------
    ja_duplicadas = set()
    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        if _eh_cia_aerea(f, lista[0] if lista else None):
            continue
        por_num = defaultdict(list)
        for d in lista:
            num = (d.num_documento or "").strip()
            if _num_doc_valido(num):
                por_num[num].append(d)
        for num, grupo in por_num.items():
            total = sum(d.valor for d in grupo)
            if len(grupo) > 1 and total >= MIN_VALOR_DUPLICADA and max(d.valor for d in grupo) >= MIN_VALOR_DUPLICADA:
                ja_duplicadas.update(d.id for d in grupo)
                alertas.append((
                    "NOTA_FISCAL_DUPLICADA", "ALTA",
                    f"O documento fiscal nº {num} emitido por {_nome_fornecedor(grupo[0])} foi apresentado "
                    f"{len(grupo)} vezes para reembolso, somando {_brl(total)}. Cobrança duplicada pelo mesmo fato gerador.",
                    total, grupo[0].id,
                ))

    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        if _eh_utilidade(f) or _eh_cia_aerea(f, lista[0] if lista else None):
            continue
        grupos = defaultdict(list)
        for d in lista:
            if d.id not in ja_duplicadas:
                grupos[(d.data, round(d.valor, 2))].append(d)
        for (data, valor), grupo in grupos.items():
            if len(grupo) > 1 and valor >= MIN_VALOR_POSSIVEL_DUPLICIDADE:
                alertas.append((
                    "POSSIVEL_DUPLICIDADE", "BAIXA",
                    f"{len(grupo)} notas de {_brl(valor)} emitidas por {_nome_fornecedor(grupo[0])} na mesma data "
                    f"({_data_br(data)}), com números de documento divergentes. Recomenda-se conferência dos comprovantes.",
                    valor * len(grupo), grupo[0].id,
                ))

    # -----------------------------------------------------------------------
    # 13. FRACIONAMENTO SUSPEITO DE DESPESA (MÉDIA)
    # -----------------------------------------------------------------------
    for cnpj, lista in por_cnpj.items():
        f = lista[0].fornecedor_rel
        candidatas = sorted(
            [d for d in lista if d.data and "COMBUST" not in (d.tipo_despesa or "").upper()],
            key=lambda d: d.data,
        )
        if _eh_utilidade(f) or _eh_cia_aerea(f, candidatas[0] if candidatas else None) or len(candidatas) < MIN_NOTAS_FRACIONAMENTO:
            continue
        inicio = 0
        melhor = []
        for fim in range(len(candidatas)):
            while (candidatas[fim].data - candidatas[inicio].data).days > JANELA_FRACIONAMENTO_DIAS:
                inicio += 1
            janela = candidatas[inicio:fim + 1]
            if len(janela) >= MIN_NOTAS_FRACIONAMENTO and sum(d.valor for d in janela) > sum(d.valor for d in melhor):
                melhor = janela
        total = sum(d.valor for d in melhor)
        if melhor and total >= MIN_TOTAL_FRACIONAMENTO:
            alertas.append((
                "FRACIONAMENTO_DE_DESPESA", "MEDIA",
                f"{len(melhor)} notas fiscais emitidas por {_nome_fornecedor(melhor[0])} em intervalo de {JANELA_FRACIONAMENTO_DIAS} dias "
                f"({_data_br(melhor[0].data)} a {_data_br(melhor[-1].data)}), totalizando {_brl(total)}. "
                f"Padrão compatível com divisão deliberada de compras para contornar cotações e fiscalização.",
                total, melhor[0].id,
            ))

    # -----------------------------------------------------------------------
    # 14. MONOPÓLIO SETORIAL / CONCENTRAÇÃO ORÇAMENTÁRIA (> 30% DA COTA) (MÉDIA)
    # -----------------------------------------------------------------------
    despesas_concorrenciais = [
        d for d in despesas if not _eh_cia_aerea(d.fornecedor_rel, d) and not _eh_utilidade(d.fornecedor_rel)
    ]
    total_cota_concorrencial = sum(d.valor for d in despesas_concorrenciais)

    if total_cota_concorrencial >= MIN_TOTAL_COTA_MONOPOLIO:
        por_forn_total = defaultdict(float)
        primeira_desp_forn = {}
        for d in despesas_concorrenciais:
            por_forn_total[d.fornecedor_cnpj] += d.valor
            if d.fornecedor_cnpj not in primeira_desp_forn:
                primeira_desp_forn[d.fornecedor_cnpj] = d

        for cnpj, total_pago in por_forn_total.items():
            pct_global = (total_pago / total_cota_concorrencial) * 100
            if pct_global >= PERCENTUAL_MONOPOLIO_GLOBAL:
                d_ref = primeira_desp_forn[cnpj]
                nome = _nome_fornecedor(d_ref)
                alertas.append((
                    "MONOPOLIO_SETORIAL", "MEDIA",
                    f"{nome} concentrou {pct_global:.0f}% de toda a cota parlamentar auditada do deputado "
                    f"({_brl(total_pago)} de {_brl(total_cota_concorrencial)}). Concentração superior ao teto de 30% em fornecedor único.",
                    total_pago, d_ref.id,
                ))

    # -----------------------------------------------------------------------
    # 15. COMBUSTÍVEL: NOTA ÚNICA > R$ 600 / GRAVE > R$ 1.500 / MÊS > R$ 2.000
    # -----------------------------------------------------------------------
    despesas_combustivel = [d for d in despesas if "COMBUST" in (d.tipo_despesa or "").upper()]
    altas_graves = [d for d in despesas_combustivel if d.valor > LIMITE_COMBUSTIVEL_GRAVE]
    altas_moderadas = [d for d in despesas_combustivel if LIMITE_COMBUSTIVEL_NOTA < d.valor <= LIMITE_COMBUSTIVEL_GRAVE]

    if altas_graves:
        maior = max(altas_graves, key=lambda d: d.valor)
        total = sum(d.valor for d in altas_graves)
        alertas.append((
            "COMBUSTIVEL_GRAVE", "ALTA",
            f"{len(altas_graves)} abastecimento(s) com valor superior a {_brl(LIMITE_COMBUSTIVEL_GRAVE)} em nota única "
            f"(maior: {_brl(maior.valor)} em {_data_br(maior.data)}). Volume físico incompatível com qualquer tanque individual, "
            f"indicando abastecimento de terceiros não declarados ou irregularidade contábil.",
            total, maior.id,
        ))

    if altas_moderadas and not altas_graves:
        maior = max(altas_moderadas, key=lambda d: d.valor)
        total = sum(d.valor for d in altas_moderadas)
        alertas.append((
            "COMBUSTIVEL_DESPROPORCIONAL", "MEDIA",
            f"{len(altas_moderadas)} abastecimento(s) individual(is) entre {_brl(LIMITE_COMBUSTIVEL_NOTA)} e {_brl(LIMITE_COMBUSTIVEL_GRAVE)} "
            f"(maior: {_brl(maior.valor)} em {_data_br(maior.data)}). Quantia superior ao tanque de um veículo convencional de passeio.",
            total, maior.id,
        ))

    por_posto_mes = defaultdict(lambda: defaultdict(list))
    for d in despesas_combustivel:
        if d.data:
            chave_mes = d.data.strftime("%Y-%m")
            por_posto_mes[d.fornecedor_cnpj][chave_mes].append(d)

    for cnpj_posto, meses in por_posto_mes.items():
        for mes_str, notas_mes in meses.items():
            tot_mes = sum(n.valor for n in notas_mes)
            if tot_mes >= LIMITE_COMBUSTIVEL_MENSAL_POSTO and len(notas_mes) >= 3 and not altas_graves:
                p_ref = notas_mes[0]
                alertas.append((
                    "COMBUSTIVEL_DESPROPORCIONAL", "BAIXA",
                    f"Consumo de {_brl(tot_mes)} em combustível concentrado em um único posto ({_nome_fornecedor(p_ref)}) "
                    f"no mês {mes_str} ({len(notas_mes)} abastecimentos). Volume que excede o padrão de uso individual rotineiro.",
                    tot_mes, p_ref.id,
                ))
                break

    # -----------------------------------------------------------------------
    # 16. EVOLUÇÃO DE BENS VS PATRIMÔNIO DECLARADO ELEVADO NO TSE (BAIXA)
    # -----------------------------------------------------------------------
    if dep.patrimonio_declarado and dep.patrimonio_declarado > PATRIMONIO_LIMIAR:
        alertas.append((
            "PATRIMONIO_ELEVADO", "BAIXA",
            f"Patrimônio pessoal declarado à Justiça Eleitoral (TSE 2022) de {_brl(dep.patrimonio_declarado)}. "
            f"O valor não configura ilícito em si, mas serve como parâmetro oficial para cotejamento de compatibilidade econômico-financeira.",
            dep.patrimonio_declarado, None,
        ))

    # -----------------------------------------------------------------------
    # 17. BLOCO EMENDAS PIX & FAVORECIDOS SANCIONADOS NA CGU (ALTA / MÉDIA)
    # -----------------------------------------------------------------------
    emendas_dep = db.query(models.EmendaParlamentar).filter(models.EmendaParlamentar.deputado_id == dep.id).all()
    favorecidos_dep = db.query(models.FavorecidoEmenda).filter(models.FavorecidoEmenda.deputado_id == dep.id).all()

    # 17a. Empresa sancionada no CEIS/CNEP da CGU recebendo verba de Emenda Parlamentar
    fav_sancionados = [f for f in favorecidos_dep if f.sancionado_cgu and (f.valor_recebido or 0) >= 500.0]
    fav_sancionados.sort(key=lambda x: x.valor_recebido or 0.0, reverse=True)
    for fv in fav_sancionados[:3]:
        alertas.append((
            "EMENDA_FAVORECIDO_SANCIONADO_CGU", "ALTA",
            f"Empresa/entidade favorecida por Emenda Parlamentar do deputado ({fv.nome_favorecido} - CNPJ {fv.cnpj_favorecido}, "
            f"localizada em {fv.municipio}/{fv.uf}) recebeu {_brl(fv.valor_recebido)} de recursos orçamentários federais e "
            f"consta sancionada na lista negra da CGU ({fv.detalhe_sancao}).",
            fv.valor_recebido, None,
        ))

    # 17b. Triangulação entre Emenda Parlamentar e Fornecedor da Cota (CEAP)
    cnpjs_ceap_totais = defaultdict(float)
    for d in despesas:
        if d.fornecedor_cnpj:
            cnpjs_ceap_totais[re.sub(r"[^0-9]", "", d.fornecedor_cnpj)] += d.valor

    for fv in favorecidos_dep:
        cnpj_limpo = re.sub(r"[^0-9]", "", fv.cnpj_favorecido or "")
        if cnpj_limpo and cnpj_limpo in cnpjs_ceap_totais:
            tot_ceap = cnpjs_ceap_totais[cnpj_limpo]
            alertas.append((
                "TRIANGULACAO_EMENDA_FORNECEDOR_CEAP", "ALTA",
                f"Triangulação de Verba Pública detectada: {fv.nome_favorecido} (CNPJ {fv.cnpj_favorecido}) recebeu "
                f"{_brl(fv.valor_recebido)} oriundos de Emendas Parlamentares do deputado e simultaneamente faturou "
                f"{_brl(tot_ceap)} diretamente na Cota Parlamentar (CEAP) do gabinete.",
                fv.valor_recebido + tot_ceap, None,
            ))

    # 17c. Volume elevado de Emendas PIX (Transferências Especiais sem projeto vinculado)
    emendas_pix = [e for e in emendas_dep if "ESPECIAIS" in (e.tipo_emenda or "").upper()]
    if emendas_pix:
        tot_pix_emp = sum(e.valor_empenhado or 0.0 for e in emendas_pix)
        tot_pix_pago = sum(e.valor_pago or 0.0 for e in emendas_pix)
        if tot_pix_emp >= 5_000_000.0:
            sev_pix = "ALTA" if tot_pix_emp >= 20_000_000.0 else "MEDIA"
            locais_pix = sorted({e.localidade for e in emendas_pix if e.localidade and "MULTIPLO" not in e.localidade.upper() and "MÚLTIPLO" not in e.localidade.upper()})
            locais_txt = f" (destinos diretos incluem: {', '.join(locais_pix[:4])})" if locais_pix else ""
            alertas.append((
                "VOLUME_CRITICO_EMENDA_PIX", sev_pix,
                f"Parlamentar destinou {_brl(tot_pix_emp)} ({_brl(tot_pix_pago)} já pagos) por meio de {len(emendas_pix)} "
                f"'Transferências Especiais' (Emendas PIX){locais_txt}. Modalidade de repasse direto a entes subnacionais sem "
                f"vinculação prévia a convênio ou projeto específico, sob auditoria prioritária do STF, TCU e CGU.",
                tot_pix_emp, None,
            ))

    # 17d. Concentração Geográfica de Emendas em Reduto Único
    por_mun_emenda = defaultdict(float)
    for fv in favorecidos_dep:
        if fv.municipio and fv.uf and fv.municipio.upper() not in ("BRASILIA", "MULTIPLO", "SEM INFORMACAO"):
            chave_mun = f"{fv.municipio}/{fv.uf}"
            por_mun_emenda[chave_mun] += fv.valor_recebido or 0.0

    tot_fav_localizado = sum(por_mun_emenda.values())
    if tot_fav_localizado >= 1_000_000.0 and len(por_mun_emenda) >= 2:
        mun_top, val_top = max(por_mun_emenda.items(), key=lambda x: x[1])
        pct_mun = (val_top / tot_fav_localizado) * 100
        if pct_mun >= 55.0:
            alertas.append((
                "CONCENTRACAO_MUNICIPIO_EMENDA", "MEDIA",
                f"Concentração geográfica de emendas: o município de {mun_top} absorveu {pct_mun:.0f}% "
                f"({_brl(val_top)} de {_brl(tot_fav_localizado)}) dos recursos rastreados por favorecido deste parlamentar.",
                val_top, None,
            ))

    # -----------------------------------------------------------------------
    # 18. BLOCO 2: GRANDES CONTRATOS PÚBLICOS NO PNCP (PREFEITURAS / ESTADOS / UNIÃO)
    # -----------------------------------------------------------------------
    contratos_pncp = db.query(models.ContratoPublicoPNCP).filter(
        models.ContratoPublicoPNCP.deputado_id == dep.id
    ).all()

    if contratos_pncp:
        por_forn_pncp = defaultdict(list)
        for c in contratos_pncp:
            por_forn_pncp[c.fornecedor_cnpj].append(c)

        # 18a. Fornecedor da Cota Parlamentar com Supercontratos no Executivo (PNCP)
        ranking_pncp = sorted(
            por_forn_pncp.items(),
            key=lambda kv: sum(x.valor_global or 0.0 for x in kv[1]),
            reverse=True,
        )
        for cnpj_pncp, lista_c in ranking_pncp[:3]:
            soma_pncp = sum(x.valor_global or 0.0 for x in lista_c)
            if soma_pncp >= 150_000.0:
                sev_pncp = "ALTA" if soma_pncp >= 1_000_000.0 else "MEDIA"
                nome_f = lista_c[0].fornecedor_nome
                tot_ceap_f = cnpjs_ceap_totais.get(re.sub(r"\D", "", cnpj_pncp), 0.0)
                orgaos_distintos = list(dict.fromkeys(
                    f"{x.orgao_publico} ({x.municipio_orgao}/{x.uf_orgao})" if x.municipio_orgao else x.orgao_publico
                    for x in lista_c
                ))
                resumo_orgaos = ", ".join(orgaos_distintos[:3])
                alertas.append((
                    "FORNECEDOR_CEAP_SUPERCONTRATO_EXECUTIVO", sev_pncp,
                    f"Fornecedor contratado pelo gabinete na Cota Parlamentar ({nome_f} - CNPJ {cnpj_pncp}, "
                    f"recebeu {_brl(tot_ceap_f)} na CEAP) detém {len(lista_c)} contrato(s) público(s) no Portal Nacional "
                    f"de Contratações Públicas (PNCP) somando {_brl(soma_pncp)} junto a órgãos do Executivo/Poder Público "
                    f"(incluindo: {resumo_orgaos}).",
                    soma_pncp, None,
                ))

        # 18b. Coincidência Territorial: Fornecedor CEAP contratado por Prefeitura/Órgão no reduto de Emendas ou UF do Deputado
        municipios_emenda_norm = {
            _normalizar(fv.municipio): fv.municipio
            for fv in favorecidos_dep
            if fv.municipio and _normalizar(fv.municipio) not in ("BRASILIA", "MULTIPLO", "SEM INFORMACAO")
        }
        for e in emendas_dep:
            if e.localidade:
                loc_clean = re.sub(r"\s*-\s*[A-Z]{2}$", "", e.localidade.strip())
                norm_loc = _normalizar(loc_clean)
                if norm_loc and norm_loc not in ("NACIONAL", "MULTIPLO", "EXTERIOR", "BRASILIA"):
                    municipios_emenda_norm[norm_loc] = loc_clean

        coincidencias_vistas = set()
        for c in sorted(contratos_pncp, key=lambda x: x.valor_global or 0.0, reverse=True):
            if (c.valor_global or 0.0) < 50_000.0:
                continue
            mun_c_norm = _normalizar(c.municipio_orgao or "")
            uf_c = (c.uf_orgao or "").strip().upper()
            chave_coinc = f"{c.fornecedor_cnpj}_{mun_c_norm}_{uf_c}"
            if chave_coinc in coincidencias_vistas:
                continue

            if mun_c_norm and mun_c_norm in municipios_emenda_norm:
                coincidencias_vistas.add(chave_coinc)
                alertas.append((
                    "COINCIDENCIA_TERRITORIAL_CONTRATO_EMENDA", "ALTA",
                    f"Cruzamento Territorial (CEAP × Emendas × PNCP): O fornecedor do gabinete {c.fornecedor_nome} "
                    f"(CNPJ {c.fornecedor_cnpj}) firmou contrato público de {_brl(c.valor_global)} com {c.orgao_publico} "
                    f"no município de {c.municipio_orgao}/{uf_c} — mesma localidade contemplada por Emendas Parlamentares "
                    f"destinadas pelo deputado.",
                    c.valor_global, None,
                ))
            elif uf_c and uf_c == (dep.uf or "").upper() and (c.valor_global or 0.0) >= 250_000.0:
                coincidencias_vistas.add(chave_coinc)
                alertas.append((
                    "COINCIDENCIA_TERRITORIAL_CONTRATO_EMENDA", "ALTA",
                    f"Reduto Eleitoral no PNCP: O fornecedor da Cota Parlamentar {c.fornecedor_nome} (CNPJ {c.fornecedor_cnpj}) "
                    f"possui contrato ativo de {_brl(c.valor_global)} com {c.orgao_publico} em {c.municipio_orgao}/{uf_c}, "
                    f"base eleitoral do deputado ({dep.uf}). Objeto: {(c.objeto_contrato or '')[:140]}.",
                    c.valor_global, None,
                ))
            if len(coincidencias_vistas) >= 2:
                break

    # -----------------------------------------------------------------------
    # 19. BLOCO 3: SEDE FANTASMA, GALPÕES COMPARTILHADOS & CARTEL POR ENDEREÇO/QSA
    # -----------------------------------------------------------------------
    dossies_forn = db.query(models.DossieFornecedorGabinete).filter(
        models.DossieFornecedorGabinete.deputado_id == dep.id
    ).all()

    if dossies_forn:
        for df in dossies_forn:
            if not df.indicio_cartel_ou_fantasma or not df.detalhe_indicio:
                continue
            det = df.detalhe_indicio

            if "Sede Compartilhada" in det or "Cluster no Mesmo CEP" in det or "mesmo Telefone" in det:
                alertas.append((
                    "CARTEL_ENDERECO_OU_CONTATO_FORNECEDORES", "ALTA",
                    f"Indício de Cartel / Sede ou Contato Compartilhado: O fornecedor {df.razao_social} (CNPJ {df.cnpj}, "
                    f"recebeu {_brl(df.total_recebido_deputado)} na CEAP) opera em endereço físico ({df.logradouro}, "
                    f"{df.numero} - CEP {df.cep}, {df.municipio}/{df.uf}) ou telefone compartilhado com outra(s) empresa(s) "
                    f"fornecedora(s) de cota parlamentar. Detalhe: {det}.",
                    df.total_recebido_deputado, None,
                ))

            if "Rede Societária (QSA)" in det:
                alertas.append((
                    "REDE_SOCIETARIA_OCULTA_FORNECEDORES", "ALTA",
                    f"Rede Societária Oculta no QSA: O fornecedor {df.razao_social} (CNPJ {df.cnpj}, "
                    f"faturou {_brl(df.total_recebido_deputado)} na CEAP) compartilha sócio/administrador com outra(s) "
                    f"pessoa(s) jurídica(s) que também faturam verbas parlamentares. Detalhe: {det}.",
                    df.total_recebido_deputado, None,
                ))

            if (
                "Endereço sem numeração predial" in det
                or "Ausência total de Telefone" in det
                or "Subcapitalização Física" in det
            ):
                sev_sede = "ALTA" if df.total_recebido_deputado >= 15_000.0 else "MEDIA"
                alertas.append((
                    "SEDE_FANTASMA_OU_ENDERECO_INCONSISTENTE", sev_sede,
                    f"Auditoria Física de Sede ({df.razao_social} - CNPJ {df.cnpj}, endereço: {df.logradouro}, "
                    f"{df.numero or 'S/N'} - {df.municipio}/{df.uf}): empresa recebeu {_brl(df.total_recebido_deputado)} "
                    f"em '{df.categoria_principal_gasto}' apresentando inconsistências cadastrais de sede física: {det}.",
                    df.total_recebido_deputado, None,
                ))

    # -----------------------------------------------------------------------
    # 20. BLOCO 4: NEPOTISMO CRUZADO INTERGABINETES (CÂMARA × SENADO), CLÃS & RACHADINHA TSE
    # -----------------------------------------------------------------------
    vinculos_nep = db.query(models.VinculoGabineteNepotismo).filter(
        models.VinculoGabineteNepotismo.deputado_id == dep.id
    ).all()

    if vinculos_nep:
        cruzados = [
            v for v in vinculos_nep
            if v.tipo_vinculo in ("NEPOTISMO_CRUZADO_CONGRESSO", "NEPOTISMO_DIRETO_PARLAMENTAR")
        ]
        for vc in cruzados[:3]:
            alertas.append((
                "NEPOTISMO_CRUZADO_INTERGABINETES", vc.gravidade or "ALTA",
                vc.detalhe_completo,
                None, None,
            ))

        clas_vistos = set()
        for v in vinculos_nep:
            if v.tipo_vinculo == "CLA_FAMILIAR_INTERNO" and v.sobrenome_conexao not in clas_vistos:
                clas_vistos.add(v.sobrenome_conexao)
                alertas.append((
                    "CLA_FAMILIAR_NO_GABINETE", v.gravidade or "MEDIA",
                    v.detalhe_completo,
                    None, None,
                ))

        for v in [x for x in vinculos_nep if x.tipo_vinculo == "ASSESSOR_DOADOR_TSE"][:2]:
            alertas.append((
                "ASSESSOR_DOADOR_CAMPANHA_TSE", "ALTA",
                v.detalhe_completo,
                None, None,
            ))

    # -----------------------------------------------------------------------
    # PERSISTÊNCIA NO BANCO & CÁLCULO DO ÍNDICE DE RISCO (0 a 100)
    # -----------------------------------------------------------------------
    contagem = defaultdict(int)
    for tipo, sev, desc, valor, desp_id in alertas:
        contagem[tipo] += 1
        db.add(models.Alerta(
            deputado_id=dep.id,
            tipo_heuristica=tipo,
            severidade=sev,
            descricao=desc,
            valor_envolvido=valor,
            despesa_id=desp_id,
        ))

    risco = 0.0
    for tipo, n in contagem.items():
        peso = PESOS.get(tipo, 15)
        # Reincidência controlada: soma gradual de 25% com teto de 1,5x por regra
        risco += peso * min(1 + 0.25 * (n - 1), 1.5)

    dep.indice_risco = round(min(100.0, risco), 1)
    db.commit()
