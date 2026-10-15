from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List

import models, schemas, database, pipeline

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Vigilante Parlamentar API")

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
    return deputados

@app.get("/api/deputados/{id}", response_model=schemas.Deputado)
def get_deputado(id: int, db: Session = Depends(database.get_db)):
    deputado = db.query(models.Deputado).filter(models.Deputado.id == id).first()
    if not deputado:
        raise HTTPException(status_code=404, detail="Deputado não encontrado")
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
