from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from collections import defaultdict
import math

import models, schemas, database, pipeline
from integracoes import cgu, pessoal_camara, emendas, pncp, sede_cartel, nepotismo_cruzado, radar_judiciario, auditoria_folha

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Vigilante Parlamentar API")

# Coordenadas geográficas das capitais das 27 UFs para cálculo de distância física (Haversine) e mapa
COORDS_UF = {
    "AC": (-9.9754, -67.8249, "Acre"),
    "AL": (-9.6498, -35.7089, "Alagoas"),
    "AM": (-3.1190, -60.0217, "Amazonas"),
    "AP": (0.0356, -51.0705, "Amapá"),
    "BA": (-12.9777, -38.5016, "Bahia"),
    "CE": (-3.7319, -38.5267, "Ceará"),
    "DF": (-15.7975, -47.8919, "Distrito Federal"),
    "ES": (-20.3155, -40.3128, "Espírito Santo"),
    "GO": (-16.6869, -49.2648, "Goiás"),
    "MA": (-2.5307, -44.3068, "Maranhão"),
    "MG": (-19.9167, -43.9345, "Minas Gerais"),
    "MS": (-20.4697, -54.6201, "Mato Grosso do Sul"),
    "MT": (-15.6014, -56.0979, "Mato Grosso"),
    "PA": (-1.4558, -48.4902, "Pará"),
    "PB": (-7.1195, -34.8450, "Paraíba"),
    "PE": (-8.0476, -34.8770, "Pernambuco"),
    "PI": (-5.0920, -42.8038, "Piauí"),
    "PR": (-25.4284, -49.2733, "Paraná"),
    "RJ": (-22.9068, -43.1729, "Rio de Janeiro"),
    "RN": (-5.7945, -35.2110, "Rio Grande do Norte"),
    "RO": (-8.7612, -63.9039, "Rondônia"),
    "RR": (2.8235, -60.6758, "Roraima"),
    "RS": (-30.0346, -51.2177, "Rio Grande do Sul"),
    "SC": (-27.5954, -48.5480, "Santa Catarina"),
    "SE": (-10.9472, -37.0731, "Sergipe"),
    "SP": (-23.5505, -46.6333, "São Paulo"),
    "TO": (-10.1753, -48.2982, "Tocantins"),
}

def calcular_distancia_km(uf1: str, uf2: str) -> int:
    if uf1 not in COORDS_UF or uf2 not in COORDS_UF:
        return 950
    lat1, lon1, _ = COORDS_UF[uf1]
    lat2, lon2, _ = COORDS_UF[uf2]
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return int(round(r * c))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def formatar_categoria(cat_raw: str) -> str:
    if not cat_raw:
        return "Outras Despesas"
    c = cat_raw.upper()
    if "COMBUST" in c:
        return "Combustíveis e Lubrificantes"
    if "ESCRIT" in c:
        return "Escritório de Apoio"
    if any(k in c for k in ["AREA", "AEREA", "SIGEPA", "PASSAGEM"]):
        return "Passagens Aéreas"
    if any(k in c for k in ["VECUL", "VEICUL", "LOCA", "FRETAMENTO"]):
        return "Locação de Veículos"
    if "DIVULGA" in c:
        return "Divulgação Parlamentar"
    if "SEGURAN" in c:
        return "Segurança Especializada"
    if "HOSPEDAGEM" in c:
        return "Hospedagem"
    if "ALIMENTA" in c:
        return "Alimentação"
    if "TELEFON" in c:
        return "Telefonia e Comunicação"
    if "PUBLICA" in c or "ASSINATURA" in c:
        return "Publicações e Assinaturas"
    if "TAXI" in c or "TXI" in c or "PED" in c:
        return "Táxi e Pedágio"
    if "CONSULTORIA" in c or "PESQUISA" in c:
        return "Consultorias e Pesquisas"
    return "Outras Despesas"

def formatar_alerta_nome(tipo_raw: str) -> str:
    mapa = {
        "FORNECEDOR_SANCIONADO_CEIS_CNEP": "Empresa Inidônea / Sancionada (CGU CEIS/CNEP)",
        "EMENDA_FAVORECIDO_SANCIONADO_CGU": "Emenda Destinada a Empresa Sancionada (CGU)",
        "TRIANGULACAO_EMENDA_FORNECEDOR_CEAP": "Triangulação Emenda × Fornecedor CEAP",
        "FORNECEDOR_CEAP_SUPERCONTRATO_EXECUTIVO": "Fornecedor CEAP com Supercontrato Público (PNCP)",
        "COINCIDENCIA_TERRITORIAL_CONTRATO_EMENDA": "Cruzamento Territorial: Contrato PNCP × Reduto/Emenda",
        "CARTEL_ENDERECO_OU_CONTATO_FORNECEDORES": "Cartel / Sede ou Telefone Compartilhado entre Fornecedores",
        "REDE_SOCIETARIA_OCULTA_FORNECEDORES": "Rede Societária Oculta no QSA entre Fornecedores",
        "SEDE_FANTASMA_OU_ENDERECO_INCONSISTENTE": "Sede Fantasma ou Endereço Físico Inconsistente",
        "NEPOTISMO_CRUZADO_INTERGABINETES": "Nepotismo Cruzado Intergabinetes (Câmara × Senado)",
        "CLA_FAMILIAR_NO_GABINETE": "Clã Familiar na Folha do Mesmo Gabinete",
        "ASSESSOR_DOADOR_CAMPANHA_TSE": "Assessor Comissionado Financiador de Campanha (TSE)",
        "CERTIDAO_CRIMINAL_OBJETO_E_PE_POSITIVA": "Certidão Judicial de Objeto e Pé (Processo Ativo Declarado)",
        "LITIGIOSIDADE_CONTAS_ELEITORAIS_DATAJUD": "Litigiosidade Processual no CNJ DataJud (TRE/TSE)",
        "REDE_PROCESSOS_SANCIONADORES_CONTRATADOS": "Rede de Processos Sancionadores Vinculados (CGU/TCU)",
        "SERVIDOR_GABINETE_EXPULSO_CEAF_OU_DUPLA_LOTACAO": "Servidor de Gabinete no CEAF/DOU ou Dupla Lotação",
        "FAMILIA_ASSESSOR_FORNECEDOR_CEAP": "Conflito Familiar/Societário: Assessor × Fornecedor CEAP",
        "SUPERLOTACAO_CNE_OU_GIRO_PORTARIAS": "Superlotação de CNEs Extra-Cota ou Giro de Portarias",
        "VOLUME_CRITICO_EMENDA_PIX": "Volume Crítico de Emendas PIX (Transf. Especial)",
        "CONCENTRACAO_MUNICIPIO_EMENDA": "Concentração Geográfica de Emendas",
        "CONTAS_IRREGULARES_TCU": "Inidoneidade / Contas Irregulares (TCU)",
        "ASSESSOR_SOCIO_FORNECEDOR": "Secretário de Gabinete Sócio de Fornecedor",
        "QUID_PRO_QUO_DOADOR_CAMPANHA": "Retorno de Campanha / Doador Contratado (TSE)",
        "VINCULO_SOCIETARIO_OU_NEPOTISMO": "QSA / Vínculo Societário ou Nepotismo",
        "CNAE_INCOMPATIVEL_ESTRITO": "Incompatibilidade Estrita de CNAE",
        "SUBCAPITALIZACAO_CRITICA": "Subcapitalização Crítica (Capital Irrisório)",
        "CONFLITO_PRESENCA_PLENARIO": "Conflito de Presença em Plenário",
        "QUEIMA_DE_COTA_FIM_DE_ANO": "Anomalia de Fim de Ano ('Queima de Cota')",
        "REDE_FORNECEDOR_PARTIDARIO": "Fornecedor em Rede Partidária / Cartel",
        "NOTA_FISCAL_EMPRESA_EXTINTA": "Empresa Inapta ou Extinta (Receita)",
        "EMPRESA_RECEM_CRIADA": "Empresa Recém-Criada (< 90 dias)",
        "ESTOURO_TETO_MEI": "Estouro do Teto de MEI (> R$ 50k)",
        "CAPITAL_SOCIAL_INCOMPATIVEL": "Capital Social Incompatível",
        "TELETRANSPORTE_DISTANCIA_IMPOSSIVEL": "Teletransporte Espaço-Temporal",
        "GASTOS_CONCORRENTES_MESMA_DATA": "Simultaneidade em Municípios Distintos",
        "NOTA_FISCAL_DUPLICADA": "Nota Fiscal Duplicada",
        "FRACIONAMENTO_DE_DESPESA": "Fracionamento Suspeito de Despesa",
        "MONOPOLIO_SETORIAL": "Monopólio / Concentração (> 30%)",
        "CNAE_INCOMPATIVEL": "Atividade (CNAE) Incompatível",
        "EMPRESA_BAIXADA_APOS_PAGAMENTOS": "Empresa Baixada Após Receber Pagamento",
        "COMBUSTIVEL_GRAVE": "Combustível Exorbitante (> R$ 1.500)",
        "COMBUSTIVEL_DESPROPORCIONAL": "Abastecimento Excessivo (> R$ 600)",
        "POSSIVEL_DUPLICIDADE": "Possível Duplicidade de Notas",
        "PATRIMONIO_ELEVADO": "Patrimônio Declarado Elevado (TSE)"
    }
    return mapa.get(tipo_raw, tipo_raw.replace("_", " ").title())

@app.on_event("startup")
async def startup_event():
    # Roda a extração no inicio para povoar o DB se necessário
    db = database.SessionLocal()
    try:
        if db.query(models.Deputado).count() < 500:
            await pipeline.extract_deputados(db, limite=1000)
    finally:
        db.close()

@app.get("/api/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(database.get_db)):
    total_deputados = db.query(models.Deputado).count()
    total_alertas = db.query(models.Alerta).count()
    
    alertas_fantasma = db.query(models.Alerta).filter(models.Alerta.tipo_heuristica == "EMPRESA_FANTASMA").count()
    media_risco = db.query(func.avg(models.Deputado.indice_risco)).scalar() or 0.0

    return {
        "total_deputados": total_deputados,
        "total_alertas": total_alertas,
        "alertas_fantasma": alertas_fantasma,
        "media_risco_geral": round(media_risco, 2)
    }

@app.get("/api/dashboard/charts")
def get_dashboard_charts(db: Session = Depends(database.get_db)):
    # 1. Top Fornecedores
    top_f_raw = db.query(
        models.Fornecedor.razao_social,
        models.Fornecedor.cnpj,
        func.sum(models.DespesaCEAP.valor).label("total"),
        func.count(models.DespesaCEAP.id).label("quantidade")
    ).join(
        models.DespesaCEAP, models.DespesaCEAP.fornecedor_cnpj == models.Fornecedor.cnpj
    ).group_by(
        models.Fornecedor.cnpj
    ).order_by(
        desc("total")
    ).limit(6).all()

    top_fornecedores = []
    for f in top_f_raw:
        nome = f[0] if f[0] else f[1]
        if len(nome) > 28:
            nome = nome[:25].strip() + "..."
        top_fornecedores.append({
            "razao_social": nome,
            "razao_completa": f[0] or f[1],
            "cnpj": f[1],
            "total": round(float(f[2] or 0.0), 2),
            "quantidade": int(f[3] or 0)
        })

    # 2. Categorias de Gastos
    cats_raw = db.query(
        models.DespesaCEAP.tipo_despesa,
        func.sum(models.DespesaCEAP.valor).label("total"),
        func.count(models.DespesaCEAP.id).label("quantidade")
    ).group_by(
        models.DespesaCEAP.tipo_despesa
    ).order_by(
        desc("total")
    ).all()

    cat_map = {}
    for c in cats_raw:
        rotulo = formatar_categoria(c[0])
        if rotulo not in cat_map:
            cat_map[rotulo] = {"categoria": rotulo, "total": 0.0, "quantidade": 0}
        cat_map[rotulo]["total"] += float(c[1] or 0.0)
        cat_map[rotulo]["quantidade"] += int(c[2] or 0)

    total_despesas_geral = sum(item["total"] for item in cat_map.values()) or 1.0
    categorias_despesas = sorted(cat_map.values(), key=lambda x: x["total"], reverse=True)
    for cat in categorias_despesas:
        cat["total"] = round(cat["total"], 2)
        cat["percentual"] = round((cat["total"] / total_despesas_geral) * 100, 1)

    # 3. Severidade dos Alertas
    sev_raw = db.query(
        models.Alerta.severidade,
        func.count(models.Alerta.id)
    ).group_by(models.Alerta.severidade).all()

    cores_sev = {
        "ALTA": "#ef4444",   # Vermelho
        "MEDIA": "#f59e0b",  # Âmbar
        "BAIXA": "#38bdf8"   # Azul celeste
    }
    rotulos_sev = {
        "ALTA": "Alta Severidade",
        "MEDIA": "Média Severidade",
        "BAIXA": "Baixa / Informativo"
    }
    severidade_alertas = []
    for s in sev_raw:
        chave = s[0].upper() if s[0] else "OUTRA"
        severidade_alertas.append({
            "severidade": rotulos_sev.get(chave, chave),
            "chave": chave,
            "quantidade": int(s[1]),
            "cor": cores_sev.get(chave, "#94a3b8")
        })

    # 4. Alertas por Tipo de Heurística
    alertas_tipo_raw = db.query(
        models.Alerta.tipo_heuristica,
        func.count(models.Alerta.id)
    ).group_by(
        models.Alerta.tipo_heuristica
    ).order_by(
        desc(func.count(models.Alerta.id))
    ).limit(6).all()

    alertas_por_tipo = [
        {
            "tipo": formatar_alerta_nome(a[0]),
            "quantidade": int(a[1])
        }
        for a in alertas_tipo_raw
    ]

    # 5. Média de Risco por Estado (UF) com dados analisados
    uf_raw = db.query(
        models.Deputado.uf,
        func.avg(models.Deputado.indice_risco).label("media_risco"),
        func.count(models.Deputado.id).label("total_deputados")
    ).group_by(
        models.Deputado.uf
    ).order_by(
        desc("media_risco")
    ).limit(8).all()

    risco_por_uf = [
        {
            "uf": u[0],
            "media_risco": round(float(u[1] or 0.0), 2),
            "total_deputados": int(u[2])
        }
        for u in uf_raw
    ]

    return {
        "top_fornecedores": top_fornecedores,
        "categorias_despesas": categorias_despesas,
        "severidade_alertas": severidade_alertas,
        "alertas_por_tipo": alertas_por_tipo,
        "risco_por_uf": risco_por_uf,
        "total_volume_financeiro": round(total_despesas_geral, 2)
    }

@app.get("/api/deputados", response_model=List[schemas.Deputado])
def list_deputados(db: Session = Depends(database.get_db)):
    deputados = db.query(models.Deputado).order_by(desc(models.Deputado.indice_risco)).all()
    for d in deputados:
        d.total_assessores = len(d.assessores) if d.assessores else 0
        d.possui_sancao_cgu = any(
            a.tipo_heuristica in ('FORNECEDOR_SANCIONADO_CEIS_CNEP', 'EMENDA_FAVORECIDO_SANCIONADO_CGU')
            for a in d.alertas
        ) if d.alertas else False
        d.total_emendas_empenhado = round(sum(e.valor_empenhado or 0.0 for e in d.emendas), 2) if d.emendas else 0.0
        d.total_emendas_pix = round(
            sum(e.valor_empenhado or 0.0 for e in d.emendas if "ESPECIAIS" in (e.tipo_emenda or "").upper()), 2
        ) if d.emendas else 0.0
        d.qtd_favorecidos_sancionados = sum(1 for f in d.favorecidos_emendas if f.sancionado_cgu) if d.favorecidos_emendas else 0
        d.total_contratos_pncp = round(sum(c.valor_global or 0.0 for c in d.contratos_pncp), 2) if d.contratos_pncp else 0.0
        d.qtd_contratos_pncp = len(d.contratos_pncp) if d.contratos_pncp else 0
        d.qtd_fornecedores_suspeitos = sum(1 for df in d.dossies_fornecedores if df.indicio_cartel_ou_fantasma) if d.dossies_fornecedores else 0
        d.qtd_vinculos_nepotismo = len(d.vinculos_nepotismo) if d.vinculos_nepotismo else 0
        d.qtd_processos_judiciais = len(d.processos_judiciais) if d.processos_judiciais else 0
        d.qtd_anomalias_folha = sum(1 for af in d.auditoria_folha if af.indicio_fantasma_ou_acumulo) if d.auditoria_folha else 0
    return deputados

@app.get("/api/deputados/{id}", response_model=schemas.Deputado)
def get_deputado(id: int, db: Session = Depends(database.get_db)):
    deputado = db.query(models.Deputado).filter(models.Deputado.id == id).first()
    if not deputado:
        raise HTTPException(status_code=404, detail="Deputado não encontrado")

    cnpjs_fornecedores = [
        c[0] for c in db.query(models.DespesaCEAP.fornecedor_cnpj)
        .filter(models.DespesaCEAP.deputado_id == id)
        .distinct().all() if c[0]
    ]
    if cnpjs_fornecedores:
        deputado.sancoes = db.query(models.SancaoFornecedor).filter(
            models.SancaoFornecedor.cnpj.in_(cnpjs_fornecedores)
        ).all()
    else:
        deputado.sancoes = []

    deputado.total_assessores = len(deputado.assessores) if deputado.assessores else 0
    deputado.possui_sancao_cgu = any(
        a.tipo_heuristica in ('FORNECEDOR_SANCIONADO_CEIS_CNEP', 'EMENDA_FAVORECIDO_SANCIONADO_CGU')
        for a in deputado.alertas
    ) if deputado.alertas else False
    deputado.total_emendas_empenhado = round(sum(e.valor_empenhado or 0.0 for e in deputado.emendas), 2) if deputado.emendas else 0.0
    deputado.total_emendas_pix = round(
        sum(e.valor_empenhado or 0.0 for e in deputado.emendas if "ESPECIAIS" in (e.tipo_emenda or "").upper()), 2
    ) if deputado.emendas else 0.0
    deputado.qtd_favorecidos_sancionados = sum(1 for f in deputado.favorecidos_emendas if f.sancionado_cgu) if deputado.favorecidos_emendas else 0
    deputado.total_contratos_pncp = round(sum(c.valor_global or 0.0 for c in deputado.contratos_pncp), 2) if deputado.contratos_pncp else 0.0
    deputado.qtd_contratos_pncp = len(deputado.contratos_pncp) if deputado.contratos_pncp else 0
    deputado.qtd_fornecedores_suspeitos = sum(1 for df in deputado.dossies_fornecedores if df.indicio_cartel_ou_fantasma) if deputado.dossies_fornecedores else 0
    deputado.qtd_vinculos_nepotismo = len(deputado.vinculos_nepotismo) if deputado.vinculos_nepotismo else 0
    deputado.qtd_processos_judiciais = len(deputado.processos_judiciais) if deputado.processos_judiciais else 0
    deputado.qtd_anomalias_folha = sum(1 for af in deputado.auditoria_folha if af.indicio_fantasma_ou_acumulo) if deputado.auditoria_folha else 0
    return deputado
@app.get("/api/deputados/{id}/analytics")
def get_deputado_analytics(id: int, db: Session = Depends(database.get_db)):
    deputado = db.query(models.Deputado).filter(models.Deputado.id == id).first()
    if not deputado:
        raise HTTPException(status_code=404, detail="Deputado não encontrado")

    # Evolução temporal mês a mês
    gastos_mes = db.query(
        func.strftime('%Y-%m', models.DespesaCEAP.data).label("mes"),
        func.sum(models.DespesaCEAP.valor).label("total"),
        func.count(models.DespesaCEAP.id).label("quantidade")
    ).filter(
        models.DespesaCEAP.deputado_id == id
    ).group_by("mes").order_by("mes").all()

    evolucao_mensal = []
    for g in gastos_mes:
        if g[0]:
            partes = g[0].split("-")
            rotulo = f"{partes[1]}/{partes[0]}" if len(partes) == 2 else g[0]
            evolucao_mensal.append({
                "mes": g[0],
                "mes_rotulo": rotulo,
                "total": round(float(g[1] or 0.0), 2),
                "quantidade": int(g[2] or 0)
            })

    # Categorias de gastos do deputado
    cats_dep = db.query(
        models.DespesaCEAP.tipo_despesa,
        func.sum(models.DespesaCEAP.valor).label("total"),
        func.count(models.DespesaCEAP.id).label("quantidade")
    ).filter(
        models.DespesaCEAP.deputado_id == id
    ).group_by(models.DespesaCEAP.tipo_despesa).order_by(desc("total")).all()

    cat_map = {}
    for c in cats_dep:
        rotulo = formatar_categoria(c[0])
        if rotulo not in cat_map:
            cat_map[rotulo] = {"categoria": rotulo, "total": 0.0, "quantidade": 0}
        cat_map[rotulo]["total"] += float(c[1] or 0.0)
        cat_map[rotulo]["quantidade"] += int(c[2] or 0)

    total_deputado = sum(item["total"] for item in cat_map.values())
    categorias = sorted(cat_map.values(), key=lambda x: x["total"], reverse=True)
    for c in categorias:
        c["total"] = round(c["total"], 2)
        c["percentual"] = round((c["total"] / (total_deputado or 1.0)) * 100, 1)

    # Top Fornecedores do deputado
    top_f_dep = db.query(
        models.Fornecedor.razao_social,
        models.Fornecedor.cnpj,
        func.sum(models.DespesaCEAP.valor).label("total"),
        func.count(models.DespesaCEAP.id).label("quantidade")
    ).join(
        models.DespesaCEAP, models.DespesaCEAP.fornecedor_cnpj == models.Fornecedor.cnpj
    ).filter(
        models.DespesaCEAP.deputado_id == id
    ).group_by(
        models.Fornecedor.cnpj
    ).order_by(
        desc("total")
    ).limit(5).all()

    top_fornecedores = []
    for f in top_f_dep:
        nome = f[0] if f[0] else f[1]
        if len(nome) > 28:
            nome = nome[:25].strip() + "..."
        top_fornecedores.append({
            "razao_social": nome,
            "razao_completa": f[0] or f[1],
            "cnpj": f[1],
            "total": round(float(f[2] or 0.0), 2),
            "quantidade": int(f[3] or 0)
        })

    # Resumo numérico
    maior_nota = db.query(func.max(models.DespesaCEAP.valor)).filter(models.DespesaCEAP.deputado_id == id).scalar() or 0.0
    total_notas = sum(g["quantidade"] for g in evolucao_mensal)
    media_mensal = (total_deputado / len(evolucao_mensal)) if evolucao_mensal else 0.0

    return {
        "deputado_id": id,
        "nome": deputado.nome,
        "total_gasto": round(total_deputado, 2),
        "total_notas": total_notas,
        "maior_nota": round(maior_nota, 2),
        "media_mensal": round(media_mensal, 2),
        "evolucao_mensal": evolucao_mensal,
        "categorias": categorias,
        "top_fornecedores": top_fornecedores
    }

@app.post("/api/deputados/{id}/analisar")
async def analisar_deputado(id: int, db: Session = Depends(database.get_db)):
    deputado = db.query(models.Deputado).filter(models.Deputado.id == id).first()
    if not deputado:
        raise HTTPException(status_code=404, detail="Deputado não encontrado")
    
    await pipeline.extract_despesas_reais(db, id)
    await pipeline.extract_patrimonio_real_por_deputado(db, id)
    try:
        await cgu.sincronizar_sancoes_fornecedores_deputado(db, id)
        await pessoal_camara.sincronizar_assessores_deputado(db, id)
        await emendas.sincronizar_emendas_deputado(db, id)
        await pncp.sincronizar_contratos_pncp_deputado(db, id)
        await sede_cartel.sincronizar_dossie_fornecedores_deputado(db, id)
        await nepotismo_cruzado.sincronizar_nepotismo_cruzado_deputado(db, id)
        await radar_judiciario.sincronizar_radar_judiciario_deputado(db, id)
        await auditoria_folha.sincronizar_auditoria_folha_deputado(db, id)
    except Exception as e:
        print(f"[Aviso] Erro ao sincronizar novas fontes para deputado {id}: {e}")
    pipeline.rodar_motor_heuristicas_por_deputado(db, id)
    
    return {"message": "Análise concluída com sucesso"}

@app.post("/api/deputados/{id}/atualizar-patrimonio")
async def atualizar_patrimonio(id: int, db: Session = Depends(database.get_db)):
    deputado = db.query(models.Deputado).filter(models.Deputado.id == id).first()
    if not deputado:
        raise HTTPException(status_code=404, detail="Deputado não encontrado")
    await pipeline.extract_patrimonio_real_por_deputado(db, id)
    pipeline.rodar_motor_heuristicas_por_deputado(db, id)
    return {"patrimonio_declarado": deputado.patrimonio_declarado}


@app.get("/api/mapa-forense")
def get_mapa_forense(deputado_id: Optional[int] = None, db: Session = Depends(database.get_db)):
    # 1. Heatmap por Estado (UF)
    deputados_all = db.query(models.Deputado).all()
    dep_map = {d.id: d for d in deputados_all}

    gastos_por_dep = dict(
        db.query(models.DespesaCEAP.deputado_id, func.sum(models.DespesaCEAP.valor))
        .group_by(models.DespesaCEAP.deputado_id)
        .all()
    )
    alertas_por_dep = dict(
        db.query(models.Alerta.deputado_id, func.count(models.Alerta.id))
        .group_by(models.Alerta.deputado_id)
        .all()
    )

    uf_stats = {}
    for uf_sigla, (lat, lon, nome_est) in COORDS_UF.items():
        uf_stats[uf_sigla] = {
            "uf": uf_sigla,
            "nome_estado": nome_est,
            "lat": lat,
            "lon": lon,
            "total_deputados": 0,
            "deputados_auditados": 0,
            "soma_risco": 0.0,
            "soma_risco_auditados": 0.0,
            "max_risco": 0.0,
            "total_alertas": 0,
            "total_gasto": 0.0,
        }

    partido_stats = defaultdict(lambda: {
        "total_deputados": 0,
        "deputados_auditados": 0,
        "soma_risco": 0.0,
        "soma_risco_auditados": 0.0,
        "max_risco": 0.0,
        "total_alertas": 0,
        "total_gasto": 0.0,
    })

    for d in deputados_all:
        uf = (d.uf or "").upper()
        part = (d.partido or "S/P").upper()
        gasto_d = float(gastos_por_dep.get(d.id, 0.0) or 0.0)
        alertas_d = int(alertas_por_dep.get(d.id, 0) or 0)
        risco_d = float(d.indice_risco or 0.0)
        auditado = (gasto_d > 0 or alertas_d > 0 or risco_d > 0)

        if uf in uf_stats:
            st = uf_stats[uf]
            st["total_deputados"] += 1
            st["soma_risco"] += risco_d
            if auditado:
                st["deputados_auditados"] += 1
                st["soma_risco_auditados"] += risco_d
            if risco_d > st["max_risco"]:
                st["max_risco"] = round(risco_d, 1)
            st["total_alertas"] += alertas_d
            st["total_gasto"] += gasto_d

        pst = partido_stats[part]
        pst["total_deputados"] += 1
        pst["soma_risco"] += risco_d
        if auditado:
            pst["deputados_auditados"] += 1
            pst["soma_risco_auditados"] += risco_d
        if risco_d > pst["max_risco"]:
            pst["max_risco"] = round(risco_d, 1)
        pst["total_alertas"] += alertas_d
        pst["total_gasto"] += gasto_d

    heatmap_uf = []
    for uf_sigla, st in uf_stats.items():
        n_tot = st["total_deputados"] or 1
        n_aud = st["deputados_auditados"]
        heatmap_uf.append({
            "uf": uf_sigla,
            "nome_estado": st["nome_estado"],
            "lat": st["lat"],
            "lon": st["lon"],
            "total_deputados": st["total_deputados"],
            "deputados_auditados": n_aud,
            "media_risco": round(st["soma_risco"] / n_tot, 2),
            "media_risco_auditados": round(st["soma_risco_auditados"] / n_aud, 1) if n_aud > 0 else 0.0,
            "max_risco": st["max_risco"],
            "total_alertas": st["total_alertas"],
            "total_gasto": round(st["total_gasto"], 2),
        })
    heatmap_uf.sort(key=lambda x: (x["media_risco_auditados"], x["total_gasto"]), reverse=True)

    heatmap_partidos = []
    for part_sigla, pst in partido_stats.items():
        n_tot = pst["total_deputados"] or 1
        n_aud = pst["deputados_auditados"]
        heatmap_partidos.append({
            "partido": part_sigla,
            "total_deputados": pst["total_deputados"],
            "deputados_auditados": n_aud,
            "media_risco": round(pst["soma_risco"] / n_tot, 2),
            "media_risco_auditados": round(pst["soma_risco_auditados"] / n_aud, 1) if n_aud > 0 else 0.0,
            "max_risco": pst["max_risco"],
            "total_alertas": pst["total_alertas"],
            "total_gasto": round(pst["total_gasto"], 2),
        })
    heatmap_partidos.sort(key=lambda x: (x["media_risco_auditados"], x["total_alertas"], x["total_gasto"]), reverse=True)

    # 2. Rotas de Teletransporte e Conflitos Espaciais (Linhas Vermelhas)
    query_desp = db.query(models.DespesaCEAP).join(
        models.Fornecedor, models.DespesaCEAP.fornecedor_cnpj == models.Fornecedor.cnpj
    )
    if deputado_id:
        query_desp = query_desp.filter(models.DespesaCEAP.deputado_id == deputado_id)

    despesas_all = query_desp.all()
    PRESENCIAIS_KEYS = ("COMBUST", "ALIMENT", "RESTAURANTE", "HOSPED", "HOTEL")
    CIAS_AEREAS_KEYS = ("GOL LINHAS", "TAM LINHAS", "LATAM", "AZUL LINHAS", "VOEPASS", "PASSAREDO")

    por_dep_data = defaultdict(list)
    rotas_conflito_plenario = []

    for d in despesas_all:
        if not d.data or (d.valor or 0.0) <= 0:
            continue
        tipo_u = (d.tipo_despesa or "").upper()
        if any(k in tipo_u for k in ("PASSAGEM", "AEREA", "AÉREA", "SIGEPA")):
            continue
        if not any(p in tipo_u for p in PRESENCIAIS_KEYS):
            continue
        f = d.fornecedor_rel
        if not f:
            continue
        nome_f = (f.razao_social or "").upper()
        if any(c in nome_f for c in CIAS_AEREAS_KEYS):
            continue
        uf_f = (f.uf or "").strip().upper()
        if uf_f not in COORDS_UF:
            continue

        por_dep_data[(d.deputado_id, d.data)].append((d, f, uf_f))

    rotas_teletransporte = []
    rota_idx = 1
    for (dep_id, data_doc), itens in por_dep_data.items():
        ufs_distintas = []
        por_uf_item = {}
        for item in itens:
            uf_item = item[2]
            if uf_item not in por_uf_item:
                por_uf_item[uf_item] = item
                ufs_distintas.append(uf_item)

        if len(ufs_distintas) > 1:
            uf1 = ufs_distintas[0]
            uf2 = ufs_distintas[1]
            if uf1 in {"DF", "GO"} and uf2 in {"DF", "GO"}:
                continue
            d1, f1, _ = por_uf_item[uf1]
            d2, f2, _ = por_uf_item[uf2]
            dep_obj = dep_map.get(dep_id)
            if not dep_obj:
                continue
            dist_km = calcular_distancia_km(uf1, uf2)
            rotas_teletransporte.append({
                "id": rota_idx,
                "tipo_rota": "TELETRANSPORTE",
                "deputado_id": dep_id,
                "deputado_nome": dep_obj.nome,
                "partido": dep_obj.partido,
                "uf_deputado": dep_obj.uf,
                "url_foto": dep_obj.url_foto,
                "data": data_doc.strftime("%d/%m/%Y"),
                "data_iso": data_doc.strftime("%Y-%m-%d"),
                "origem_uf": uf1,
                "origem_estado": COORDS_UF[uf1][2],
                "origem_municipio": f1.municipio or COORDS_UF[uf1][2],
                "origem_fornecedor": f1.razao_social,
                "origem_valor": round(float(d1.valor), 2),
                "origem_categoria": formatar_categoria(d1.tipo_despesa),
                "origem_url_documento": d1.url_documento,
                "destino_uf": uf2,
                "destino_estado": COORDS_UF[uf2][2],
                "destino_municipio": f2.municipio or COORDS_UF[uf2][2],
                "destino_fornecedor": f2.razao_social,
                "destino_valor": round(float(d2.valor), 2),
                "destino_categoria": formatar_categoria(d2.tipo_despesa),
                "destino_url_documento": d2.url_documento,
                "distancia_km": dist_km,
                "valor_combinado": round(float(d1.valor + d2.valor), 2),
            })
            rota_idx += 1

    # Ordena rotas pela maior distância física e valor
    rotas_teletransporte.sort(key=lambda r: (r["distancia_km"], r["valor_combinado"]), reverse=True)

    return {
        "heatmap_uf": heatmap_uf,
        "heatmap_partidos": heatmap_partidos,
        "rotas_teletransporte": rotas_teletransporte,
    }


@app.get("/api/comparar")
def comparar_deputados(dep1: int, dep2: int, db: Session = Depends(database.get_db)):
    d1 = db.query(models.Deputado).filter(models.Deputado.id == dep1).first()
    d2 = db.query(models.Deputado).filter(models.Deputado.id == dep2).first()
    if not d1 or not d2:
        raise HTTPException(status_code=404, detail="Um ou ambos os deputados não foram encontrados")

    a1 = get_deputado_analytics(dep1, db)
    a2 = get_deputado_analytics(dep2, db)

    def _resumo_dep(dep_obj, ana):
        sev_counts = {"ALTA": 0, "MEDIA": 0, "BAIXA": 0}
        for al in dep_obj.alertas:
            s = (al.severidade or "BAIXA").upper()
            if s in sev_counts:
                sev_counts[s] += 1
        return {
            "id": dep_obj.id,
            "nome": dep_obj.nome,
            "partido": dep_obj.partido,
            "uf": dep_obj.uf,
            "url_foto": dep_obj.url_foto,
            "patrimonio_declarado": dep_obj.patrimonio_declarado,
            "indice_risco": round(float(dep_obj.indice_risco or 0.0), 1),
            "total_alertas": len(dep_obj.alertas),
            "alertas_por_severidade": sev_counts,
            "total_gasto": ana["total_gasto"],
            "media_mensal": ana["media_mensal"],
            "maior_nota": ana["maior_nota"],
            "total_notas": ana["total_notas"],
            "top_fornecedores": ana["top_fornecedores"],
        }

    # Série histórica mensal unificada
    meses_map = {}
    for item in a1["evolucao_mensal"]:
        m = item["mes"]
        meses_map[m] = {
            "mes": m,
            "mes_rotulo": item["mes_rotulo"],
            "dep1_total": item["total"],
            "dep2_total": 0.0,
            "dep1_notas": item["quantidade"],
            "dep2_notas": 0,
        }
    for item in a2["evolucao_mensal"]:
        m = item["mes"]
        if m not in meses_map:
            meses_map[m] = {
                "mes": m,
                "mes_rotulo": item["mes_rotulo"],
                "dep1_total": 0.0,
                "dep2_total": item["total"],
                "dep1_notas": 0,
                "dep2_notas": item["quantidade"],
            }
        else:
            meses_map[m]["dep2_total"] = item["total"]
            meses_map[m]["dep2_notas"] = item["quantidade"]

    evolucao_conjunta = [meses_map[k] for k in sorted(meses_map.keys())]

    # Categorias unificadas
    cats_map = {}
    for c in a1["categorias"]:
        cat = c["categoria"]
        cats_map[cat] = {
            "categoria": cat,
            "dep1_total": c["total"],
            "dep2_total": 0.0,
            "dep1_pct": c["percentual"],
            "dep2_pct": 0.0,
        }
    for c in a2["categorias"]:
        cat = c["categoria"]
        if cat not in cats_map:
            cats_map[cat] = {
                "categoria": cat,
                "dep1_total": 0.0,
                "dep2_total": c["total"],
                "dep1_pct": 0.0,
                "dep2_pct": c["percentual"],
            }
        else:
            cats_map[cat]["dep2_total"] = c["total"]
            cats_map[cat]["dep2_pct"] = c["percentual"]

    categorias_conjuntas = sorted(
        cats_map.values(),
        key=lambda x: x["dep1_total"] + x["dep2_total"],
        reverse=True,
    )

    # Fornecedores em comum (mesmo CNPJ contratado por ambos)
    f1_rows = db.query(
        models.DespesaCEAP.fornecedor_cnpj,
        func.sum(models.DespesaCEAP.valor).label("total"),
        func.count(models.DespesaCEAP.id).label("notas")
    ).filter(models.DespesaCEAP.deputado_id == dep1).group_by(models.DespesaCEAP.fornecedor_cnpj).all()

    f2_rows = db.query(
        models.DespesaCEAP.fornecedor_cnpj,
        func.sum(models.DespesaCEAP.valor).label("total"),
        func.count(models.DespesaCEAP.id).label("notas")
    ).filter(models.DespesaCEAP.deputado_id == dep2).group_by(models.DespesaCEAP.fornecedor_cnpj).all()

    f1_dict = {r[0]: (float(r[1] or 0.0), int(r[2] or 0)) for r in f1_rows if r[0]}
    f2_dict = {r[0]: (float(r[1] or 0.0), int(r[2] or 0)) for r in f2_rows if r[0]}

    cnpjs_comuns = set(f1_dict.keys()).intersection(set(f2_dict.keys()))
    fornecedores_em_comum = []
    if cnpjs_comuns:
        forns_db = {
            f.cnpj: f for f in db.query(models.Fornecedor).filter(models.Fornecedor.cnpj.in_(cnpjs_comuns)).all()
        }
        for cnpj in cnpjs_comuns:
            f_obj = forns_db.get(cnpj)
            v1, n1 = f1_dict[cnpj]
            v2, n2 = f2_dict[cnpj]
            fornecedores_em_comum.append({
                "cnpj": cnpj,
                "razao_social": f_obj.razao_social if f_obj else cnpj,
                "uf": f_obj.uf if f_obj else "",
                "cnae": f_obj.cnae_fiscal_descricao if f_obj else "",
                "dep1_total": round(v1, 2),
                "dep1_notas": n1,
                "dep2_total": round(v2, 2),
                "dep2_notas": n2,
                "soma_conjunta": round(v1 + v2, 2),
            })
        fornecedores_em_comum.sort(key=lambda x: x["soma_conjunta"], reverse=True)

    return {
        "dep1": _resumo_dep(d1, a1),
        "dep2": _resumo_dep(d2, a2),
        "evolucao_conjunta": evolucao_conjunta,
        "categorias_conjuntas": categorias_conjuntas,
        "fornecedores_em_comum": fornecedores_em_comum,
    }

