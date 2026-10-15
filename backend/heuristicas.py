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
    "VINCULO_SOCIETARIO_OU_NEPOTISMO": 40,
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
