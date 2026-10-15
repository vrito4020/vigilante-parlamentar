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
        orm_mode = True
        from_attributes = True

class Deputado(DeputadoBase):
    id: int
    alertas: List[Alerta] = []

    class Config:
        orm_mode = True
        from_attributes = True
