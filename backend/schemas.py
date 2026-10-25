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
    total_assessores: Optional[int] = 0
    possui_sancao_cgu: Optional[bool] = False
    total_emendas_empenhado: Optional[float] = 0.0
    total_emendas_pix: Optional[float] = 0.0
    qtd_favorecidos_sancionados: Optional[int] = 0
    total_contratos_pncp: Optional[float] = 0.0
    qtd_contratos_pncp: Optional[int] = 0
    qtd_fornecedores_suspeitos: Optional[int] = 0
    qtd_vinculos_nepotismo: Optional[int] = 0
    qtd_processos_judiciais: Optional[int] = 0
    qtd_anomalias_folha: Optional[int] = 0


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


class EmendaParlamentarSchema(BaseModel):
    id: int
    deputado_id: int
    codigo_emenda: str
    ano: int
    tipo_emenda: str
    localidade: Optional[str] = None
    uf: Optional[str] = None
    funcao: Optional[str] = None
    subfuncao: Optional[str] = None
    acao: Optional[str] = None
    valor_empenhado: float = 0.0
    valor_liquidado: float = 0.0
    valor_pago: float = 0.0

    class Config:
        from_attributes = True


class FavorecidoEmendaSchema(BaseModel):
    id: int
    deputado_id: int
    codigo_emenda: Optional[str] = None
    tipo_emenda: Optional[str] = None
    ano_mes: Optional[str] = None
    cnpj_favorecido: str
    nome_favorecido: str
    natureza_juridica: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    valor_recebido: float = 0.0
    sancionado_cgu: Optional[bool] = False
    detalhe_sancao: Optional[str] = None

    class Config:
        from_attributes = True


class ContratoPublicoPNCPSchema(BaseModel):
    id: int
    deputado_id: int
    fornecedor_cnpj: str
    fornecedor_nome: str
    orgao_publico: str
    uf_orgao: Optional[str] = None
    municipio_orgao: Optional[str] = None
    esfera: Optional[str] = None
    objeto_contrato: Optional[str] = None
    valor_global: float = 0.0
    data_assinatura: Optional[str] = None
    numero_controle_pncp: Optional[str] = None

    class Config:
        from_attributes = True


class DossieFornecedorGabineteSchema(BaseModel):
    id: int
    deputado_id: int
    cnpj: str
    razao_social: str
    nome_fantasia: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cep: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    porte: Optional[str] = None
    capital_social: Optional[float] = 0.0
    data_abertura: Optional[str] = None
    cnae_principal: Optional[str] = None
    situacao_cadastral: Optional[str] = None
    qsa_socios: Optional[str] = None
    total_recebido_deputado: float = 0.0
    qtd_notas_deputado: int = 0
    categoria_principal_gasto: Optional[str] = None
    url_google_maps: Optional[str] = None
    indicio_cartel_ou_fantasma: Optional[bool] = False
    detalhe_indicio: Optional[str] = None

    class Config:
        from_attributes = True


class VinculoGabineteNepotismoSchema(BaseModel):
    id: int
    deputado_id: int
    assessor_nome: str
    assessor_cargo: Optional[str] = None
    tipo_vinculo: str
    gravidade: Optional[str] = "ALTA"
    sobrenome_conexao: Optional[str] = None
    parlamentar_ou_empresa_alvo: str
    esfera_alvo: Optional[str] = None
    uf_alvo: Optional[str] = None
    partido_alvo: Optional[str] = None
    detalhe_completo: str
    remuneracao_url: Optional[str] = None

    class Config:
        from_attributes = True


class ProcessoJudicialRadarSchema(BaseModel):
    id: int
    deputado_id: int
    numero_processo: str
    tribunal: str
    classe_processual: str
    orgao_julgador: Optional[str] = None
    assuntos: Optional[str] = None
    polo_alvo: str
    qtd_movimentacoes: Optional[int] = 0
    ultima_movimentacao: Optional[str] = None
    data_ajuizamento_ou_certidao: Optional[str] = None
    grau_risco: Optional[str] = "MEDIA"
    url_consulta: Optional[str] = None

    class Config:
        from_attributes = True


class AuditoriaFolhaGabineteSchema(BaseModel):
    id: int
    deputado_id: int
    ponto_matricula: str
    nome_servidor: str
    grupo_funcional: str
    codigo_cargo: str
    funcao_detalhe: Optional[str] = None
    remuneracao_estimada: Optional[float] = 0.0
    ato_nomeacao: Optional[str] = None
    data_inicio_historico: Optional[str] = None
    data_pub_nomeacao: Optional[str] = None
    indicio_fantasma_ou_acumulo: Optional[bool] = False
    tipo_anomalia: Optional[str] = None
    gravidade: Optional[str] = "BAIXA"
    detalhe_auditoria: Optional[str] = None
    url_comprovante: Optional[str] = None

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
    sancoes: List[SancaoFornecedorSchema] = []
    emendas: List[EmendaParlamentarSchema] = []
    favorecidos_emendas: List[FavorecidoEmendaSchema] = []
    contratos_pncp: List[ContratoPublicoPNCPSchema] = []
    dossies_fornecedores: List[DossieFornecedorGabineteSchema] = []
    vinculos_nepotismo: List[VinculoGabineteNepotismoSchema] = []
    processos_judiciais: List[ProcessoJudicialRadarSchema] = []
    auditoria_folha: List[AuditoriaFolhaGabineteSchema] = []

    class Config:
        from_attributes = True


class FornecedorBase(BaseModel):
    cnpj: str
    razao_social: str
    situacao_cadastral: str
    data_situacao_cadastral: Optional[str] = None
    cnae_fiscal_descricao: Optional[str] = None
    cnaes_secundarios: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    capital_social: Optional[float] = None
    data_inicio_atividade: Optional[str] = None
    opcao_pelo_mei: Optional[bool] = False
    qsa_nomes: Optional[str] = None


class Fornecedor(FornecedorBase):
    sancoes: List[SancaoFornecedorSchema] = []

    class Config:
        from_attributes = True


class DespesaCEAP(BaseModel):
    id: int
    deputado_id: int
    fornecedor_cnpj: Optional[str] = None
    data: date
    valor: float
    tipo_despesa: str
    numero_documento: Optional[str] = None
    url_documento: Optional[str] = None
    fornecedor_rel: Optional[Fornecedor] = None

    class Config:
        from_attributes = True
