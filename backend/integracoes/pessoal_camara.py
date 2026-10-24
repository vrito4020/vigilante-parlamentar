"""
Módulo de Sincronização de Pessoal de Gabinete (Secretários Parlamentares e Cargos de Natureza Especial)
junto ao Portal de Transparência e Recursos Humanos da Câmara dos Deputados.
"""
import re
import html
import unicodedata
import httpx
from sqlalchemy.orm import Session
import models

CAMARA_RH_URL = "https://www.camara.leg.br/transparencia/recursos-humanos/funcionarios"


def _normalizar(txt: str) -> str:
    if not txt:
        return ""
    nfkd = unicodedata.normalize("NFKD", txt.upper())
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


async def fetch_assessores_gabinete(nome_parlamentar: str) -> list:
    """
    Consulta a relação oficial de servidores e secretários parlamentares lotados
    no gabinete do deputado na Câmara dos Deputados.
    """
    if not nome_parlamentar:
        return []

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    lotacao_query = f"Gabinete {nome_parlamentar}"
    assessores = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            r = await client.get(
                CAMARA_RH_URL,
                params={"lotacao": lotacao_query},
                headers=headers,
                follow_redirects=True,
            )
            if r.status_code != 200:
                return []

            rows = re.findall(r"<tr[^>]*>(.*?)</tr>", r.text, re.S)
            nome_dep_norm = _normalizar(nome_parlamentar)

            for row in rows:
                cols_raw = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
                if len(cols_raw) < 2:
                    continue

                nome_limpo = html.unescape(re.sub(r"<[^>]+>", "", cols_raw[0])).strip()
                nome_limpo = re.sub(r"\s+", " ", nome_limpo)
                cargo_limpo = html.unescape(re.sub(r"<[^>]+>", "", cols_raw[1])).strip()
                cargo_limpo = re.sub(r"\s+", " ", cargo_limpo)

                # Ignora a linha do próprio deputado titular
                if cargo_limpo.upper() == "DEPUTADO" or _normalizar(nome_limpo) == nome_dep_norm:
                    continue

                # Extrai link de consulta de remuneração se existir
                rem_link = None
                if len(cols_raw) >= 4:
                    m_href = re.search(r'href="([^"]+)"', cols_raw[3])
                    if m_href:
                        rem_link = m_href.group(1)

                if nome_limpo:
                    assessores.append({
                        "nome": nome_limpo,
                        "cargo": cargo_limpo or "Secretário Parlamentar",
                        "situacao": "Em exercício",
                        "remuneracao_url": rem_link,
                    })
        except Exception as e:
            print(f"[Pessoal Câmara] Erro ao buscar gabinete de {nome_parlamentar}: {e}")

    return assessores


async def sincronizar_assessores_deputado(db: Session, deputado_id: int) -> int:
    """Sincroniza e persiste no banco local a folha de secretários parlamentares do gabinete do deputado."""
    dep = db.query(models.Deputado).filter(models.Deputado.id == deputado_id).first()
    if not dep:
        return 0

    lista = await fetch_assessores_gabinete(dep.nome)
    if not lista:
        return 0

    db.query(models.AssessorGabinete).filter(models.AssessorGabinete.deputado_id == deputado_id).delete()
    for a in lista:
        db.add(models.AssessorGabinete(
            deputado_id=deputado_id,
            nome=a["nome"],
            cargo=a["cargo"],
            situacao=a["situacao"],
            remuneracao_url=a["remuneracao_url"],
        ))
    db.commit()
    print(f"[Pessoal Câmara] {len(lista)} secretários sincronizados para {dep.nome}")
    return len(lista)
