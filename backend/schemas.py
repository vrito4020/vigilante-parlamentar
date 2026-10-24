from pydantic import BaseModel
from typing import List, Optional
from datetime import date


class DeputadoBase(BaseModel):
    nome: str
    partido: str
    uf: str
    url_foto: str
    patrimonio_declarado: Optional[float] = None
    indice_risco: float = 0.0
    nome_civil: Optional[str] = None


class DeputadoCreate(DeputadoBase):
    id: int


class DespesaSimples(BaseModel):
    id: int
    valor: float
    data: date
    tipo_despesa: str
    url_documento: Optional[str] = None

    class Config:
        from_attributes = True


class SancaoFornecedorSchema(BaseModel):
    id: int
    cnpj: str
    cadastro: str
    categoria_sancao: Optional[str] = None
    orgao_sancionador: Optional[str] = None
    uf_orgao: Optional[str] = None
    numero_processo: Optional[str] = None
    data_inicio: Optional[str] = None
    data_final: Optional[str] = None
    fundamentacao_legal: Optional[str] = None

    class Config:
        from_attributes = True


class AssessorGabineteSchema(BaseModel):
    id: int
    deputado_id: int
    nome: str
    cargo: Optional[str] = None
    situacao: Optional[str] = None
    remuneracao_url: Optional[str] = None

    class Config:
        from_attributes = True


class DoacaoCampanhaSchema(BaseModel):
    id: int
    deputado_id: int
    cpf_cnpj_doador: str
    nome_doador: str
    valor: float
    tipo_recurso: Optional[str] = None

    class Config:
        from_attributes = True


class AlertaBase(BaseModel):
    tipo_heuristica: str
    severidade: str
    descricao: str
    valor_envolvido: Optional[float] = None


class Alerta(AlertaBase):
    id: int
    deputado_id: int
    despesa_id: Optional[int] = None
    despesa_relacionada: Optional[DespesaSimples] = None

    class Config:
        from_attributes = True


class Deputado(DeputadoBase):
    id: int
    alertas: List[Alerta] = []
    assessores: List[AssessorGabineteSchema] = []
    doacoes_campanha: List[DoacaoCampanhaSchema] = []

    class Config:
        from_attributes = True
