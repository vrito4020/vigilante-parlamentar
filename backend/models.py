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
