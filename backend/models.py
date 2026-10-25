from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, Boolean
from sqlalchemy.orm import relationship
from database import Base


class Deputado(Base):
    __tablename__ = "deputados"

    id = Column(Integer, primary_key=True, index=True)  # id da camara
    nome = Column(String, index=True)
    partido = Column(String)
    uf = Column(String)
    url_foto = Column(String)
    patrimonio_declarado = Column(Float, nullable=True)
    indice_risco = Column(Float, default=0.0)
    nome_civil = Column(String, nullable=True)

    despesas = relationship("DespesaCEAP", back_populates="deputado")
    alertas = relationship("Alerta", back_populates="deputado")
    assessores = relationship("AssessorGabinete", back_populates="deputado")
    doacoes_campanha = relationship("DoacaoCampanha", back_populates="deputado")
    emendas = relationship("EmendaParlamentar", back_populates="deputado")
    favorecidos_emendas = relationship("FavorecidoEmenda", back_populates="deputado")
    contratos_pncp = relationship("ContratoPublicoPNCP", back_populates="deputado")
    dossies_fornecedores = relationship("DossieFornecedorGabinete", back_populates="deputado")
    vinculos_nepotismo = relationship("VinculoGabineteNepotismo", back_populates="deputado")
    processos_judiciais = relationship("ProcessoJudicialRadar", back_populates="deputado")


class Fornecedor(Base):
    __tablename__ = "fornecedores"

    cnpj = Column(String, primary_key=True, index=True)
    razao_social = Column(String)
    situacao_cadastral = Column(String)
    data_situacao_cadastral = Column(String, nullable=True)
    cnae_fiscal_descricao = Column(String, nullable=True)
    cnaes_secundarios = Column(String, nullable=True)
    municipio = Column(String, nullable=True)
    uf = Column(String, nullable=True)
    capital_social = Column(Float, nullable=True)
    data_inicio_atividade = Column(String, nullable=True)
    opcao_pelo_mei = Column(Boolean, default=False, nullable=True)
    qsa_nomes = Column(String, nullable=True)

    despesas = relationship("DespesaCEAP", back_populates="fornecedor_rel")
    sancoes = relationship("SancaoFornecedor", back_populates="fornecedor_rel")


class DespesaCEAP(Base):
    __tablename__ = "despesas_ceap"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"))
    fornecedor_cnpj = Column(String, ForeignKey("fornecedores.cnpj"))
    valor = Column(Float)
    data = Column(Date)
    tipo_despesa = Column(String)
    municipio = Column(String, nullable=True)
    url_documento = Column(String, nullable=True)
    num_documento = Column(String, nullable=True)

    deputado = relationship("Deputado", back_populates="despesas")
    fornecedor_rel = relationship("Fornecedor", back_populates="despesas")
    alerta_gerado = relationship("Alerta", back_populates="despesa_relacionada")


class Alerta(Base):
    __tablename__ = "alertas"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"))
    tipo_heuristica = Column(String)
    severidade = Column(String)  # "ALTA", "MEDIA", "BAIXA"
    descricao = Column(String)
    despesa_id = Column(Integer, ForeignKey("despesas_ceap.id"), nullable=True)
    valor_envolvido = Column(Float, nullable=True)

    deputado = relationship("Deputado", back_populates="alertas")
    despesa_relacionada = relationship("DespesaCEAP", back_populates="alerta_gerado")


class SancaoFornecedor(Base):
    __tablename__ = "sancoes_fornecedores"

    id = Column(Integer, primary_key=True, index=True)
    cnpj = Column(String, ForeignKey("fornecedores.cnpj"), index=True)
    cadastro = Column(String)  # "CEIS", "CNEP", "CEPIM", "TCU"
    categoria_sancao = Column(String, nullable=True)
    orgao_sancionador = Column(String, nullable=True)
    uf_orgao = Column(String, nullable=True)
    numero_processo = Column(String, nullable=True)
    data_inicio = Column(String, nullable=True)
    data_final = Column(String, nullable=True)
    fundamentacao_legal = Column(String, nullable=True)

    fornecedor_rel = relationship("Fornecedor", back_populates="sancoes")


class AssessorGabinete(Base):
    __tablename__ = "assessores_gabinete"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"), index=True)
    nome = Column(String, index=True)
    cargo = Column(String, nullable=True)
    situacao = Column(String, nullable=True)
    remuneracao_url = Column(String, nullable=True)

    deputado = relationship("Deputado", back_populates="assessores")


class DoacaoCampanha(Base):
    __tablename__ = "doacoes_campanha"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"), index=True)
    cpf_cnpj_doador = Column(String, index=True)
    nome_doador = Column(String)
    valor = Column(Float, default=0.0)
    tipo_recurso = Column(String, nullable=True)  # "DOADOR" ou "FORNECEDOR_CAMPANHA"

    deputado = relationship("Deputado", back_populates="doacoes_campanha")


class EmendaParlamentar(Base):
    __tablename__ = "emendas_parlamentares"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"), index=True)
    codigo_emenda = Column(String, index=True)
    ano = Column(Integer)
    tipo_emenda = Column(String)
    localidade = Column(String, nullable=True)
    uf = Column(String, nullable=True)
    funcao = Column(String, nullable=True)
    subfuncao = Column(String, nullable=True)
    acao = Column(String, nullable=True)
    valor_empenhado = Column(Float, default=0.0)
    valor_liquidado = Column(Float, default=0.0)
    valor_pago = Column(Float, default=0.0)

    deputado = relationship("Deputado", back_populates="emendas")


class FavorecidoEmenda(Base):
    __tablename__ = "favorecidos_emendas"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"), index=True)
    codigo_emenda = Column(String, nullable=True)
    tipo_emenda = Column(String, nullable=True)
    ano_mes = Column(String, nullable=True)
    cnpj_favorecido = Column(String, index=True)
    nome_favorecido = Column(String)
    natureza_juridica = Column(String, nullable=True)
    municipio = Column(String, nullable=True)
    uf = Column(String, nullable=True)
    valor_recebido = Column(Float, default=0.0)
    sancionado_cgu = Column(Boolean, default=False)
    detalhe_sancao = Column(String, nullable=True)

    deputado = relationship("Deputado", back_populates="favorecidos_emendas")


class ContratoPublicoPNCP(Base):
    __tablename__ = "contratos_pncp"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"), index=True)
    fornecedor_cnpj = Column(String, index=True)
    fornecedor_nome = Column(String)
    orgao_publico = Column(String)
    uf_orgao = Column(String, nullable=True)
    municipio_orgao = Column(String, nullable=True)
    esfera = Column(String, nullable=True)
    objeto_contrato = Column(String, nullable=True)
    valor_global = Column(Float, default=0.0)
    data_assinatura = Column(String, nullable=True)
    numero_controle_pncp = Column(String, nullable=True)

    deputado = relationship("Deputado", back_populates="contratos_pncp")


class DossieFornecedorGabinete(Base):
    __tablename__ = "dossies_fornecedores_gabinete"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"), index=True)
    cnpj = Column(String, index=True)
    razao_social = Column(String)
    nome_fantasia = Column(String, nullable=True)
    logradouro = Column(String, nullable=True)
    numero = Column(String, nullable=True)
    complemento = Column(String, nullable=True)
    bairro = Column(String, nullable=True)
    cep = Column(String, index=True, nullable=True)
    municipio = Column(String, nullable=True)
    uf = Column(String, nullable=True)
    telefone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    porte = Column(String, nullable=True)
    capital_social = Column(Float, default=0.0)
    data_abertura = Column(String, nullable=True)
    cnae_principal = Column(String, nullable=True)
    situacao_cadastral = Column(String, nullable=True)
    qsa_socios = Column(String, nullable=True)
    total_recebido_deputado = Column(Float, default=0.0)
    qtd_notas_deputado = Column(Integer, default=0)
    categoria_principal_gasto = Column(String, nullable=True)
    url_google_maps = Column(String, nullable=True)
    indicio_cartel_ou_fantasma = Column(Boolean, default=False)
    detalhe_indicio = Column(String, nullable=True)

    deputado = relationship("Deputado", back_populates="dossies_fornecedores")


class VinculoGabineteNepotismo(Base):
    __tablename__ = "vinculos_gabinete_nepotismo"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"), index=True)
    assessor_nome = Column(String, index=True)
    assessor_cargo = Column(String, nullable=True)
    tipo_vinculo = Column(String)
    gravidade = Column(String, default="ALTA")
    sobrenome_conexao = Column(String, nullable=True)
    parlamentar_ou_empresa_alvo = Column(String)
    esfera_alvo = Column(String, nullable=True)
    uf_alvo = Column(String, nullable=True)
    partido_alvo = Column(String, nullable=True)
    detalhe_completo = Column(String)
    remuneracao_url = Column(String, nullable=True)

    deputado = relationship("Deputado", back_populates="vinculos_nepotismo")


class ProcessoJudicialRadar(Base):
    __tablename__ = "processos_judiciais_radar"

    id = Column(Integer, primary_key=True, index=True)
    deputado_id = Column(Integer, ForeignKey("deputados.id"), index=True)
    numero_processo = Column(String, index=True)
    tribunal = Column(String)
    classe_processual = Column(String)
    orgao_julgador = Column(String, nullable=True)
    assuntos = Column(String, nullable=True)
    polo_alvo = Column(String)
    qtd_movimentacoes = Column(Integer, default=0)
    ultima_movimentacao = Column(String, nullable=True)
    data_ajuizamento_ou_certidao = Column(String, nullable=True)
    grau_risco = Column(String, default="MEDIA")
    url_consulta = Column(String, nullable=True)

    deputado = relationship("Deputado", back_populates="processos_judiciais")





