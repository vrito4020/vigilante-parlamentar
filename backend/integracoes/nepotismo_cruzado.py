import json
import os
import re
import unicodedata
from collections import defaultdict
import httpx
from sqlalchemy.orm import Session
import models

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
SENADORES_CACHE_FILE = os.path.join(CACHE_DIR, "senadores_atuais.json")

CONNECTORS = {"DE", "DA", "DO", "DAS", "DOS", "E", "FILHO", "NETO", "JUNIOR", "JR", "SOBRINHO", "SEGUNDO", "TERCEIRO"}

# Sobrenomes patronímicos muito comuns no Brasil (filtrados quando isolados para evitar falsos positivos)
SOBRENOMES_COMUNS_BR = {
    "SILVA", "SANTOS", "SOUZA", "SOUSA", "OLIVEIRA", "PEREIRA", "LIMA", "CARVALHO",
    "FERREIRA", "RODRIGUES", "ALVES", "COSTA", "GOMES", "MARTINS", "ARAUJO", "MELO",
    "BARBOSA", "RIBEIRO", "ALMEIDA", "NASCIMENTO", "MOREIRA", "TEIXEIRA", "CORREIA",
    "CORREA", "VIEIRA", "MONTEIRO", "CARDOSO", "ROCHA", "DIAS", "MENDES", "FREITAS",
    "MACHADO", "RAMOS", "REIS", "MOURA", "ANDRADE", "NUNES", "CASTRO", "CAMPOS",
    "PINTO", "BORGES", "LOPES", "MARQUES", "MIRANDA", "LEITE", "MEDEIROS", "PINHEIRO",
    "BATISTA", "MORAES", "MORAIS", "DUARTE", "SANTANA", "FARIAS", "CRUZ", "GUIMARAES",
    "GONCALVES", "BEZERRA", "CUNHA", "SIQUEIRA", "MACEDO", "BRITO", "XAVIER", "SALES",
    "PAULA", "NEVES", "FONSECA", "AZEVEDO", "PIRES", "COELHO", "AGUIAR", "ASSIS",
    "TAVARES", "BARROS", "MOTA", "MORAIS", "LOPES", "SOARES", "FERNANDES", "GARCIA",
    "RANGEL", "PRADO", "PACHECO", "MACIEL", "AMARAL", "CINTRA", "BUENO", "CAMARGO",
}

PRENOMES_COMUNS = {
    "MARIA", "JOSE", "JOAO", "ANA", "PAULO", "CARLOS", "LUIS", "LUIZ", "ANTONIO",
    "FRANCISCO", "PEDRO", "LUCAS", "MARCOS", "RAFAEL", "GABRIEL", "DANIEL", "BRUNO",
    "EDUARDO", "FELIPE", "RODRIGO", "FERNANDO", "GUSTAVO", "ANDRE", "MARCELO",
    "RICARDO", "TIAGO", "THIAGO", "LEONARDO", "ALEXANDRE", "ROBERTO", "SERGIO",
    "JORGE", "JULIO", "CESAR", "CAIO", "FABIO", "VITOR", "VICTOR", "HENRIQUE",
    "GUILHERME", "DIEGO", "LEANDRO", "MATHEUS", "MATEUS", "VINICIUS", "RENATO",
    "CLAUDIO", "MAURICIO", "CRISTIANO", "ADRIANO", "LUCIANO", "FLAVIO", "MARCIO",
    "VALTER", "WALTER", "GILBERTO", "HUMBERTO", "BENEDITO", "SEBASTIAO", "RAIMUNDO",
    "MANOEL", "MANUEL", "GERALDO", "EDSON", "NELSON", "WILSON", "MILTON", "NEWTON",
    "CRISTINA", "APARECIDO", "APARECIDA", "LUCIA", "HELENA", "CASSIA", "CARMO",
    "JESUS", "FATIMA", "TEREZA", "TERESA", "REGINA", "CLAUDIA", "PATRICIA",
    "SANDRA", "MARCIA", "ADRIANA", "JULIANA", "FERNANDA", "CAMILA", "AMANDA",
    "BRUNA", "LETICIA", "VANESSA", "PRISCILA", "TATIANA", "RENATA", "SIMONE",
    "DENISE", "MONICA", "SILVIA", "VERA", "SONIA", "RITA", "ROSA", "CELIA",
    "SUELI", "NEUZA", "IRENE", "ELIANE", "ELAINE", "CRISTIANE", "DANIELE",
    "DANIELA", "GABRIELA", "RAQUEL", "DEBORA", "BEATRIZ", "CAROLINA", "LARISSA",
    "NATALIA", "ALINE", "BIANCA", "AUGUSTO", "ALBERTO", "AFONSO", "ARTUR", "ARTHUR",
}


def _norm(txt: str) -> str:
    if not txt:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(txt).upper())
    limpo = "".join(c for c in nfkd if not unicodedata.combining(c))
    limpo = re.sub(r"[^A-Z\s]", " ", limpo)
    return re.sub(r"\s+", " ", limpo).strip()


def _extrair_sobrenomes_raros(nome_completo: str) -> list:
    norm = _norm(nome_completo)
    partes = [p for p in norm.split() if len(p) > 2 and p not in CONNECTORS]
    if len(partes) <= 1:
        return []
    # Descarta o primeiro nome (prenome) e eventuais segundos nomes compostos comuns
    sobrenomes = []
    for p in partes[1:]:
        if p in SOBRENOMES_COMUNS_BR or p in PRENOMES_COMUNS or len(p) <= 3:
            continue
        sobrenomes.append(p)
    return sobrenomes


def _extrair_sobrenomes_para_cla_interno(nome_completo: str) -> list:
    """Para clã interno no mesmo gabinete (mesma folha de ~19 pessoas), permite sobrenomes intermediários."""
    MAIS_COMUNS_TOP20 = {
        "SILVA", "SANTOS", "SOUZA", "SOUSA", "OLIVEIRA", "PEREIRA", "LIMA",
        "FERREIRA", "RODRIGUES", "ALVES", "COSTA", "GOMES", "MARTINS", "ARAUJO",
        "RIBEIRO", "ALMEIDA", "NASCIMENTO", "CARVALHO", "GONCALVES", "SOARES",
    }
    norm = _norm(nome_completo)
    partes = [p for p in norm.split() if len(p) > 3 and p not in CONNECTORS]
    if len(partes) <= 1:
        return []
    return [p for p in partes[1:] if p not in MAIS_COMUNS_TOP20 and p not in PRENOMES_COMUNS]


async def carregar_senadores_em_exercicio() -> list:
    if os.path.exists(SENADORES_CACHE_FILE):
        try:
            with open(SENADORES_CACHE_FILE, "r", encoding="utf-8") as f:
                dados = json.load(f)
                if dados:
                    return dados
        except Exception:
            pass

    url = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json"
    headers = {"Accept": "application/json", "User-Agent": "VigilanteParlamentar/2.0"}
    senadores = []
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            r = await client.get(url)
            if r.status_code == 200:
                data = r.json()
                parlamentares = (
                    data.get("ListaParlamentarEmExercicio", {})
                    .get("Parlamentares", {})
                    .get("Parlamentar", [])
                )
                for p in parlamentares:
                    ident = p.get("IdentificacaoParlamentar", {})
                    nome_parl = ident.get("NomeParlamentar") or ""
                    nome_comp = ident.get("NomeCompletoParlamentar") or nome_parl
                    uf = ident.get("UfParlamentar") or ""
                    partido = ident.get("SiglaPartidoParlamentar") or ""
                    codigo = ident.get("CodigoParlamentar") or ""
                    if nome_comp:
                        senadores.append({
                            "id": f"SEN_{codigo}",
                            "nome": nome_parl,
                            "nome_civil": nome_comp,
                            "uf": uf,
                            "partido": partido,
                            "casa": "Senado Federal",
                        })
                if senadores:
                    with open(SENADORES_CACHE_FILE, "w", encoding="utf-8") as f:
                        json.dump(senadores, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"  [Nepotismo/Senado] Aviso ao consultar API do Senado: {e}")

    return senadores


async def sincronizar_nepotismo_cruzado_deputado(db: Session, deputado_id: int) -> int:
    """
    Audita a folha de Secretários Parlamentares do gabinete do deputado cruzando com:
      1. Todos os 513 Deputados Federais e 81 Senadores da República (Nepotismo Cruzado Intergabinetes)
      2. Próprio Deputado Titular (Nepotismo Direto)
      3. Clãs Familiares Internos (Múltiplos assessores da mesma família no mesmo gabinete)
      4. Doadores e Fornecedores de Campanha no TSE (Rachadinha Eleitoral / Financiadores nomeados)
      5. Quadro Societário (QSA) de Fornecedores CEAP e Favorecidos de Emendas
    """
    dep = db.query(models.Deputado).filter(models.Deputado.id == deputado_id).first()
    if not dep:
        return 0

    assessores = (
        db.query(models.AssessorGabinete)
        .filter(models.AssessorGabinete.deputado_id == deputado_id)
        .all()
    )
    if not assessores:
        return 0

    db.query(models.VinculoGabineteNepotismo).filter(
        models.VinculoGabineteNepotismo.deputado_id == deputado_id
    ).delete(synchronize_session=False)
    db.commit()

    senadores = await carregar_senadores_em_exercicio()
    todos_deputados = db.query(models.Deputado).all()

    # Monta índice de parlamentares do Congresso Nacional (Câmara + Senado)
    congresso = []
    for d_outro in todos_deputados:
        if d_outro.id == dep.id:
            continue
        congresso.append({
            "id": str(d_outro.id),
            "nome": d_outro.nome,
            "nome_civil": d_outro.nome_civil or d_outro.nome,
            "uf": (d_outro.uf or "").upper(),
            "partido": (d_outro.partido or "").upper(),
            "casa": "Câmara dos Deputados",
            "sobrenomes_raros": set(_extrair_sobrenomes_raros(d_outro.nome_civil or d_outro.nome)),
        })
    for s in senadores:
        congresso.append({
            "id": s["id"],
            "nome": s["nome"],
            "nome_civil": s["nome_civil"],
            "uf": (s["uf"] or "").upper(),
            "partido": (s["partido"] or "").upper(),
            "casa": "Senado Federal",
            "sobrenomes_raros": set(_extrair_sobrenomes_raros(s["nome_civil"] or s["nome"])),
        })

    sobrenomes_proprio_dep = set(_extrair_sobrenomes_raros(dep.nome_civil or dep.nome))

    inseridos = 0
    chaves_inseridas = set()

    # 1. VERIFICA NEPOTISMO DIRETO E NEPOTISMO CRUZADO (CÂMARA × SENADO)
    for a in assessores:
        sobs_a = set(_extrair_sobrenomes_raros(a.nome))
        if not sobs_a:
            continue

        # 1a. Parentesco com o próprio deputado titular
        comum_proprio = sobs_a.intersection(sobrenomes_proprio_dep)
        if comum_proprio:
            sob_str = ", ".join(sorted(comum_proprio))
            chave = f"DIRETO_{a.nome}_{sob_str}"
            if chave not in chaves_inseridas:
                chaves_inseridas.add(chave)
                db.add(models.VinculoGabineteNepotismo(
                    deputado_id=dep.id,
                    assessor_nome=a.nome,
                    assessor_cargo=a.cargo or "Secretário Parlamentar",
                    tipo_vinculo="NEPOTISMO_DIRETO_PARLAMENTAR",
                    gravidade="ALTA",
                    sobrenome_conexao=sob_str,
                    parlamentar_ou_empresa_alvo=f"Deputado Titular {dep.nome} ({dep.partido}/{dep.uf})",
                    esfera_alvo="Próprio Gabinete Parlamentar",
                    uf_alvo=dep.uf,
                    partido_alvo=dep.partido,
                    detalhe_completo=(
                        f"O(a) secretário(a) parlamentar {a.nome} ({a.cargo}) compartilha o sobrenome familiar "
                        f"'{sob_str}' diretamente com o deputado titular do gabinete ({dep.nome_civil or dep.nome})."
                    ),
                    remuneracao_url=a.remuneracao_url,
                ))
                inseridos += 1

        # 1b. Nepotismo Cruzado com Senadores ou Deputados (mesma UF, mesmo Partido ou 2+ sobrenomes raros)
        for parl in congresso:
            if not parl["sobrenomes_raros"]:
                continue
            inter = sobs_a.intersection(parl["sobrenomes_raros"])
            if not inter:
                continue

            mesma_uf = parl["uf"] == (dep.uf or "").upper()
            mesmo_partido = parl["partido"] == (dep.partido or "").upper()
            multiplos_sobs = len(inter) >= 2

            # Prioriza conexões na mesma bancada estadual (UF) ou com múltiplos sobrenomes raros
            if mesma_uf or multiplos_sobs or (mesmo_partido and any(len(s) >= 6 for s in inter)):
                sob_str = ", ".join(sorted(inter))
                chave = f"CRUZADO_{a.nome}_{parl['id']}"
                if chave in chaves_inseridas:
                    continue
                chaves_inseridas.add(chave)
                titulo_parl = "Senador(a)" if parl["casa"] == "Senado Federal" else "Deputado(a) Federal"
                contexto = "mesma bancada estadual" if mesma_uf else ("mesmo partido político" if mesmo_partido else "composto familiar")
                db.add(models.VinculoGabineteNepotismo(
                    deputado_id=dep.id,
                    assessor_nome=a.nome,
                    assessor_cargo=a.cargo or "Secretário Parlamentar",
                    tipo_vinculo="NEPOTISMO_CRUZADO_CONGRESSO",
                    gravidade="ALTA" if (mesma_uf or multiplos_sobs) else "MEDIA",
                    sobrenome_conexao=sob_str,
                    parlamentar_ou_empresa_alvo=f"{titulo_parl} {parl['nome']} ({parl['partido']}/{parl['uf']})",
                    esfera_alvo=parl["casa"],
                    uf_alvo=parl["uf"],
                    partido_alvo=parl["partido"],
                    detalhe_completo=(
                        f"Indício de Nepotismo Cruzado ({parl['casa']}): {a.nome} ({a.cargo} no gabinete de {dep.nome}) "
                        f"compartilha o sobrenome familiar '{sob_str}' com o(a) {titulo_parl} {parl['nome']} "
                        f"(nome civil: {parl['nome_civil']} — {parl['partido']}/{parl['uf']}, {contexto})."
                    ),
                    remuneracao_url=a.remuneracao_url,
                ))
                inseridos += 1
                break

    # 2. CLÃS FAMILIARES INTERNOS NO MESMO GABINETE (2+ assessores da mesma família no gabinete)
    por_sobrenome_interno = defaultdict(list)
    for a in assessores:
        for sob in set(_extrair_sobrenomes_para_cla_interno(a.nome)):
            por_sobrenome_interno[sob].append(a)

    for sob, lista_a in por_sobrenome_interno.items():
        nomes_distintos = { _norm(x.nome): x for x in lista_a }
        if len(nomes_distintos) >= 2:
            membros = list(nomes_distintos.values())
            nomes_outros_str = ", ".join(m.nome for m in membros)
            for m in membros:
                chave = f"CLA_{m.nome}_{sob}"
                if chave not in chaves_inseridas:
                    chaves_inseridas.add(chave)
                    db.add(models.VinculoGabineteNepotismo(
                        deputado_id=dep.id,
                        assessor_nome=m.nome,
                        assessor_cargo=m.cargo or "Secretário Parlamentar",
                        tipo_vinculo="CLA_FAMILIAR_INTERNO",
                        gravidade="ALTA" if len(membros) >= 3 else "MEDIA",
                        sobrenome_conexao=sob,
                        parlamentar_ou_empresa_alvo=f"Clã '{sob}' ({len(membros)} lotados no gabinete)",
                        esfera_alvo="Folha Interna do Gabinete",
                        uf_alvo=dep.uf,
                        partido_alvo=dep.partido,
                        detalhe_completo=(
                            f"Concentração Familiar na Folha do Gabinete: {len(membros)} secretários parlamentares "
                            f"lotados simultaneamente no gabinete de {dep.nome} compartilham o sobrenome '{sob}' "
                            f"({nomes_outros_str})."
                        ),
                        remuneracao_url=m.remuneracao_url,
                    ))
                    inseridos += 1

    # 3. CRUZAMENTO ASSESSORES × DOADORES/FORNECEDORES DE CAMPANHA ELEITORAL TSE (RACHADINHA ELEITORAL)
    doacoes = db.query(models.DoacaoCampanha).filter(models.DoacaoCampanha.deputado_id == dep.id).all()
    if doacoes:
        doadores_norm = {_norm(d.nome_doador): d for d in doacoes if d.nome_doador}
        for a in assessores:
            a_norm = _norm(a.nome)
            if a_norm in doadores_norm:
                d_obj = doadores_norm[a_norm]
                chave = f"TSE_EXATO_{a_norm}"
                if chave not in chaves_inseridas:
                    chaves_inseridas.add(chave)
                    db.add(models.VinculoGabineteNepotismo(
                        deputado_id=dep.id,
                        assessor_nome=a.nome,
                        assessor_cargo=a.cargo or "Secretário Parlamentar",
                        tipo_vinculo="ASSESSOR_DOADOR_TSE",
                        gravidade="ALTA",
                        sobrenome_conexao="Match Nominal Exato TSE",
                        parlamentar_ou_empresa_alvo=f"Financiador Eleitoral TSE (R$ {d_obj.valor:,.2f})",
                        esfera_alvo="Justiça Eleitoral (TSE)",
                        uf_alvo=dep.uf,
                        partido_alvo=dep.partido,
                        detalhe_completo=(
                            f"Retorno / Rachadinha Eleitoral TSE: O(a) secretário(a) parlamentar {a.nome} ({a.cargo}) "
                            f"consta na prestação de contas do TSE como financiador/fornecedor da campanha de {dep.nome} "
                            f"no valor de R$ {d_obj.valor:,.2f} e foi nomeado(a) em cargo comissionado no gabinete."
                        ),
                        remuneracao_url=a.remuneracao_url,
                    ))
                    inseridos += 1
                    continue

            # Verifica sobrenome raro em comum com grandes doadores PF da campanha
            sobs_a = set(_extrair_sobrenomes_raros(a.nome))
            if sobs_a:
                for d_obj in doacoes:
                    if len(re.sub(r"\D", "", d_obj.cpf_cnpj_doador or "")) == 11 and (d_obj.valor or 0) >= 2000.0:
                        sobs_d = set(_extrair_sobrenomes_raros(d_obj.nome_doador))
                        inter_d = sobs_a.intersection(sobs_d)
                        if inter_d:
                            sob_str = ", ".join(sorted(inter_d))
                            chave = f"TSE_FAM_{a.nome}_{d_obj.nome_doador}"
                            if chave not in chaves_inseridas:
                                chaves_inseridas.add(chave)
                                db.add(models.VinculoGabineteNepotismo(
                                    deputado_id=dep.id,
                                    assessor_nome=a.nome,
                                    assessor_cargo=a.cargo or "Secretário Parlamentar",
                                    tipo_vinculo="ASSESSOR_DOADOR_TSE",
                                    gravidade="ALTA",
                                    sobrenome_conexao=sob_str,
                                    parlamentar_ou_empresa_alvo=f"Doador TSE {d_obj.nome_doador} (R$ {d_obj.valor:,.2f})",
                                    esfera_alvo="Justiça Eleitoral (TSE)",
                                    uf_alvo=dep.uf,
                                    partido_alvo=dep.partido,
                                    detalhe_completo=(
                                        f"Vínculo Familiar com Financiador de Campanha (TSE): O(a) secretário(a) {a.nome} "
                                        f"compartilha o sobrenome '{sob_str}' com o doador eleitoral {d_obj.nome_doador} "
                                        f"(que aportou R$ {d_obj.valor:,.2f} na campanha de {dep.nome})."
                                    ),
                                    remuneracao_url=a.remuneracao_url,
                                ))
                                inseridos += 1
                                break

    # 4. CRUZAMENTO ASSESSORES × QSA DE FORNECEDORES DO GABINETE (RECEITA FEDERAL)
    dossies = db.query(models.DossieFornecedorGabinete).filter(
        models.DossieFornecedorGabinete.deputado_id == dep.id
    ).all()
    if dossies:
        for a in assessores:
            a_norm = _norm(a.nome)
            sobs_a = set(_extrair_sobrenomes_raros(a.nome))
            for df in dossies:
                if not df.qsa_socios:
                    continue
                for soc in df.qsa_socios.split(","):
                    soc_norm = _norm(soc)
                    if not soc_norm:
                        continue
                    sobs_soc = set(_extrair_sobrenomes_raros(soc))
                    inter_soc = sobs_a.intersection(sobs_soc)
                    if soc_norm == a_norm or (inter_soc and any(len(s) >= 5 for s in inter_soc)):
                        sob_str = "Match Exato" if soc_norm == a_norm else ", ".join(sorted(inter_soc))
                        chave = f"QSA_{a.nome}_{df.cnpj[:8]}"
                        if chave not in chaves_inseridas:
                            chaves_inseridas.add(chave)
                            db.add(models.VinculoGabineteNepotismo(
                                deputado_id=dep.id,
                                assessor_nome=a.nome,
                                assessor_cargo=a.cargo or "Secretário Parlamentar",
                                tipo_vinculo="ASSESSOR_VINCULO_EMPRESA",
                                gravidade="ALTA",
                                sobrenome_conexao=sob_str,
                                parlamentar_ou_empresa_alvo=f"{df.razao_social[:38]} (R$ {df.total_recebido_deputado:,.2f})",
                                esfera_alvo="Receita Federal (QSA) × CEAP",
                                uf_alvo=df.uf or dep.uf,
                                partido_alvo=dep.partido,
                                detalhe_completo=(
                                    f"Conflito de Interesse Gabinete × Fornecedor CEAP: O(a) secretário(a) parlamentar "
                                    f"{a.nome} possui vínculo societário/familiar ('{sob_str}') com o sócio {soc.strip()} "
                                    f"da empresa {df.razao_social} (CNPJ {df.cnpj}), que recebeu R$ {df.total_recebido_deputado:,.2f} "
                                    f"da Cota Parlamentar do gabinete."
                                ),
                                remuneracao_url=a.remuneracao_url,
                            ))
                            inseridos += 1
                            break

    db.commit()
    return inseridos
