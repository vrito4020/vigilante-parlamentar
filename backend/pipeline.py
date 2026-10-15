import httpx
import asyncio
from sqlalchemy.orm import Session
from datetime import datetime
import models
import re
import unicodedata

CAMARA_API_URL = "https://dadosabertos.camara.leg.br/api/v2"
BRASIL_API_URL = "https://brasilapi.com.br/api/cnpj/v1"
TSE_API_URL = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1"
TSE_ELEICAO_ID = "2040602022" # Eleições Gerais 2022

# Cache em memória para lista de candidatos do TSE por UF
_tse_candidatos_cache = {}

def clean_cnpj(cnpj_str: str) -> str:
    if not cnpj_str: return ""
    return re.sub(r'[^0-9]', '', str(cnpj_str))

def normalize_text(text: str) -> str:
    if not text: return ""
    return ''.join(c for c in unicodedata.normalize('NFD', text.upper()) if unicodedata.category(c) != 'Mn').strip()

async def fetch_cnpj_data(cnpj: str) -> dict:
    cnpj_clean = clean_cnpj(cnpj)
    if len(cnpj_clean) != 14:
        return None
    
    await asyncio.sleep(0.5) 
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(f"{BRASIL_API_URL}/{cnpj_clean}")
            if response.status_code == 200:
                data = response.json()
                qsa_lista = data.get("qsa", []) or []
                qsa_nomes = ", ".join(s.get("nome_socio", "") for s in qsa_lista if s.get("nome_socio"))
                cnaes_sec = data.get("cnaes_secundarios", []) or []
                cnaes_sec_desc = "; ".join(c.get("descricao", "") for c in cnaes_sec if c.get("descricao"))
                return {
                    "razao_social": data.get("razao_social", "Desconhecido"),
                    "situacao_cadastral": data.get("descricao_situacao_cadastral", "DESCONHECIDO").upper(),
                    "data_situacao_cadastral": data.get("data_situacao_cadastral"),
                    "cnae_fiscal_descricao": data.get("cnae_fiscal_descricao", ""),
                    "cnaes_secundarios": cnaes_sec_desc,
                    "municipio": data.get("municipio", ""),
                    "uf": data.get("uf", ""),
                    "capital_social": float(data.get("capital_social", 0.0) or 0.0),
                    "data_inicio_atividade": data.get("data_inicio_atividade"),
                    "opcao_pelo_mei": bool(data.get("opcao_pelo_mei", False)),
                    "qsa_nomes": qsa_nomes
                }
            else:
                return None
        except Exception as e:
            print(f"Erro ao buscar CNPJ {cnpj}: {e}")
            return None

async def fetch_patrimonio_tse(deputado_id: int, nome_parlamentar: str, uf: str) -> float:
    """Busca a declaração real de bens do deputado no TSE (DivulgaCandContas 2022)."""
    nome_civil = ""
    nome_eleitoral = ""
    headers = {"User-Agent": "Mozilla/5.0"}
    
    async with httpx.AsyncClient(timeout=35.0) as client:
        # 1. Puxa os dados cadastrais da Câmara para obter o nome civil completo
        try:
            r_cam = await client.get(f"{CAMARA_API_URL}/deputados/{deputado_id}")
            if r_cam.status_code == 200:
                cam_data = r_cam.json().get("dados", {})
                nome_civil = normalize_text(cam_data.get("nomeCivil", ""))
                nome_eleitoral = normalize_text(cam_data.get("ultimoStatus", {}).get("nomeEleitoral", ""))
                if not uf:
                    uf = cam_data.get("ultimoStatus", {}).get("siglaUf", "")
        except Exception as e:
            print(f"Erro ao buscar detalhes da Câmara para {deputado_id}: {e}")
            
        if not uf:
            return None
            
        uf = uf.upper()
        
        # 2. Busca lista de candidatos a Deputado Federal (cargo 6) daquela UF no TSE
        if uf not in _tse_candidatos_cache:
            try:
                r_tse = await client.get(
                    f"{TSE_API_URL}/candidatura/listar/2022/{uf}/{TSE_ELEICAO_ID}/6/candidatos",
                    headers=headers
                )
                if r_tse.status_code == 200:
                    _tse_candidatos_cache[uf] = r_tse.json().get("candidatos", [])
                else:
                    _tse_candidatos_cache[uf] = []
            except Exception as e:
                print(f"Erro ao buscar lista TSE para UF {uf}: {e}")
                _tse_candidatos_cache[uf] = []
                
        candidatos = _tse_candidatos_cache.get(uf, [])
        
        # 3. Faz o matching com o deputado
        match = None
        nome_parlamentar_norm = normalize_text(nome_parlamentar)
        
        # Passada 1: nome civil exato ou nome de urna exato
        for c in candidatos:
            c_completo = normalize_text(c.get("nomeCompleto", ""))
            c_urna = normalize_text(c.get("nomeUrna", ""))
            if (nome_civil and c_completo == nome_civil) or (nome_eleitoral and c_urna == nome_eleitoral):
                match = c
                break
                
        # Passada 2: se não achou, tenta pelo nome parlamentar da câmara ou continência
        if not match:
            for c in candidatos:
                c_completo = normalize_text(c.get("nomeCompleto", ""))
                c_urna = normalize_text(c.get("nomeUrna", ""))
                if (c_urna == nome_parlamentar_norm) or (nome_civil and nome_civil in c_completo) or (c_completo and c_completo in nome_civil):
                    match = c
                    break
                    
        if not match:
            print(f"Nenhum match no TSE encontrado para {nome_parlamentar} ({uf})")
            return None
            
        # 4. Busca os bens declarados oficiais do candidato
        cand_id = match.get("id")
        try:
            r_det = await client.get(
                f"{TSE_API_URL}/candidatura/buscar/2022/{uf}/{TSE_ELEICAO_ID}/candidato/{cand_id}",
                headers=headers
            )
            if r_det.status_code == 200:
                data_det = r_det.json()
                total_bens = float(data_det.get("totalDeBens", 0.0) or 0.0)
                print(f"Patrimônio real TSE extraído para {nome_parlamentar}: R$ {total_bens:,.2f}")
                return total_bens
        except Exception as e:
            print(f"Erro ao buscar bens detalhados no TSE para candidato {cand_id}: {e}")
            
    return None

async def extract_deputados(db: Session, limite: int = 1000):
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(f"{CAMARA_API_URL}/deputados", params={"ordem": "ASC", "ordenarPor": "nome", "itens": limite})
        if response.status_code == 200:
            dados = response.json().get("dados", [])
            for item in dados:
                db_dep = db.query(models.Deputado).filter(models.Deputado.id == item["id"]).first()
                if not db_dep:
                    db_dep = models.Deputado(
                        id=item["id"],
                        nome=item["nome"],
                        partido=item["siglaPartido"],
                        uf=item["siglaUf"],
                        url_foto=item["urlFoto"],
                        patrimonio_declarado=None
                    )
                    db.add(db_dep)
            db.commit()

async def extract_patrimonio_real_por_deputado(db: Session, deputado_id: int):
    dep = db.query(models.Deputado).filter(models.Deputado.id == deputado_id).first()
    if not dep: return
    
    total_bens = await fetch_patrimonio_tse(dep.id, dep.nome, dep.uf)
    if total_bens is not None:
        dep.patrimonio_declarado = total_bens
        db.commit()

async def extract_despesas_reais(db: Session, deputado_id: int):
    # Limpa alertas e despesas anteriores para evitar duplicidades
    db.query(models.Alerta).filter(models.Alerta.deputado_id == deputado_id).delete()
    db.query(models.DespesaCEAP).filter(models.DespesaCEAP.deputado_id == deputado_id).delete()
    db.commit()

    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f"{CAMARA_API_URL}/deputados/{deputado_id}/despesas"
        try:
            # Garante que puxamos as notas fiscais oficiais da Legislatura 57 (atual)
            params = {
                "idLegislatura": 57,
                "itens": 100,
                "ordem": "DESC",
                "ordenarPor": "dataDocumento"
            }
            response = await client.get(url, params=params, headers={"User-Agent": "Mozilla/5.0"})
            if response.status_code == 200:
                despesas = response.json().get("dados", [])
                
                # Cache local para evitar consultas repetidas à BrasilAPI dentro do lote
                known_fornecedores = {f.cnpj: f for f in db.query(models.Fornecedor).all()}
                
                for desp in despesas:
                    cnpj_raw = desp.get("cnpjCpfFornecedor")
                    if not cnpj_raw: continue
                    cnpj_clean = clean_cnpj(cnpj_raw)
                    if len(cnpj_clean) != 14: continue
                    
                    if cnpj_clean not in known_fornecedores:
                        cnpj_info = await fetch_cnpj_data(cnpj_clean)
                        if cnpj_info:
                            fornecedor = models.Fornecedor(
                                cnpj=cnpj_clean,
                                razao_social=cnpj_info["razao_social"],
                                situacao_cadastral=cnpj_info["situacao_cadastral"],
                                data_situacao_cadastral=cnpj_info["data_situacao_cadastral"],
                                cnae_fiscal_descricao=cnpj_info["cnae_fiscal_descricao"],
                                cnaes_secundarios=cnpj_info.get("cnaes_secundarios"),
                                municipio=cnpj_info["municipio"],
                                uf=cnpj_info["uf"],
                                capital_social=cnpj_info["capital_social"],
                                data_inicio_atividade=cnpj_info.get("data_inicio_atividade"),
                                opcao_pelo_mei=cnpj_info.get("opcao_pelo_mei", False),
                                qsa_nomes=cnpj_info.get("qsa_nomes")
                            )
                        else:
                            fornecedor = models.Fornecedor(
                                cnpj=cnpj_clean,
                                razao_social=desp.get("nomeFornecedor", "Não Informado"),
                                situacao_cadastral="DESCONHECIDO",
                                capital_social=0.0
                            )
                        db.add(fornecedor)
                        db.commit()
                        known_fornecedores[cnpj_clean] = fornecedor
                    
                    url_doc = desp.get("urlDocumento")
                    existe_despesa = db.query(models.DespesaCEAP).filter(
                        models.DespesaCEAP.deputado_id == deputado_id,
                        models.DespesaCEAP.url_documento == url_doc
                    ).first()
                    
                    if not existe_despesa:
                        data_emissao = datetime.now().date()
                        if desp.get("dataDocumento"):
                            try:
                                data_emissao = datetime.strptime(desp.get("dataDocumento")[:10], "%Y-%m-%d").date()
                            except:
                                pass
                                
                        db_despesa = models.DespesaCEAP(
                            deputado_id=deputado_id,
                            fornecedor_cnpj=cnpj_clean,
                            valor=float(desp.get("valorDocumento", 0.0)),
                            data=data_emissao,
                            tipo_despesa=desp.get("tipoDespesa", ""),
                            url_documento=url_doc,
                            num_documento=str(desp.get("numDocumento") or "").strip()
                        )
                        db.add(db_despesa)
                db.commit()
        except Exception as e:
            print(f"Erro ao buscar despesas do dep {deputado_id}: {e}")


# O motor de regras fica em heuristicas.py (regras calibradas e documentadas)
from heuristicas import rodar_motor_heuristicas_por_deputado  # noqa: E402,F401
