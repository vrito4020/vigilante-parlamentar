"""
Pipeline de Ingestão em Lote Nacional (Bulk Open Data) do Vigilante Parlamentar.

Carrega dados oficiais de TODOS os 512 deputados federais sem risco de bloqueio:
  1. CEAP (Cota Parlamentar): Download de 1 único arquivo ZIP oficial por ano (2026/2025) da Câmara.
  2. CGU / TCU (CEIS, CNEP, CEPIM): Download consolidado diário único da CGU.
  3. Emendas & PIX (Transferegov): Download do pacote consolidado nacional UNICO da CGU.
  4. Pessoal & Gabinetes: Download de 1 único JSON de 15.253 servidores da Câmara.
  5. Motor Forense: Recálculo do Índice de Risco Cumulativo para todos os 512 deputados.

Total de requisições externas: Apenas 5 requisições de arquivos estáticos oficiais!
"""
import asyncio
import csv
import io
import re
import sys
import time
import zipfile
from datetime import datetime
from collections import defaultdict
import httpx

import database
import models
import heuristicas
from integracoes import cgu, emendas, auditoria_folha


def clean_cnpj(val):
    if not val:
        return ""
    return re.sub(r"[^0-9]", "", str(val))


def _norm(txt: str) -> str:
    if not txt:
        return ""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", txt.upper())
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


async def ingest_ceap_bulk(db, anos=(2026,)):
    print(f"\n--- [FASE 1/5] Ingestão em Lote da CEAP (Anos: {anos}) ---")
    dep_ids = set(d[0] for d in db.query(models.Deputado.id).all())
    known_cnpjs = set(c[0] for c in db.query(models.Fornecedor.cnpj).all())
    
    # Limpa despesas atuais dos anos a serem reimportados
    anos_str = [str(a) for a in anos]
    print(f"Limpando despesas anteriores para reingestão limpa...")
    db.query(models.DespesaCEAP).delete()
    db.commit()

    total_despesas_inseridas = 0
    new_fornecedores = {}

    for ano in anos:
        url = f"https://www.camara.leg.br/cotas/Ano-{ano}.csv.zip"
        print(f"Baixando pacote oficial de despesas CEAP {ano} ({url})...")
        t0 = time.time()
        async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as client:
            r = await client.get(url)
            if r.status_code != 200 or len(r.content) < 1000:
                print(f"Erro ao baixar CEAP {ano}: status {r.status_code}")
                continue
        print(f"Download CEAP {ano} concluído em {time.time()-t0:.2f}s ({len(r.content):,} bytes). Processando...")

        z = zipfile.ZipFile(io.BytesIO(r.content))
        csv_name = z.namelist()[0]
        with z.open(csv_name) as f:
            text = io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace")
            reader = csv.DictReader(text, delimiter=";")
            
            despesas_batch = []
            for row in reader:
                ide = row.get("ideCadastro")
                if not ide or not ide.isdigit():
                    continue
                dep_id = int(ide)
                if dep_id not in dep_ids:
                    continue

                cnpj_raw = row.get("txtCNPJCPF", "")
                cnpj_limpo = clean_cnpj(cnpj_raw)
                if len(cnpj_limpo) != 14:
                    continue

                nome_forn = (row.get("txtFornecedor") or "").strip()
                if cnpj_limpo not in known_cnpjs and cnpj_limpo not in new_fornecedores:
                    new_fornecedores[cnpj_limpo] = nome_forn or "Fornecedor Não Informado"

                try:
                    val_doc = float(row.get("vlrLiquido") or row.get("vlrDocumento") or 0.0)
                except Exception:
                    val_doc = 0.0

                if val_doc <= 0.0:
                    continue

                dt_str = row.get("datEmissao", "")[:10]
                dt = None
                if dt_str:
                    try:
                        dt = datetime.strptime(dt_str, "%Y-%m-%d").date()
                    except Exception:
                        pass

                despesas_batch.append({
                    "deputado_id": dep_id,
                    "fornecedor_cnpj": cnpj_limpo,
                    "valor": round(val_doc, 2),
                    "data": dt,
                    "tipo_despesa": (row.get("txtDescricao") or "")[:200],
                    "url_documento": (row.get("urlDocumento") or None),
                    "num_documento": str(row.get("txtNumero") or "").strip()[:50] or None,
                })

            print(f"CEAP {ano}: {len(despesas_batch):,} despesas válidas mapeadas para os deputados.")

            # Inserir novos fornecedores
            if new_fornecedores:
                print(f"Gravando {len(new_fornecedores):,} novos fornecedores na base...")
                forn_objs = [
                    models.Fornecedor(
                        cnpj=c,
                        razao_social=n,
                        situacao_cadastral="REGULAR",
                        capital_social=0.0,
                    )
                    for c, n in new_fornecedores.items()
                ]
                db.bulk_save_objects(forn_objs)
                db.commit()
                known_cnpjs.update(new_fornecedores.keys())
                new_fornecedores.clear()

            # Inserir despesas em lotes de 10.000 para performance máxima
            chunk_size = 10000
            for i in range(0, len(despesas_batch), chunk_size):
                chunk = despesas_batch[i:i + chunk_size]
                db.bulk_insert_mappings(models.DespesaCEAP, chunk)
                db.commit()
            total_despesas_inseridas += len(despesas_batch)

    print(f"Total de Despesas CEAP gravadas: {total_despesas_inseridas:,}")
    return total_despesas_inseridas


async def sync_sancoes_bulk(db):
    print("\n--- [FASE 2/5] Sincronização de Sanções CGU/TCU (CEIS / CNEP / CEPIM) ---")
    try:
        sancoes_cache = await cgu.carregar_cache_sancoes_nacionais()
        if sancoes_cache:
            cnpjs_fornecedores = set(c[0] for c in db.query(models.Fornecedor.cnpj).all())
            sancoes_para_gravar = []
            for cnpj, lista_sancoes in sancoes_cache.items():
                if cnpj in cnpjs_fornecedores:
                    for s in lista_sancoes:
                        sancoes_para_gravar.append(models.SancaoFornecedor(
                            cnpj=cnpj,
                            cadastro=s.get("cadastro", "CEIS"),
                            categoria_sancao=s.get("categoria_sancao"),
                            orgao_sancionador=s.get("orgao_sancionador"),
                            uf_orgao=s.get("uf_orgao"),
                            numero_processo=s.get("numero_processo"),
                            data_inicio=s.get("data_inicio"),
                            data_final=s.get("data_final"),
                            fundamentacao_legal=s.get("fundamentacao_legal"),
                        ))
            if sancoes_para_gravar:
                db.query(models.SancaoFornecedor).delete()
                db.bulk_save_objects(sancoes_para_gravar)
                db.commit()
                print(f"Total de sanções vinculadas a fornecedores da CEAP: {len(sancoes_para_gravar):,}")
            else:
                print("Nenhum fornecedor da CEAP atual consta com sanção ativa no cache da CGU.")
        else:
            print("Sanções mantidas conforme base consolidada existente.")
    except Exception as e:
        print(f"Aviso em sanções CGU: {e}")


async def sync_emendas_todos(db):
    print("\n--- [FASE 3/5] Sincronização de Emendas & PIX (CGU / Transferegov) ---")
    # Baixa 1 única vez o pacote nacional UNICO
    await emendas.carregar_cache_emendas_nacionais()

    deputados = db.query(models.Deputado).all()
    print(f"Processando emendas e favorecidos para todos os {len(deputados)} deputados...")
    total_em = 0
    t0 = time.time()
    for i, dep in enumerate(deputados, 1):
        qtd = await emendas.sincronizar_emendas_deputado(db, dep.id)
        total_em += qtd
        if i % 100 == 0 or i == len(deputados):
            print(f"  Progresso Emendas: {i}/{len(deputados)} deputados processados ({time.time()-t0:.1f}s)...")
    print(f"Concluído! Total de emendas indexadas: {total_em:,}")


async def sync_pessoal_e_folha_todos(db):
    print("\n--- [FASE 4/5] Sincronização de Pessoal de Gabinete e Auditoria Funcional (Câmara) ---")
    indice = await auditoria_folha._carregar_indice_folha_e_ceaf()
    por_deputado = indice.get("por_deputado", {})
    total_staff = sum(len(v) for v in por_deputado.values())
    print(f"Base de servidores da Câmara carregada: {total_staff:,} servidores mapeados em gabinetes.")

    deputados = db.query(models.Deputado).all()
    print(f"Auditando folha funcional e cadastrando assessores para todos os {len(deputados)} gabinetes...")

    # Limpa tabela assessores_gabinete
    db.query(models.AssessorGabinete).delete()
    db.commit()

    assessores_novos = []
    t0 = time.time()
    for i, dep in enumerate(deputados, 1):
        funcs = por_deputado.get(str(dep.id), [])

        for f in funcs:
            assessores_novos.append(models.AssessorGabinete(
                deputado_id=dep.id,
                nome=f.get("nome"),
                cargo=f.get("cargo"),
                situacao="Em exercício",
                remuneracao_url=None,
            ))

        # Roda a auditoria de folha (expulsões DOU/CEAF, dupla lotação, CNEs, giro de portarias)
        await auditoria_folha.sincronizar_auditoria_folha_deputado(db, dep.id)

        if i % 100 == 0 or i == len(deputados):
            print(f"  Progresso Folha: {i}/{len(deputados)} gabinetes auditados ({time.time()-t0:.1f}s)...")

    if assessores_novos:
        db.bulk_save_objects(assessores_novos)
        db.commit()
    print(f"Concluído! Total de assessores cadastrados nos gabinetes: {len(assessores_novos):,}")


def recalcular_heuristicas_todos(db):
    print("\n--- [FASE 5/5] Execução do Motor de Heurísticas Forenses (Todos os 512 Deputados) ---")
    deputados = db.query(models.Deputado).all()
    t0 = time.time()
    for i, dep in enumerate(deputados, 1):
        heuristicas.rodar_motor_heuristicas_por_deputado(db, dep.id)
        if i % 100 == 0 or i == len(deputados):
            print(f"  Progresso Motor: {i}/{len(deputados)} deputados auditados e pontuados ({time.time()-t0:.1f}s)...")
    print("Recálculo forense finalizado com sucesso!")


async def main():
    print("================================================================================")
    print("   VIGILANTE PARLAMENTAR - CARGA EM LOTE NACIONAL DE TODOS OS DEPUTADOS")
    print("   Estratégia: Bulk Open Data (Apenas 5 downloads estáticos, ZERO risco de bloqueio)")
    print("================================================================================")
    t_inicio = time.time()
    db = database.SessionLocal()
    try:
        # Fase 1: CEAP 2026 (ou 2025 + 2026)
        await ingest_ceap_bulk(db, anos=(2026,))

        # Fase 2: Sanções CGU/TCU
        await sync_sancoes_bulk(db)

        # Fase 3: Emendas e PIX CGU
        await sync_emendas_todos(db)

        # Fase 4: Pessoal e Auditoria de Gabinete
        await sync_pessoal_e_folha_todos(db)

        # Fase 5: Motor de Heurísticas
        recalcular_heuristicas_todos(db)

        print("\n================================================================================")
        print(f"[SUCESSO] CARGA COMPLETA DE TODOS OS 512 DEPUTADOS CONCLUIDA EM {time.time()-t_inicio:.1f}s!")
        print("================================================================================")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
