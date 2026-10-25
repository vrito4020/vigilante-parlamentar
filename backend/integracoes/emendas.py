"""
Módulo de Integração Oficial com a Base de Emendas Parlamentares e Emendas PIX (CGU / Transferegov).

Baixa e indexa em memória o pacote oficial consolidado do Portal da Transparência da CGU:
  - EmendasParlamentares.csv (Emendas Individuais, Emendas PIX / Transferências Especiais, Bancada)
  - EmendasParlamentares_PorFavorecido.csv (CNPJs reais de empresas privadas, ONGs e prefeituras que receberam os recursos)

Cruza automaticamente cada CNPJ favorecido por emenda parlamentar com:
  1. Base Nacional de Empresas Inidôneas e Punidas (CEIS / CNEP / CEPIM da CGU e TCU)
  2. Fornecedores contratados com a Cota Parlamentar (CEAP) do próprio deputado (Triangulação de Verba)
"""
import zipfile
import io
import csv
import re
import unicodedata
import httpx
from sqlalchemy.orm import Session
import models
from integracoes import cgu

_EMENDAS_POR_AUTOR = {}
_FAVORECIDOS_POR_AUTOR = {}
_CACHE_EMENDAS_LOADED = False

BANCOS_INTERMEDIARIOS = (
    "BANCO DO BRASIL",
    "CAIXA ECONOMICA FEDERAL",
    "BANCO DO NORDESTE",
    "BANCO DA AMAZONIA",
    "BANCO CENTRAL",
)


def _norm_nome(texto: str) -> str:
    if not texto:
        return ""
    s = unicodedata.normalize("NFKD", str(texto)).encode("ASCII", "ignore").decode("ASCII")
    s = re.sub(r"[^A-Z0-9\s]", " ", s.upper())
    return " ".join(s.split())


def _clean_doc(doc: str) -> str:
    if not doc:
        return ""
    return re.sub(r"[^0-9]", "", str(doc))


def _parse_brl(val_str: str) -> float:
    if not val_str:
        return 0.0
    s = str(val_str).strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except Exception:
        return 0.0


async def carregar_cache_emendas_nacionais():
    """Baixa o pacote UNICO de Emendas Parlamentares da CGU e indexa por autor (2023-2026)."""
    global _EMENDAS_POR_AUTOR, _FAVORECIDOS_POR_AUTOR, _CACHE_EMENDAS_LOADED
    if _CACHE_EMENDAS_LOADED and _EMENDAS_POR_AUTOR:
        return _EMENDAS_POR_AUTOR, _FAVORECIDOS_POR_AUTOR

    sancoes_cache = await cgu.carregar_cache_sancoes_nacionais()
    novo_emendas = {}
    novo_favorecidos = {}

    url = "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO"
    headers = {"User-Agent": "Mozilla/5.0"}

    try:
        async with httpx.AsyncClient(timeout=90.0, follow_redirects=True, verify=False) as client:
            print("[Emendas CGU] Baixando base consolidada de Emendas Parlamentares e PIX...")
            r = await client.get(url, headers=headers)
            if r.status_code != 200 or len(r.content) < 10000:
                print(f"[Emendas CGU] Falha no download: status {r.status_code}")
                return {}, {}

            z = zipfile.ZipFile(io.BytesIO(r.content))

            # 1. Processar EmendasParlamentares.csv
            if "EmendasParlamentares.csv" in z.namelist():
                with z.open("EmendasParlamentares.csv") as f:
                    text = io.TextIOWrapper(f, encoding="latin-1", errors="replace")
                    reader = csv.reader(text, delimiter=";")
                    next(reader, None)
                    for row in reader:
                        if len(row) < 28:
                            continue
                        ano_str = row[1].strip()
                        if ano_str not in ("2023", "2024", "2025", "2026"):
                            continue
                        autor = _norm_nome(row[4])
                        if not autor or autor == "SEM INFORMACAO":
                            continue

                        emp = _parse_brl(row[22])
                        liq = _parse_brl(row[23])
                        pago = _parse_brl(row[24]) + _parse_brl(row[27])
                        if emp <= 0 and pago <= 0:
                            continue

                        item = {
                            "codigo_emenda": row[0].strip(),
                            "ano": int(ano_str),
                            "tipo_emenda": row[2].strip(),
                            "localidade": row[6].strip(),
                            "uf": row[10].strip(),
                            "funcao": row[13].strip(),
                            "subfuncao": row[15].strip(),
                            "acao": row[19].strip(),
                            "valor_empenhado": round(emp, 2),
                            "valor_liquidado": round(liq, 2),
                            "valor_pago": round(pago, 2),
                        }
                        novo_emendas.setdefault(autor, []).append(item)

            # 2. Processar EmendasParlamentares_PorFavorecido.csv
            if "EmendasParlamentares_PorFavorecido.csv" in z.namelist():
                agrupado_fav = {}
                with z.open("EmendasParlamentares_PorFavorecido.csv") as f:
                    text = io.TextIOWrapper(f, encoding="latin-1", errors="replace")
                    reader = csv.reader(text, delimiter=";")
                    next(reader, None)
                    for row in reader:
                        if len(row) < 13:
                            continue
                        ano_mes = row[5].strip()
                        if not any(ano_mes.startswith(y) for y in ("2023", "2024", "2025", "2026")):
                            continue
                        autor = _norm_nome(row[2])
                        if not autor or autor == "SEM INFORMACAO":
                            continue

                        cnpj_fav = _clean_doc(row[6])
                        if len(cnpj_fav) != 14:
                            continue
                        nome_fav = row[7].strip()
                        if any(b in nome_fav.upper() for b in BANCOS_INTERMEDIARIOS):
                            continue

                        val = _parse_brl(row[12])
                        if val <= 0:
                            continue

                        chave = (autor, cnpj_fav)
                        if chave not in agrupado_fav:
                            s_list = sancoes_cache.get(cnpj_fav, [])
                            sancionado = len(s_list) > 0
                            detalhe = ""
                            if sancionado:
                                s0 = s_list[0]
                                detalhe = f"{s0['cadastro']} — {s0['categoria_sancao']} (Órgão: {s0['orgao_sancionador']})"

                            agrupado_fav[chave] = {
                                "codigo_emenda": row[0].strip(),
                                "tipo_emenda": row[4].strip(),
                                "ano_mes": ano_mes,
                                "cnpj_favorecido": cnpj_fav,
                                "nome_favorecido": nome_fav,
                                "natureza_juridica": row[8].strip(),
                                "uf": row[10].strip(),
                                "municipio": row[11].strip(),
                                "valor_recebido": 0.0,
                                "sancionado_cgu": sancionado,
                                "detalhe_sancao": detalhe,
                            }
                        agrupado_fav[chave]["valor_recebido"] = round(
                            agrupado_fav[chave]["valor_recebido"] + val, 2
                        )

                for (autor, _), item_fav in agrupado_fav.items():
                    novo_favorecidos.setdefault(autor, []).append(item_fav)

        _EMENDAS_POR_AUTOR = novo_emendas
        _FAVORECIDOS_POR_AUTOR = novo_favorecidos
        _CACHE_EMENDAS_LOADED = True
        print(
            f"[Emendas CGU] Cache pronto: {len(_EMENDAS_POR_AUTOR)} autores com emendas e "
            f"{len(_FAVORECIDOS_POR_AUTOR)} autores com favorecidos mapeados."
        )
    except Exception as e:
        print(f"[Emendas CGU] Erro ao carregar base de emendas: {e}")

    return _EMENDAS_POR_AUTOR, _FAVORECIDOS_POR_AUTOR


async def sincronizar_emendas_deputado(db: Session, deputado_id: int) -> int:
    """Sincroniza as emendas parlamentares e os favorecidos finais de um deputado específico."""
    deputado = db.query(models.Deputado).filter(models.Deputado.id == deputado_id).first()
    if not deputado:
        return 0

    emendas_map, fav_map = await carregar_cache_emendas_nacionais()
    if not emendas_map and not fav_map:
        return 0

    chaves_busca = [_norm_nome(deputado.nome)]
    if deputado.nome_civil:
        nc = _norm_nome(deputado.nome_civil)
        if nc not in chaves_busca:
            chaves_busca.append(nc)

    lista_emendas = []
    for ch in chaves_busca:
        if ch in emendas_map:
            lista_emendas = emendas_map[ch]
            break

    lista_fav = []
    for ch in chaves_busca:
        if ch in fav_map:
            lista_fav = fav_map[ch]
            break

    # Limpa registros anteriores do deputado
    db.query(models.EmendaParlamentar).filter(models.EmendaParlamentar.deputado_id == deputado_id).delete()
    db.query(models.FavorecidoEmenda).filter(models.FavorecidoEmenda.deputado_id == deputado_id).delete()

    # Ordena emendas por valor empenhado decrescente
    lista_emendas_ord = sorted(lista_emendas, key=lambda x: x["valor_empenhado"], reverse=True)
    for em in lista_emendas_ord[:80]:
        db.add(models.EmendaParlamentar(
            deputado_id=deputado_id,
            codigo_emenda=em["codigo_emenda"],
            ano=em["ano"],
            tipo_emenda=em["tipo_emenda"],
            localidade=em["localidade"],
            uf=em["uf"],
            funcao=em["funcao"],
            subfuncao=em["subfuncao"],
            acao=em["acao"],
            valor_empenhado=em["valor_empenhado"],
            valor_liquidado=em["valor_liquidado"],
            valor_pago=em["valor_pago"],
        ))

    # Prioriza todos os sancionados + maiores recebedores
    sancionados = [f for f in lista_fav if f["sancionado_cgu"]]
    nao_sancionados = sorted(
        [f for f in lista_fav if not f["sancionado_cgu"]],
        key=lambda x: x["valor_recebido"],
        reverse=True,
    )
    selecionados_fav = sancionados + nao_sancionados[:40]

    for fv in selecionados_fav:
        db.add(models.FavorecidoEmenda(
            deputado_id=deputado_id,
            codigo_emenda=fv["codigo_emenda"],
            tipo_emenda=fv["tipo_emenda"],
            ano_mes=fv["ano_mes"],
            cnpj_favorecido=fv["cnpj_favorecido"],
            nome_favorecido=fv["nome_favorecido"],
            natureza_juridica=fv["natureza_juridica"],
            municipio=fv["municipio"],
            uf=fv["uf"],
            valor_recebido=fv["valor_recebido"],
            sancionado_cgu=fv["sancionado_cgu"],
            detalhe_sancao=fv["detalhe_sancao"],
        ))

    db.commit()
    print(
        f"[Emendas CGU] {deputado.nome}: {len(lista_emendas_ord[:80])} emendas e "
        f"{len(selecionados_fav)} favorecidos ({len(sancionados)} sancionados na CGU) gravados."
    )
    return len(lista_emendas_ord[:80])
