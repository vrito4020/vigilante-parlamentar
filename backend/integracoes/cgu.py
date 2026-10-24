"""
Módulo de Integração Oficial com o Portal da Transparência (CGU) e Tribunal de Contas da União (TCU).

Sincroniza automaticamente os cadastros nacionais de empresas punidas e inidôneas:
  - CEIS (Cadastro Nacional de Empresas Inidôneas e Suspensas - inclui acórdãos do TCU/TCEs)
  - CNEP (Cadastro Nacional de Empresas Punidas - Lei Anticorrupção)
  - CEPIM (Cadastro de Entidades Privadas Sem Fins Lucrativos Impedidas)

Utiliza o repositório oficial de Dados Abertos da CGU (arquivos ZIP diários) com cache em memória,
dispensando chaves privadas e realizando cruzamento O(1) para milhares de CNPJs.
"""
from datetime import datetime, timedelta
import zipfile
import io
import csv
import re
import httpx
from sqlalchemy.orm import Session
import models

# Cache global em memória: cnpj_limpo -> lista de dicts de sanção
_SANCOES_CACHE = {}
_CACHE_LOADED = False


def _clean_doc(doc: str) -> str:
    if not doc:
        return ""
    return re.sub(r"[^0-9]", "", str(doc))


async def _baixar_zip_cgu(client: httpx.AsyncClient, tipo: str) -> bytes:
    headers = {"User-Agent": "Mozilla/5.0"}
    for delta in range(1, 8):
        dt_str = (datetime.now() - timedelta(days=delta)).strftime("%Y%m%d")
        url = f"https://portaldatransparencia.gov.br/download-de-dados/{tipo}/{dt_str}"
        try:
            r = await client.get(url, headers=headers, follow_redirects=True, timeout=25.0)
            if r.status_code == 200 and len(r.content) > 1000:
                return r.content
        except Exception as e:
            print(f"[CGU] Tentativa falhou para {tipo}/{dt_str}: {e}")
    return None


async def carregar_cache_sancoes_nacionais():
    """Baixa e indexa em memória todas as sanções vigentes do CEIS, CNEP e CEPIM + TCU."""
    global _SANCOES_CACHE, _CACHE_LOADED
    if _CACHE_LOADED and _SANCOES_CACHE:
        return _SANCOES_CACHE

    novo_mapa = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. CEIS (inclui inidôneos da CGU, Ministérios e Tribunais de Contas - TCU/TCE)
        ceis_bytes = await _baixar_zip_cgu(client, "ceis")
        if ceis_bytes:
            try:
                z = zipfile.ZipFile(io.BytesIO(ceis_bytes))
                with z.open(z.namelist()[0]) as f:
                    text = io.TextIOWrapper(f, encoding="latin-1", errors="replace")
                    reader = csv.reader(text, delimiter=";")
                    next(reader, None)  # pula cabeçalho
                    for row in reader:
                        if len(row) < 18:
                            continue
                        doc = _clean_doc(row[3])
                        if len(doc) != 14:
                            continue
                        orgao = (row[17] or "").strip()
                        eh_tcu = "TRIBUNAL DE CONTAS" in orgao.upper() or "TCU" in orgao.upper()
                        cadastro_label = "TCU / CEIS" if eh_tcu else "CEIS (CGU)"
                        item = {
                            "cadastro": cadastro_label,
                            "categoria_sancao": (row[9] or "Declaração de Inidoneidade / Impedimento").strip(),
                            "orgao_sancionador": orgao,
                            "uf_orgao": (row[18] or "").strip() if len(row) > 18 else "",
                            "numero_processo": (row[8] or "").strip(),
                            "data_inicio": (row[10] or "").strip(),
                            "data_final": (row[11] or "").strip(),
                            "fundamentacao_legal": (row[20] or "").strip() if len(row) > 20 else "",
                        }
                        novo_mapa.setdefault(doc, []).append(item)
            except Exception as e:
                print(f"[CGU] Erro ao processar ZIP do CEIS: {e}")

        # 2. CNEP (Lei Anticorrupção - Multas e Punições Graves)
        cnep_bytes = await _baixar_zip_cgu(client, "cnep")
        if cnep_bytes:
            try:
                z = zipfile.ZipFile(io.BytesIO(cnep_bytes))
                with z.open(z.namelist()[0]) as f:
                    text = io.TextIOWrapper(f, encoding="latin-1", errors="replace")
                    reader = csv.reader(text, delimiter=";")
                    next(reader, None)
                    for row in reader:
                        if len(row) < 19:
                            continue
                        doc = _clean_doc(row[3])
                        if len(doc) != 14:
                            continue
                        orgao = (row[18] or "").strip()
                        multa = (row[10] or "").strip()
                        cat = (row[9] or "Punição Lei Anticorrupção").strip()
                        if multa and multa != "0,00":
                            cat = f"{cat} (Multa: R$ {multa})"
                        item = {
                            "cadastro": "CNEP (Lei Anticorrupção)",
                            "categoria_sancao": cat,
                            "orgao_sancionador": orgao,
                            "uf_orgao": (row[19] or "").strip() if len(row) > 19 else "",
                            "numero_processo": (row[8] or "").strip(),
                            "data_inicio": (row[11] or "").strip(),
                            "data_final": (row[12] or "").strip(),
                            "fundamentacao_legal": (row[21] or "").strip() if len(row) > 21 else "",
                        }
                        novo_mapa.setdefault(doc, []).append(item)
            except Exception as e:
                print(f"[CGU] Erro ao processar ZIP do CNEP: {e}")

        # 3. CEPIM (Entidades Impedidas)
        cepim_bytes = await _baixar_zip_cgu(client, "cepim")
        if cepim_bytes:
            try:
                z = zipfile.ZipFile(io.BytesIO(cepim_bytes))
                with z.open(z.namelist()[0]) as f:
                    text = io.TextIOWrapper(f, encoding="latin-1", errors="replace")
                    reader = csv.reader(text, delimiter=";")
                    next(reader, None)
                    for row in reader:
                        if len(row) < 5:
                            continue
                        doc = _clean_doc(row[0])
                        if len(doc) != 14:
                            continue
                        item = {
                            "cadastro": "CEPIM (Entidade Impedida)",
                            "categoria_sancao": (row[4] or "Impedimento de Convênio/Repasse").strip(),
                            "orgao_sancionador": (row[3] or "").strip(),
                            "uf_orgao": "",
                            "numero_processo": (row[2] or "").strip(),
                            "data_inicio": "",
                            "data_final": "",
                            "fundamentacao_legal": "Cadastro de Entidades Privadas Sem Fins Lucrativos Impedidas",
                        }
                        novo_mapa.setdefault(doc, []).append(item)
            except Exception as e:
                print(f"[CGU] Erro ao processar ZIP do CEPIM: {e}")

    if novo_mapa:
        _SANCOES_CACHE = novo_mapa
        _CACHE_LOADED = True
        print(f"[CGU/TCU] Base consolidada carregada: {len(_SANCOES_CACHE)} CNPJs sancionados indexados.")
    return _SANCOES_CACHE


async def sincronizar_sancoes_fornecedores_deputado(db: Session, deputado_id: int):
    """Cruza todos os fornecedores de um deputado com o cache nacional CEIS/CNEP/CEPIM/TCU e grava no banco."""
    cache = await carregar_cache_sancoes_nacionais()
    if not cache:
        return 0

    despesas = db.query(models.DespesaCEAP).filter(models.DespesaCEAP.deputado_id == deputado_id).all()
    cnpjs_dep = { _clean_doc(d.fornecedor_cnpj) for d in despesas if d.fornecedor_cnpj }

    total_sancoes_encontradas = 0
    for cnpj in cnpjs_dep:
        if cnpj in cache:
            # Limpa sanções antigas desse CNPJ para regravar atualizadas
            db.query(models.SancaoFornecedor).filter(models.SancaoFornecedor.cnpj == cnpj).delete()
            for s in cache[cnpj][:5]:  # armazena até 5 sanções distintas por CNPJ
                db.add(models.SancaoFornecedor(
                    cnpj=cnpj,
                    cadastro=s["cadastro"],
                    categoria_sancao=s["categoria_sancao"],
                    orgao_sancionador=s["orgao_sancionador"],
                    uf_orgao=s["uf_orgao"],
                    numero_processo=s["numero_processo"],
                    data_inicio=s["data_inicio"],
                    data_final=s["data_final"],
                    fundamentacao_legal=s["fundamentacao_legal"],
                ))
                total_sancoes_encontradas += 1

    db.commit()
    return total_sancoes_encontradas
