import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { 
  AlertCircle, 
  ArrowLeft, 
  Building, 
  DollarSign, 
  MapPin, 
  RefreshCw,
  TrendingUp,
  Receipt,
  CreditCard,
  Building2,
  Calendar,
  PieChart as PieChartIcon,
  Users,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Scale,
  Award
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts'

const CORES_CATEGORIAS = [
  '#2563eb', // Azul
  '#4f46e5', // Índigo
  '#0891b2', // Ciano
  '#059669', // Esmeralda
  '#d97706', // Âmbar
  '#7c3aed', // Roxo
  '#db2777', // Rosa
  '#475569'  // Cinza
]

const formatarMoeda = (val) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)

const TooltipMoeda = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 max-w-xs z-50">
        <p className="font-bold text-sm text-slate-100">{data.razao_completa || data.categoria || data.mes_rotulo}</p>
        {data.cnpj && <p className="text-slate-400">CNPJ: {data.cnpj}</p>}
        <p className="text-emerald-400 font-bold text-base">
          {formatarMoeda(payload[0].value)}
        </p>
        {data.quantidade && <p className="text-slate-300">{data.quantidade} notas fiscais</p>}
        {data.percentual !== undefined && (
          <p className="text-blue-300 font-semibold">{data.percentual}% do total da cota</p>
        )}
      </div>
    )
  }
  return null
}

import { API_URL } from '../config'

export default function DeputadoProfile() {
  const { id } = useParams()
  const [deputado, setDeputado] = useState(null)
  const [stats, setStats] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisDone, setAnalysisDone] = useState(false)
  const [activeTab, setActiveTab] = useState('visao_geral')
  
  const fetchDeputado = () => {
    Promise.all([
      axios.get(`${API_URL}/api/deputados/${id}`),
      axios.get(`${API_URL}/api/dashboard/stats`),
      axios.get(`${API_URL}/api/deputados/${id}/analytics`)
    ]).then(([resDep, resStats, resAnalytics]) => {
      setDeputado(resDep.data)
      setStats(resStats.data)
      setAnalytics(resAnalytics.data)
    }).catch(err => console.error("Erro ao carregar dossiê:", err))
  }

  useEffect(() => {
    fetchDeputado()
  }, [id])

  const handleAnalisar = async () => {
    setIsAnalyzing(true)
    try {
      await axios.post(`${API_URL}/api/deputados/${id}/analisar`, {}, { timeout: 120000 })
      setAnalysisDone(true)
      fetchDeputado()
    } catch (error) {
      console.error("Erro ao analisar:", error)
      alert("Houve um erro ao realizar a análise.")
    } finally {
      setIsAnalyzing(false)
    }
  }

  if (!deputado) return <div className="text-center py-20 text-slate-500 font-medium">Carregando dossiê parlamentar...</div>

  const temDespesas = analytics && analytics.evolucao_mensal && analytics.evolucao_mensal.length > 0
  const temSancoes = (deputado.sancoes && deputado.sancoes.length > 0) || deputado.alertas?.some(a => a.tipo_heuristica === 'FORNECEDOR_SANCIONADO_CEIS_CNEP')
  const sancoesCGU = deputado.sancoes || []
  const assessores = deputado.assessores || []
  const emendas = deputado.emendas || []
  const favorecidosEmendas = deputado.favorecidos_emendas || []
  const favSancionados = favorecidosEmendas.filter(f => f.sancionado_cgu)
  const totalEmendasEmp = deputado.total_emendas_empenhado || emendas.reduce((acc, e) => acc + (e.valor_empenhado || 0), 0)
  const totalEmendasPago = emendas.reduce((acc, e) => acc + (e.valor_pago || 0), 0)
  const totalEmendasPix = deputado.total_emendas_pix || emendas.filter(e => (e.tipo_emenda || '').toUpperCase().includes('ESPECIAIS')).reduce((acc, e) => acc + (e.valor_empenhado || 0), 0)
  const contratosPncp = deputado.contratos_pncp || []
  const totalContratosPncp = deputado.total_contratos_pncp || contratosPncp.reduce((acc, c) => acc + (c.valor_global || 0), 0)
  const fornecedoresDistintosPncp = new Set(contratosPncp.map(c => c.fornecedor_cnpj)).size
  const contratosNaUfDeputado = contratosPncp.filter(c => (c.uf_orgao || '').toUpperCase() === (deputado.uf || '').toUpperCase())
  const dossiesFornecedores = deputado.dossies_fornecedores || []
  const fornecedoresSuspeitos = dossiesFornecedores.filter(df => df.indicio_cartel_ou_fantasma)
  const fornecedoresSubcap = dossiesFornecedores.filter(df => (df.capital_social || 0) <= 3000)
  const vinculosNepotismo = deputado.vinculos_nepotismo || []
  const vinculosPorAssessor = {}
  vinculosNepotismo.forEach(v => {
    if (!vinculosPorAssessor[v.assessor_nome]) vinculosPorAssessor[v.assessor_nome] = []
    vinculosPorAssessor[v.assessor_nome].push(v)
  })
  const processosJudiciais = deputado.processos_judiciais || []
  const certidoesObjetoPe = processosJudiciais.filter(p => (p.numero_processo || '').startsWith('OBJETO-PE-') || (p.numero_processo || '').startsWith('FORO-ESP-'))
  const processosDatajud = processosJudiciais.filter(p => (p.tribunal || p.esfera || '').includes('DataJud'))
  const processosSancionadores = processosJudiciais.filter(p => (p.polo_alvo || '').includes('Fornecedor') || (p.polo_alvo || '').includes('Favorecido') || (p.numero_processo || '').startsWith('CEIS-') || (p.numero_processo || '').startsWith('PAD-'))
  const auditoriaFolha = deputado.auditoria_folha || []
  const anomaliasFolha = auditoriaFolha.filter(af => af.indicio_fantasma_ou_acumulo)
  const cnesFolha = auditoriaFolha.filter(af => (af.codigo_cargo || '').startsWith('CNE') || (af.grupo_funcional || '').includes('Natureza Especial'))
  const folhaMensalEstimada = auditoriaFolha.reduce((acc, af) => acc + (af.remuneracao_estimada || 0), 0)

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <Link to="/" className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar ao Painel Geral
      </Link>

      {/* Header do Deputado */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col md:flex-row items-center md:items-start gap-8 relative overflow-hidden">
        <img src={deputado.url_foto} alt={deputado.nome} className="w-36 h-36 rounded-full object-cover shadow-md border-4 border-white z-10" />
        <div className="flex-1 text-center md:text-left z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-black text-slate-900">{deputado.nome}</h1>
              <p className="text-xs text-slate-400 mt-0.5">ID Parlamentar: {deputado.id} | Legislatura 57 | {deputado.nome_civil || deputado.nome}</p>
            </div>
            
            {/* Botão Analisar */}
            <div className="mt-4 md:mt-0">
              <button 
                onClick={handleAnalisar}
                disabled={isAnalyzing}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Auditando CGU/Câmara/TSE...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" /> Analisar Gastos Agora
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 my-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              <Building className="w-3.5 h-3.5 mr-1" /> {deputado.partido}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              <MapPin className="w-3.5 h-3.5 mr-1" /> {deputado.uf}
            </span>
            <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <DollarSign className="w-3.5 h-3.5 mr-1 text-emerald-600" /> 
              {deputado.patrimonio_declarado !== null && deputado.patrimonio_declarado !== undefined ? (
                <>Patrimônio Declarado (TSE): <strong className="ml-1 text-emerald-950">{formatarMoeda(deputado.patrimonio_declarado)}</strong></>
              ) : (
                <span className="text-slate-500">Patrimônio: Consulta sob demanda (TSE)</span>
              )}
            </span>
            {assessores.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                <Users className="w-3.5 h-3.5 mr-1 text-blue-600" /> {assessores.length} Secretários de Gabinete
              </span>
            )}
            {emendas.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                💸 Emendas: {formatarMoeda(totalEmendasEmp)}
              </span>
            )}
            {totalEmendasPix > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300">
                ⚡ Emendas PIX: {formatarMoeda(totalEmendasPix)}
              </span>
            )}
            {contratosPncp.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
                🏛️ Contratos PNCP: {formatarMoeda(totalContratosPncp)} ({contratosPncp.length})
              </span>
            )}
            {fornecedoresSuspeitos.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-900 border border-orange-300">
                🏢 {fornecedoresSuspeitos.length} Sede(s) / Rede Suspeita
              </span>
            )}
            {vinculosNepotismo.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
                🧬 {vinculosNepotismo.length} Vínculo(s) Nepotismo / TSE
              </span>
            )}
            {processosJudiciais.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-cyan-100 text-cyan-900 border border-cyan-300">
                ⚖️ {processosJudiciais.length} Processo(s) / Certidões CNJ
              </span>
            )}
            {anomaliasFolha.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-900 border border-teal-300">
                🕵️ {anomaliasFolha.length} Anomalia(s) Folha / DOU / CNE
              </span>
            )}
            {temSancoes && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5 mr-1 text-red-600" /> Fornecedor Sancionado (CGU)
              </span>
            )}
            {favSancionados.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 animate-pulse">
                🚨 {favSancionados.length} Emenda(s) p/ Sancionados CGU
              </span>
            )}
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 inline-block">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Termômetro de Risco Forense</p>
            <div className="flex items-end gap-3">
              <span className={`text-4xl font-black ${deputado.indice_risco > 50 ? 'text-red-600' : deputado.indice_risco > 20 ? 'text-amber-500' : 'text-emerald-500'}`}>
                {deputado.indice_risco.toFixed(1)}
              </span>
              <span className="text-slate-400 font-semibold pb-1 text-sm">/ 100 pontos</span>
            </div>
          </div>
        </div>
        
        {deputado.indice_risco > 50 && (
          <div className="absolute top-0 right-0 w-64 h-64 bg-red-500 opacity-5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none"></div>
        )}
      </div>

      {/* BANNER CRÍTICO SE HOUVER FORNECEDOR SANCIONADO NO CEIS/CNEP/CGU */}
      {temSancoes && (
        <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-6 rounded-2xl shadow-lg border border-red-500 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-xl">
              <ShieldAlert className="w-8 h-8 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-wide uppercase">🚨 ALERTA CRÍTICO: FORNECEDOR EM LISTA NEGRA DA CGU (CEIS / CNEP)</h3>
                <span className="px-2 py-0.5 rounded bg-white text-red-700 text-[11px] font-black uppercase">Peso 50 pts</span>
              </div>
              <p className="text-red-100 text-sm mt-1 max-w-3xl">
                O motor forense detectou que este parlamentar efetuou pagamentos com a Cota Parlamentar (CEAP) para empresa formalmente punida pela Controladoria-Geral da União (CGU) com impedimento de licitar e contratar com a Administração Pública.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('sancoes')}
            className="px-4 py-2 bg-white text-red-700 text-xs font-bold rounded-xl shadow-md hover:bg-red-50 transition-all whitespace-nowrap self-stretch md:self-auto text-center"
          >
            Ver Detalhes da Sanção &rarr;
          </button>
        </div>
      )}

      {/* Mensagem de Sucesso na Análise */}
      {analysisDone && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-4 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-4">
          <p className="font-medium text-sm">
            Auditoria concluída com sucesso! Despesas da Câmara (CEAP) cruzadas com CGU (CEIS/CNEP), Folha da Câmara, Receita Federal e TSE.
          </p>
          <span className="text-xs bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-bold">
            Atualizado
          </span>
        </div>
      )}

      {/* ABAS DE NAVEGAÇÃO FORENSE */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('visao_geral')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'visao_geral'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Visão Geral & Gráficos
        </button>
        <button
          onClick={() => setActiveTab('alertas')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'alertas'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <AlertCircle className="w-4 h-4" /> Alertas Forenses ({deputado.alertas.length})
        </button>
        <button
          onClick={() => setActiveTab('emendas')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'emendas'
              ? 'bg-purple-700 text-white shadow-sm'
              : favSancionados.length > 0
              ? 'text-purple-800 bg-purple-50 hover:bg-purple-100 font-extrabold border border-purple-200'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <DollarSign className="w-4 h-4" /> Emendas & PIX ({emendas.length}) {favSancionados.length > 0 && '🚨'}
        </button>
        <button
          onClick={() => setActiveTab('pncp')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'pncp'
              ? 'bg-indigo-700 text-white shadow-sm'
              : contratosPncp.length > 0
              ? 'text-indigo-800 bg-indigo-50 hover:bg-indigo-100 font-extrabold border border-indigo-200'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" /> Contratos Públicos PNCP ({contratosPncp.length})
        </button>
        <button
          onClick={() => setActiveTab('sedes')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'sedes'
              ? 'bg-orange-600 text-white shadow-sm'
              : fornecedoresSuspeitos.length > 0
              ? 'text-orange-800 bg-orange-50 hover:bg-orange-100 font-extrabold border border-orange-200'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <MapPin className="w-4 h-4" /> Sede Física, QSA & Cartéis ({dossiesFornecedores.length}) {fornecedoresSuspeitos.length > 0 && '🚨'}
        </button>
        <button
          onClick={() => setActiveTab('gabinete')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'gabinete'
              ? 'bg-rose-700 text-white shadow-sm'
              : vinculosNepotismo.length > 0
              ? 'text-rose-800 bg-rose-50 hover:bg-rose-100 font-extrabold border border-rose-200'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" /> Gabinete & Nepotismo ({assessores.length}) {vinculosNepotismo.length > 0 && '🧬'}
        </button>
        <button
          onClick={() => setActiveTab('judiciario')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'judiciario'
              ? 'bg-cyan-800 text-white shadow-sm'
              : certidoesObjetoPe.length > 0 || processosSancionadores.length > 0
              ? 'text-cyan-900 bg-cyan-50 hover:bg-cyan-100 font-extrabold border border-cyan-200'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Scale className="w-4 h-4" /> Radar Judiciário CNJ ({processosJudiciais.length}) {(certidoesObjetoPe.length > 0 || processosSancionadores.length > 0) && '⚖️'}
        </button>
        <button
          onClick={() => setActiveTab('folha_dou')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'folha_dou'
              ? 'bg-teal-800 text-white shadow-sm'
              : anomaliasFolha.length > 0
              ? 'text-teal-900 bg-teal-50 hover:bg-teal-100 font-extrabold border border-teal-200'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Award className="w-4 h-4" /> Folha, DOU & Fantasmas ({auditoriaFolha.length}) {anomaliasFolha.length > 0 && '🕵️'}
        </button>
        <button
          onClick={() => setActiveTab('sancoes')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'sancoes'
              ? 'bg-red-600 text-white shadow-sm'
              : temSancoes
              ? 'text-red-600 bg-red-50 hover:bg-red-100 font-extrabold'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4" /> Listas Negras CGU/TCU {temSancoes && '🚨'}
        </button>
      </div>

      {/* CONTEÚDO DA ABA 1: VISÃO GERAL & GRÁFICOS */}
      {activeTab === 'visao_geral' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {temDespesas ? (
            <section className="space-y-6">
              {/* Cards de Resumo Rápido */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total CEAP Auditado</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{formatarMoeda(analytics.total_gasto)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{analytics.total_notas} notas fiscais</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Média Mensal</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{formatarMoeda(analytics.media_mensal)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Por mês auditado</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Maior Nota Fiscal</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{formatarMoeda(analytics.maior_nota)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Gasto unitário pico</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Secretários Ativos</p>
                  <p className="text-xl font-black text-blue-600 mt-1">{assessores.length}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Folha da Câmara</p>
                </div>
              </div>

              {/* Gráficos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico 1: Evolução Mensal */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-bold text-slate-900">Evolução Mensal dos Gastos</h3>
                      </div>
                      <span className="text-xs text-slate-400 font-medium">CEAP</span>
                    </div>
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics.evolucao_mensal} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="corGastoDep" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="mes_rotulo" stroke="#94a3b8" fontSize={11} />
                          <YAxis tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} stroke="#94a3b8" fontSize={11} />
                          <Tooltip content={<TooltipMoeda />} />
                          <Area type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#corGastoDep)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Gráfico 2: Categorias */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <PieChartIcon className="w-5 h-5 text-indigo-600" />
                        <h3 className="text-lg font-bold text-slate-900">Gastos por Categoria</h3>
                      </div>
                      <span className="text-xs text-slate-400 font-medium">Divisão interna</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4">
                      <div className="h-60 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analytics.categorias.slice(0, 5)}
                              dataKey="total"
                              nameKey="categoria"
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={78}
                              paddingAngle={3}
                            >
                              {analytics.categorias.slice(0, 5).map((entry, index) => (
                                <Cell key={`dep-cat-${index}`} fill={CORES_CATEGORIAS[index % CORES_CATEGORIAS.length]} />
                              ))}
                            </Pie>
                            <Tooltip content={<TooltipMoeda />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        {analytics.categorias.slice(0, 5).map((cat, idx) => (
                          <div key={cat.categoria} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 truncate">
                              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: CORES_CATEGORIAS[idx % CORES_CATEGORIAS.length] }} />
                              <span className="text-slate-700 font-medium truncate">{cat.categoria}</span>
                            </div>
                            <span className="font-bold text-slate-900 ml-2">{cat.percentual}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Gráfico 3: Top Fornecedores */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-lg font-bold text-slate-900">Maiores Fornecedores Contratados</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">Top 5 Empresas</span>
                  </div>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.top_fornecedores} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                        <XAxis type="number" tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} stroke="#94a3b8" fontSize={11} />
                        <YAxis type="category" dataKey="razao_social" stroke="#64748b" fontSize={11} width={160} tickLine={false} />
                        <Tooltip content={<TooltipMoeda />} />
                        <Bar dataKey="total" fill="#059669" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <div className="bg-blue-50 border border-blue-200 p-8 rounded-2xl text-center space-y-3">
              <Calendar className="w-12 h-12 text-blue-600 mx-auto opacity-70" />
              <h3 className="text-lg font-bold text-blue-900">Gráficos Analíticos Aguardando Auditoria</h3>
              <p className="text-sm text-blue-700 max-w-xl mx-auto">
                Este parlamentar ainda não teve todas as notas sincronizadas nesta sessão. Clique no botão <strong>"Analisar Gastos Agora"</strong> no topo da página para baixar comprovantes da Câmara, cruzar com a base da CGU (CEIS/CNEP), Folha de Pessoal e Receita Federal.
              </p>
            </div>
          )}

          {/* Cards de Comparação com a Média da Câmara */}
          {stats && (
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Comparativo de Risco</p>
                  <div className="flex items-end gap-6">
                    <div>
                      <p className="text-xs text-slate-400 font-medium mb-1">Risco deste Deputado</p>
                      <p className={`text-4xl font-black ${deputado.indice_risco > stats.media_risco_geral ? 'text-red-600' : 'text-emerald-500'}`}>
                        {deputado.indice_risco.toFixed(1)}
                      </p>
                    </div>
                    <div className="pb-1 text-slate-300 text-2xl font-light">vs</div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium mb-1">Média da Câmara</p>
                      <p className="text-4xl font-black text-slate-700">{stats.media_risco_geral}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    {deputado.indice_risco > stats.media_risco_geral 
                      ? "Este parlamentar possui pontuação de risco acima da média geral da Câmara."
                      : "Este parlamentar possui risco alinhado ou abaixo da média observada."}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Volume de Alertas Emitidos</p>
                  <div className="flex items-end gap-6">
                    <div>
                      <p className="text-xs text-slate-400 font-medium mb-1">Alertas deste Parlamentar</p>
                      <p className={`text-4xl font-black ${deputado.alertas.length > (stats.total_alertas / stats.total_deputados) ? 'text-red-600' : 'text-emerald-500'}`}>
                        {deputado.alertas.length}
                      </p>
                    </div>
                    <div className="pb-1 text-slate-300 text-2xl font-light">vs</div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium mb-1">Média por Deputado</p>
                      <p className="text-4xl font-black text-slate-700">
                        {(stats.total_alertas / (stats.total_deputados || 1)).toFixed(1)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Número de inconformidades flagradas pelo motor de 25 heurísticas forenses multi-base.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: ALERTAS FORENSES */}
      {activeTab === 'alertas' && (
        <section className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <AlertCircle className={deputado.alertas.length > 0 ? "text-red-500" : "text-emerald-500"} />
              Painel de Inconformidades e Alertas ({deputado.alertas.length})
            </h2>
            <span className="text-xs text-slate-500 font-semibold">Motor Forense v4</span>
          </div>
          
          {deputado.alertas.length === 0 ? (
            <div className="bg-emerald-50 text-emerald-800 p-8 rounded-2xl border border-emerald-100 font-medium flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-12 h-12 mb-3 text-emerald-600 opacity-60" />
              <p className="text-lg font-bold">Nenhuma anomalia detectada pelo motor até o momento.</p>
              <p className="text-sm mt-1 text-emerald-700">
                Caso ainda não tenha feito, clique em "Analisar Gastos Agora" para auditar as notas fiscais na Câmara.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {deputado.alertas.map(alerta => {
                const estilo = {
                  ALTA: { borda: 'border-red-500', badge: 'bg-red-100 text-red-700', rotulo: 'Alta Gravidade' },
                  MEDIA: { borda: 'border-amber-500', badge: 'bg-amber-100 text-amber-800', rotulo: 'Média Gravidade' },
                  BAIXA: { borda: 'border-sky-400', badge: 'bg-sky-100 text-sky-800', rotulo: 'Baixa / Informativo' },
                }[alerta.severidade] || { borda: 'border-slate-300', badge: 'bg-slate-100 text-slate-700', rotulo: alerta.severidade }
                return (
                <div key={alerta.id} className={`bg-white border-l-4 ${estilo.borda} rounded-r-2xl shadow-sm p-6 hover:shadow-md transition-shadow`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{alerta.tipo_heuristica.replace(/_/g, ' ')}</h3>
                      <Link to="/metodologia" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-semibold mt-0.5">
                        Ver fórmula na aba Metodologia &rarr;
                      </Link>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${estilo.badge}`}>
                      {estilo.rotulo}
                    </span>
                  </div>
                  <p className="text-slate-600 mb-4 text-base">{alerta.descricao}</p>
                  {alerta.valor_envolvido && (
                    <p className="text-sm font-bold text-slate-800 bg-slate-50 inline-block px-3 py-1.5 rounded-lg border border-slate-100">
                      Valor Envolvido: {formatarMoeda(alerta.valor_envolvido)}
                    </p>
                  )}
                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                      {alerta.tipo_heuristica === 'FORNECEDOR_SANCIONADO_CEIS_CNEP' 
                        ? '🏛️ Fonte: Controladoria-Geral da União (CGU - CEIS/CNEP)' 
                        : alerta.tipo_heuristica === 'CONTAS_IRREGULARES_TCU'
                        ? '⚖️ Fonte: Tribunal de Contas da União (TCU)'
                        : alerta.tipo_heuristica === 'ASSESSOR_SOCIO_FORNECEDOR'
                        ? '👥 Fonte: Folha de Pessoal da Câmara + Receita Federal (QSA)'
                        : alerta.tipo_heuristica === 'QUID_PRO_QUO_DOADOR_CAMPANHA'
                        ? '🗳️ Fonte: Prestação de Contas TSE + Câmara CEAP'
                        : alerta.tipo_heuristica === 'PATRIMONIO_ELEVADO' 
                        ? '💰 Fonte: TSE (DivulgaCandContas)' 
                        : '🧾 Fonte: Câmara (CEAP) + Receita Federal (QSA)'}
                    </span>
                    {alerta.despesa_relacionada?.url_documento ? (
                      <a 
                        href={alerta.despesa_relacionada.url_documento} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                      >
                        Visualizar Nota Fiscal Original (Câmara) &rarr;
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Evidência registrada no sistema</span>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* CONTEÚDO DA ABA 3: PESSOAL DE GABINETE, NEPOTISMO CRUZADO (CÂMARA × SENADO) & RACHADINHA TSE */}
      {activeTab === 'gabinete' && (
        <section className="space-y-8 animate-in fade-in duration-300">
          {/* KPIs do Bloco 4 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Secretários na Folha</p>
              <p className="text-2xl font-black text-blue-700 mt-1">{assessores.length} nomeados</p>
              <p className="text-xs text-slate-400 mt-0.5">Cargos comissionados ativos</p>
            </div>
            <div className={`p-5 rounded-2xl border shadow-sm ${vinculosNepotismo.filter(v => v.tipo_vinculo.includes('NEPOTISMO')).length > 0 ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-xs font-bold uppercase text-rose-800 tracking-wider">🧬 Nepotismo Direto / Cruzado</p>
              <p className="text-2xl font-black text-rose-950 mt-1">
                {vinculosNepotismo.filter(v => v.tipo_vinculo.includes('NEPOTISMO')).length} {vinculosNepotismo.filter(v => v.tipo_vinculo.includes('NEPOTISMO')).length === 1 ? 'vínculo' : 'vínculos'}
              </p>
              <p className="text-xs text-rose-700 mt-0.5">Câmara × Senado × Bancada Estadual</p>
            </div>
            <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-amber-800 tracking-wider">👨‍👩‍👧‍👦 Clãs Familiares Internos</p>
              <p className="text-2xl font-black text-amber-950 mt-1">
                {vinculosNepotismo.filter(v => v.tipo_vinculo === 'CLA_FAMILIAR_INTERNO').length} assessores
              </p>
              <p className="text-xs text-amber-700 mt-0.5">Mesma família no mesmo gabinete</p>
            </div>
            <div className={`p-5 rounded-2xl border shadow-sm ${vinculosNepotismo.filter(v => v.tipo_vinculo === 'ASSESSOR_DOADOR_TSE' || v.tipo_vinculo === 'ASSESSOR_VINCULO_EMPRESA').length > 0 ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className="text-xs font-bold uppercase text-red-800 tracking-wider">🗳️ Assessores Doadores TSE / QSA</p>
              <p className="text-2xl font-black text-red-900 mt-1">
                {vinculosNepotismo.filter(v => v.tipo_vinculo === 'ASSESSOR_DOADOR_TSE' || v.tipo_vinculo === 'ASSESSOR_VINCULO_EMPRESA').length} casos
              </p>
              <p className="text-xs text-red-700 mt-0.5">Financiadores eleitorais ou sócios</p>
            </div>
          </div>

          {/* Painel de Vínculos de Nepotismo Cruzado, Clãs e Financiadores TSE */}
          {vinculosNepotismo.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <ShieldAlert className="text-rose-600" /> Dossiê de Nepotismo Cruzado (Câmara × Senado), Clãs Familiares & Financiadores TSE
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Cruzamento nominal e genealógico da folha do gabinete contra todos os 513 Deputados Federais, 81 Senadores da República, doadores eleitorais do TSE e sócios de empresas fornecedoras.
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-100 text-rose-800 self-start md:self-auto">
                  {vinculosNepotismo.length} conexões mapeadas
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vinculosNepotismo.map((v) => (
                  <div key={v.id} className="bg-rose-50/40 border border-rose-200 rounded-xl p-4 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          v.tipo_vinculo === 'ASSESSOR_DOADOR_TSE'
                            ? 'bg-red-600 text-white'
                            : v.tipo_vinculo.includes('NEPOTISMO')
                            ? 'bg-rose-700 text-white'
                            : v.tipo_vinculo === 'ASSESSOR_VINCULO_EMPRESA'
                            ? 'bg-purple-700 text-white'
                            : 'bg-amber-600 text-white'
                        }`}>
                          {v.tipo_vinculo === 'NEPOTISMO_CRUZADO_CONGRESSO' && '🏛️ Nepotismo Cruzado (Congresso)'}
                          {v.tipo_vinculo === 'NEPOTISMO_DIRETO_PARLAMENTAR' && '🚨 Parentesco Direto c/ Titular'}
                          {v.tipo_vinculo === 'CLA_FAMILIAR_INTERNO' && '👨‍👩‍👧‍👦 Clã Familiar no Gabinete'}
                          {v.tipo_vinculo === 'ASSESSOR_DOADOR_TSE' && '🗳️ Assessor Financiador TSE'}
                          {v.tipo_vinculo === 'ASSESSOR_VINCULO_EMPRESA' && '🏢 Vínculo Societário QSA'}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">{v.esfera_alvo}</span>
                      </div>
                      <h4 className="font-black text-slate-900 text-sm">{v.assessor_nome}</h4>
                      <p className="text-xs font-bold text-rose-900 mt-0.5">
                        Conexão: <span className="underline">{v.sobrenome_conexao}</span> &rarr; {v.parlamentar_ou_empresa_alvo}
                      </p>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{v.detalhe_completo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Users className="text-blue-600" /> Relação Completa de Secretários Parlamentares
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Servidores comissionados nomeados diretamente pelo deputado na Câmara Federal, auditados contra o Senado Federal, Câmara, TSE e Receita Federal.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-xl self-start md:self-auto text-right">
                <p className="text-xs font-bold uppercase text-blue-700">Total de Assessores</p>
                <p className="text-2xl font-black text-blue-950">{assessores.length} nomeados</p>
              </div>
            </div>

            {assessores.length === 0 ? (
              <div className="bg-slate-50 p-8 rounded-xl text-center text-slate-500">
                <Users className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <p className="font-semibold text-slate-700">Nenhum assessor sincronizado para este gabinete ainda.</p>
                <p className="text-xs text-slate-400 mt-1">Clique em "Analisar Gastos Agora" para sincronizar a folha de pagamento da Câmara dos Deputados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3 font-semibold">Nome do Servidor</th>
                      <th className="px-4 py-3 font-semibold">Cargo Oficial</th>
                      <th className="px-4 py-3 font-semibold">Situação</th>
                      <th className="px-4 py-3 font-semibold">Auditoria Familiar / TSE / QSA</th>
                      <th className="px-4 py-3 font-semibold text-right">Transparência Câmara</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assessores.map((assessor) => {
                      const vincs = vinculosPorAssessor[assessor.nome] || []
                      return (
                        <tr key={assessor.id} className={vincs.length > 0 ? "bg-rose-50/40 hover:bg-rose-50 transition-colors" : "hover:bg-slate-50 transition-colors"}>
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-800 text-sm">{assessor.nome}</p>
                            <p className="text-[11px] text-slate-400">Gabinete {deputado.nome}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-700 font-medium">
                            {assessor.cargo || "Secretário Parlamentar"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                              {assessor.situacao || "Em exercício"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {vincs.length > 0 ? (
                              <div className="space-y-1">
                                {vincs.map((v, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-300 mr-1">
                                    🧬 {v.parlamentar_ou_empresa_alvo}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                                Sem vínculo cruzado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {assessor.remuneracao_url ? (
                              <a
                                href={assessor.remuneracao_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                Ver Contracheque <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">Portal Câmara</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CONTEÚDO DA ABA 4: LISTAS NEGRAS CGU / TCU */}
      {activeTab === 'sancoes' && (
        <section className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="text-red-600" /> Auditoria de Empresas Inidôneas & Sancionadas (CGU / TCU)
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Cruzamento obrigatório de todos os fornecedores pagos com verba da cota parlamentar contra o CEIS (Cadastro de Empresas Inidôneas e Suspensas), CNEP (Cadastro Nacional de Empresas Punidas da CGU) e registros do Tribunal de Contas da União.
                </p>
              </div>
              <div className="bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl self-start md:self-auto text-right">
                <p className="text-xs font-bold uppercase text-red-700">Inconformidades CGU</p>
                <p className="text-2xl font-black text-red-950">{sancoesCGU.length} empresas punidas</p>
              </div>
            </div>

            {sancoesCGU.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-xl text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto opacity-70" />
                <h3 className="text-lg font-bold text-emerald-950">Nenhum Fornecedor Inidôneo Detectado</h3>
                <p className="text-sm text-emerald-700 max-w-xl mx-auto">
                  Os CNPJs dos fornecedores auditados deste parlamentar foram verificados na base consolidada da Controladoria-Geral da União (12.334 empresas sancionadas) e não constam com proibição de licitar ou contratar.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sancoesCGU.map((sancao) => (
                  <div key={sancao.id} className="bg-red-50/50 border border-red-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded text-xs font-black uppercase bg-red-600 text-white">
                            {sancao.cadastro || "CEIS (CGU)"}
                          </span>
                          <span className="text-sm font-bold text-slate-800">CNPJ: {sancao.cnpj}</span>
                        </div>
                        <h4 className="text-base font-black text-red-950 mt-1">{sancao.categoria_sancao || "Impedimento de Licitar e Contratar"}</h4>
                      </div>
                      <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1 rounded-lg border border-slate-200 self-start sm:self-auto">
                        Órgão: {sancao.orgao_sancionador || "Administração Pública"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white p-3.5 rounded-lg border border-red-100">
                      <div>
                        <p className="text-slate-400 font-semibold uppercase">Processo Administrativo</p>
                        <p className="font-bold text-slate-800">{sancao.numero_processo || "Processo sancionador CGU"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 font-semibold uppercase">Fundamentação Legal</p>
                        <p className="font-bold text-slate-800">{sancao.fundamentacao_legal || "Lei de Licitações (Lei 8.666/93 / Lei 14.133/21 / Lei Anticorrupção 12.846/13)"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* CONTEÚDO DA ABA 5: EMENDAS PARLAMENTARES & PIX + FAVORECIDOS */}
      {activeTab === 'emendas' && (
        <section className="space-y-8 animate-in fade-in duration-300">
          {/* KPIs de Emendas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Total Empenhado (23–26)</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{formatarMoeda(totalEmendasEmp)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{emendas.length} emendas autorais</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Total Efetivamente Pago</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{formatarMoeda(totalEmendasPago)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Inclui Restos a Pagar quitados</p>
            </div>
            <div className="bg-purple-50 p-5 rounded-2xl border border-purple-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-purple-800 tracking-wider">⚡ Emendas PIX (Transf. Especial)</p>
              <p className="text-2xl font-black text-purple-950 mt-1">{formatarMoeda(totalEmendasPix)}</p>
              <p className="text-xs text-purple-700 mt-0.5">Repasse direto sem projeto prévio</p>
            </div>
            <div className={`p-5 rounded-2xl border shadow-sm ${favSancionados.length > 0 ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${favSancionados.length > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                🚨 Favorecidos Sancionados CGU
              </p>
              <p className={`text-2xl font-black mt-1 ${favSancionados.length > 0 ? 'text-red-700' : 'text-emerald-800'}`}>
                {favSancionados.length} {favSancionados.length === 1 ? 'empresa' : 'empresas'}
              </p>
              <p className={`text-xs mt-0.5 ${favSancionados.length > 0 ? 'text-red-600 font-semibold' : 'text-emerald-700'}`}>
                {favSancionados.length > 0 ? 'Receberam verba de emendas' : 'Nenhuma punição no CEIS'}
              </p>
            </div>
          </div>

          {/* Tabela 1: Favorecidos Finais das Emendas (CNPJs Reais) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="text-purple-600" /> Rastreamento de Favorecidos Finais das Emendas (CNPJ)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Empresas privadas, institutos, fundos municipais e prefeituras que receberam recursos oriundos de emendas deste parlamentar, cruzados com o CEIS/CNEP da Controladoria-Geral da União.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-800 self-start md:self-auto">
                {favorecidosEmendas.length} CNPJs rastreados
              </span>
            </div>

            {favorecidosEmendas.length === 0 ? (
              <div className="bg-slate-50 p-8 rounded-xl text-center text-slate-500">
                <p className="font-semibold text-slate-700">Nenhum favorecido de emenda sincronizado para este parlamentar ainda.</p>
                <p className="text-xs text-slate-400 mt-1">Clique em "Analisar Gastos Agora" no topo para baixar os dados do Transferegov/CGU.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3 font-semibold">Favorecido / Razão Social</th>
                      <th className="px-4 py-3 font-semibold">Natureza Jurídica</th>
                      <th className="px-4 py-3 font-semibold">Município / UF</th>
                      <th className="px-4 py-3 font-semibold">Status CGU (CEIS/CNEP)</th>
                      <th className="px-4 py-3 font-semibold text-right">Total Recebido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {favorecidosEmendas.map((fav) => (
                      <tr key={fav.id} className={fav.sancionado_cgu ? "bg-red-50/60 hover:bg-red-50 transition-colors" : "hover:bg-slate-50 transition-colors"}>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900 text-sm">{fav.nome_favorecido}</p>
                          <p className="text-[11px] font-mono text-slate-500">CNPJ: {fav.cnpj_favorecido} | Emenda: {fav.codigo_emenda}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {fav.natureza_juridica || "Pessoa Jurídica"}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                          {fav.municipio} - {fav.uf}
                        </td>
                        <td className="px-4 py-3">
                          {fav.sancionado_cgu ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-600 text-white">
                                🚨 SANCIONADO NA CGU
                              </span>
                              <p className="text-[11px] text-red-800 font-medium mt-1 max-w-xs">{fav.detalhe_sancao}</p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Regular na CGU
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-900 text-sm whitespace-nowrap">
                          {formatarMoeda(fav.valor_recebido)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tabela 2: Lista de Emendas Parlamentares Autorais */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="text-blue-600" /> Relação de Emendas Parlamentares e Emendas PIX (2023–2026)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Detalhamento por código de emenda, modalidade orçamentária, área de atuação governamental e valores empenhados/pagos.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-800 self-start md:self-auto">
                {emendas.length} emendas listadas
              </span>
            </div>

            {emendas.length === 0 ? (
              <div className="bg-slate-50 p-8 rounded-xl text-center text-slate-500">
                <p className="font-semibold text-slate-700">Nenhuma emenda parlamentar sincronizada ainda.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3 font-semibold">Código / Ano</th>
                      <th className="px-4 py-3 font-semibold">Modalidade da Emenda</th>
                      <th className="px-4 py-3 font-semibold">Destino / Localidade</th>
                      <th className="px-4 py-3 font-semibold">Função / Ação</th>
                      <th className="px-4 py-3 font-semibold text-right">Empenhado</th>
                      <th className="px-4 py-3 font-semibold text-right">Pago</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {emendas.map((em) => {
                      const ehPix = (em.tipo_emenda || '').toUpperCase().includes('ESPECIAIS')
                      return (
                        <tr key={em.id} className={ehPix ? "bg-purple-50/40 hover:bg-purple-50 transition-colors" : "hover:bg-slate-50 transition-colors"}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="font-mono font-bold text-slate-800 text-xs">{em.codigo_emenda}</p>
                            <span className="text-[11px] font-bold text-slate-400">Ano {em.ano}</span>
                          </td>
                          <td className="px-4 py-3">
                            {ehPix ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-100 text-purple-900 border border-purple-300">
                                ⚡ Emenda PIX (Transf. Especial)
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-slate-700">{em.tipo_emenda}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-800">
                            {em.localidade}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs font-bold text-slate-700">{em.funcao} — {em.subfuncao}</p>
                            <p className="text-[11px] text-slate-400 truncate max-w-xs" title={em.acao}>{em.acao}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800 text-xs whitespace-nowrap">
                            {formatarMoeda(em.valor_empenhado)}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-emerald-700 text-xs whitespace-nowrap">
                            {formatarMoeda(em.valor_pago)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CONTEÚDO DA ABA 6: CONTRATOS PÚBLICOS NO PNCP (PREFEITURAS, ESTADOS E UNIÃO) */}
      {activeTab === 'pncp' && (
        <section className="space-y-8 animate-in fade-in duration-300">
          {/* KPIs PNCP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-indigo-800 tracking-wider">Volume Global no PNCP</p>
              <p className="text-2xl font-black text-indigo-950 mt-1">{formatarMoeda(totalContratosPncp)}</p>
              <p className="text-xs text-indigo-700 mt-0.5">Contratos públicos dos fornecedores CEAP</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Contratos Localizados</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{contratosPncp.length}</p>
              <p className="text-xs text-slate-400 mt-0.5">Prefeituras, Estados e Órgãos Federais</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Fornecedores CEAP com Contratos</p>
              <p className="text-2xl font-black text-blue-700 mt-1">{fornecedoresDistintosPncp} {fornecedoresDistintosPncp === 1 ? 'empresa' : 'empresas'}</p>
              <p className="text-xs text-slate-400 mt-0.5">Atuam no gabinete e no Executivo</p>
            </div>
            <div className={`p-5 rounded-2xl border shadow-sm ${contratosNaUfDeputado.length > 0 ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${contratosNaUfDeputado.length > 0 ? 'text-amber-800' : 'text-slate-500'}`}>
                📍 Contratos na Base Eleitoral ({deputado.uf})
              </p>
              <p className={`text-2xl font-black mt-1 ${contratosNaUfDeputado.length > 0 ? 'text-amber-900' : 'text-slate-700'}`}>
                {contratosNaUfDeputado.length} {contratosNaUfDeputado.length === 1 ? 'contrato' : 'contratos'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {contratosNaUfDeputado.length > 0 ? 'Coincidência territorial com UF do deputado' : 'Fora da UF de origem'}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="text-indigo-600" /> Cruzamento CEAP × Portal Nacional de Contratações Públicas (PNCP)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Rastreia se as empresas privadas contratadas pelo gabinete parlamentar (Cota CEAP) também firmaram contratos milionários com Prefeituras Municipais, Governos Estaduais ou Ministérios.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 self-start md:self-auto">
                {contratosPncp.length} contratos públicos
              </span>
            </div>

            {contratosPncp.length === 0 ? (
              <div className="bg-slate-50 p-8 rounded-xl text-center text-slate-500">
                <p className="font-semibold text-slate-700">Nenhum contrato público adicional encontrado no PNCP para os principais fornecedores privados deste gabinete.</p>
                <p className="text-xs text-slate-400 mt-1">Clique em "Analisar Gastos Agora" para consultar o Portal Nacional de Contratações Públicas em tempo real.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3 font-semibold">Fornecedor do Gabinete (CEAP)</th>
                      <th className="px-4 py-3 font-semibold">Órgão Público Contratante</th>
                      <th className="px-4 py-3 font-semibold">Localidade / UF</th>
                      <th className="px-4 py-3 font-semibold">Objeto do Contrato</th>
                      <th className="px-4 py-3 font-semibold text-right">Valor Global (PNCP)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contratosPncp.map((c) => {
                      const mesmaUf = (c.uf_orgao || '').toUpperCase() === (deputado.uf || '').toUpperCase()
                      return (
                        <tr key={c.id} className={mesmaUf ? "bg-amber-50/40 hover:bg-amber-50 transition-colors" : "hover:bg-slate-50 transition-colors"}>
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-900 text-xs">{c.fornecedor_nome}</p>
                            <p className="text-[11px] font-mono text-slate-500">CNPJ: {c.fornecedor_cnpj}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-800 text-xs">{c.orgao_publico}</p>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 mt-0.5">
                              Esfera: {c.esfera || 'Executivo'} | Assinatura: {c.data_assinatura || 'N/D'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-xs font-bold text-slate-800">{c.municipio_orgao || 'Nacional'} - {c.uf_orgao || 'BR'}</p>
                            {mesmaUf && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 mt-0.5">
                                📍 Reduto Eleitoral ({deputado.uf})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs text-slate-600 line-clamp-2 max-w-md" title={c.objeto_contrato}>
                              {c.objeto_contrato}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-indigo-900 text-sm whitespace-nowrap">
                            {formatarMoeda(c.valor_global)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CONTEÚDO DA ABA 7: SEDE FÍSICA, QUADRO SOCIETÁRIO (QSA) & CARTÉIS POR ENDEREÇO/CEP */}
      {activeTab === 'sedes' && (
        <section className="space-y-8 animate-in fade-in duration-300">
          {/* KPIs de Auditoria Física e Societária */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Fornecedores Auditados</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{dossiesFornecedores.length} empresas</p>
              <p className="text-xs text-slate-400 mt-0.5">Maiores recebedores privados da CEAP</p>
            </div>
            <div className={`p-5 rounded-2xl border shadow-sm ${fornecedoresSuspeitos.length > 0 ? 'bg-orange-50 border-orange-300' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${fornecedoresSuspeitos.length > 0 ? 'text-orange-800' : 'text-emerald-800'}`}>
                🚨 Indícios de Sede / Cartel / Rede
              </p>
              <p className={`text-2xl font-black mt-1 ${fornecedoresSuspeitos.length > 0 ? 'text-orange-700' : 'text-emerald-800'}`}>
                {fornecedoresSuspeitos.length} {fornecedoresSuspeitos.length === 1 ? 'fornecedor' : 'fornecedores'}
              </p>
              <p className="text-xs text-orange-700 mt-0.5">
                {fornecedoresSuspeitos.length > 0 ? 'Compartilhamento ou anomalia física' : 'Nenhuma anomalia física'}
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Capital Social &le; R$ 3 mil</p>
              <p className="text-2xl font-black text-amber-600 mt-1">{fornecedoresSubcap.length} empresas</p>
              <p className="text-xs text-slate-400 mt-0.5">Subcapitalizadas frente ao faturamento</p>
            </div>
            <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Inspeção de Fachada OSINT</p>
              <p className="text-lg font-black text-emerald-400 mt-1">Google Street View</p>
              <p className="text-xs text-slate-300 mt-0.5">1 clique para abrir endereço no Mapa</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="text-orange-600" /> Auditoria de Sede Física, Quadro de Sócios (QSA) & Cruzamento de Cartel
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Verifica o endereço predial na Receita Federal, telefone, e-mail, capital social, sócios (QSA) e cruza se múltiplas empresas dividem o mesmo galpão/sala comercial, telefone ou dono.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-orange-100 text-orange-800 self-start md:self-auto">
                {dossiesFornecedores.length} dossiês físicos
              </span>
            </div>

            {dossiesFornecedores.length === 0 ? (
              <div className="bg-slate-50 p-8 rounded-xl text-center text-slate-500">
                <p className="font-semibold text-slate-700">Nenhum dossiê físico de fornecedor sincronizado ainda.</p>
                <p className="text-xs text-slate-400 mt-1">Clique em "Analisar Gastos Agora" no topo para enriquecer os endereços e QSA na Receita Federal.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dossiesFornecedores.map((df) => (
                  <div
                    key={df.id}
                    className={`rounded-2xl border p-5 transition-all ${
                      df.indicio_cartel_ou_fantasma
                        ? 'bg-orange-50/50 border-orange-300 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200/70">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-black text-slate-900">{df.razao_social}</h3>
                          {df.nome_fantasia && (
                            <span className="text-xs font-semibold text-slate-500">({df.nome_fantasia})</span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            df.situacao_cadastral === 'ATIVA'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-600 text-white'
                          }`}>
                            {df.situacao_cadastral || 'ATIVA'}
                          </span>
                          {df.indicio_cartel_ou_fantasma && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-orange-600 text-white">
                              🚨 INDÍCIO FÍSICO / REDE DETECTADO
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-slate-500 mt-1">
                          CNPJ: {df.cnpj} | Abertura: {df.data_abertura || 'N/D'} | Capital Social: <strong>{formatarMoeda(df.capital_social)}</strong> | CNAE: {df.cnae_principal || 'Não informado'}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 self-start lg:self-auto">
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Pago pelo Deputado (CEAP)</p>
                          <p className="text-lg font-black text-slate-900">{formatarMoeda(df.total_recebido_deputado)}</p>
                          <p className="text-[11px] text-slate-500">{df.qtd_notas_deputado} notas ({df.categoria_principal_gasto})</p>
                        </div>
                        {df.url_google_maps && (
                          <a
                            href={df.url_google_maps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-sm transition-all whitespace-nowrap"
                          >
                            <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Ver Fachada no Mapa <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 text-xs">
                      <div className="bg-white/80 p-3 rounded-xl border border-slate-200/80">
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">📍 Endereço Declarado na Receita</p>
                        <p className="font-bold text-slate-800">
                          {df.logradouro ? `${df.logradouro}, ${df.numero || 'S/N'}` : 'Endereço não detalhado na base'}
                          {df.complemento ? ` (${df.complemento})` : ''}
                        </p>
                        <p className="text-slate-600 mt-0.5">
                          {df.bairro ? `${df.bairro} — ` : ''}{df.municipio}/{df.uf} {df.cep ? `| CEP: ${df.cep}` : ''}
                        </p>
                      </div>

                      <div className="bg-white/80 p-3 rounded-xl border border-slate-200/80">
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">👥 Quadro Societário (QSA)</p>
                        <p className="font-bold text-slate-800 line-clamp-2" title={df.qsa_socios}>
                          {df.qsa_socios || 'Empresário Individual / QSA não exposto'}
                        </p>
                        <p className="text-slate-500 mt-1">
                          Tel: {df.telefone || 'Sem telefone'} {df.email ? `| ${df.email}` : ''}
                        </p>
                      </div>

                      <div className={`p-3 rounded-xl border ${
                        df.indicio_cartel_ou_fantasma
                          ? 'bg-orange-100/70 border-orange-300 text-orange-950'
                          : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                      }`}>
                        <p className="text-[10px] font-bold uppercase opacity-75 mb-1">🔍 Diagnóstico de Sede & Rede</p>
                        {df.indicio_cartel_ou_fantasma ? (
                          <p className="font-bold text-xs leading-snug">{df.detalhe_indicio}</p>
                        ) : (
                          <p className="font-semibold text-xs">
                            Sede física individualizada, sem sobreposição de CEP/telefone ou sócios com outros fornecedores auditados.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* CONTEÚDO DA ABA 8: RADAR JUDICIÁRIO CNJ DATAJUD & CERTIDÕES OBJETO E PÉ */}
      {activeTab === 'judiciario' && (
        <section className="space-y-6 animate-in fade-in duration-300">
          {/* KPIs do Radar Judiciário */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Autos no Radar Judiciário</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{processosJudiciais.length}</p>
              <p className="text-xs text-slate-400 mt-0.5">CNJ DataJud + TSE + CGU/TCU</p>
            </div>
            <div className={`p-5 rounded-2xl border shadow-sm ${certidoesObjetoPe.length > 0 ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${certidoesObjetoPe.length > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                🚨 Certidões de Objeto e Pé
              </p>
              <p className={`text-2xl font-black mt-1 ${certidoesObjetoPe.length > 0 ? 'text-red-700' : 'text-emerald-800'}`}>
                {certidoesObjetoPe.length}
              </p>
              <p className={`text-xs mt-0.5 ${certidoesObjetoPe.length > 0 ? 'text-red-700 font-semibold' : 'text-emerald-700'}`}>
                {certidoesObjetoPe.length > 0 ? 'Apontamentos judiciais ativos' : 'Certidões criminais negativas'}
              </p>
            </div>
            <div className="bg-cyan-50 p-5 rounded-2xl border border-cyan-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-cyan-900 tracking-wider">⚖️ Autos no CNJ DataJud</p>
              <p className="text-2xl font-black text-cyan-950 mt-1">{processosDatajud.length}</p>
              <p className="text-xs text-cyan-700 mt-0.5">Rastreados na API Nacional do CNJ</p>
            </div>
            <div className={`p-5 rounded-2xl border shadow-sm ${processosSancionadores.length > 0 ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${processosSancionadores.length > 0 ? 'text-amber-900' : 'text-slate-600'}`}>
                 Processos Sancionadores (PAD)
              </p>
              <p className={`text-2xl font-black mt-1 ${processosSancionadores.length > 0 ? 'text-amber-800' : 'text-slate-700'}`}>
                {processosSancionadores.length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Contratados / Favorecidos do Gabinete</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Scale className="text-cyan-700" /> Radar Judiciário: CNJ DataJud, Certidões de Objeto e Pé & Processos Sancionadores
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Cruzamento direto com a API Pública Nacional do <strong>Conselho Nacional de Justiça (CNJ DataJud)</strong>, dossiê de <strong>Certidões Judiciais Criminais/Cíveis de Objeto e Pé (TSE)</strong> e Processos Administrativos Sancionadores da CGU/TCU.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-cyan-100 text-cyan-900 self-start md:self-auto">
                {processosJudiciais.length} autos mapeados
              </span>
            </div>

            {processosJudiciais.length === 0 ? (
              <div className="bg-slate-50 p-8 rounded-xl text-center text-slate-500">
                <p className="font-semibold text-slate-700">Nenhum processo judicial ou certidão de objeto e pé sincronizado para este parlamentar ainda.</p>
                <p className="text-xs text-slate-400 mt-1">Clique em &ldquo;Analisar Gastos Agora&rdquo; no topo para consultar a API Pública do CNJ DataJud e o repositório de certidões do TSE.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {processosJudiciais.map((proc) => {
                  const isObjetoPe = (proc.numero_processo || '').startsWith('OBJETO-PE-') || (proc.numero_processo || '').startsWith('FORO-ESP-')
                  const isPad = (proc.polo_alvo || '').includes('Fornecedor') || (proc.polo_alvo || '').includes('Favorecido') || (proc.numero_processo || '').startsWith('CEIS-') || (proc.numero_processo || '').startsWith('PAD-')
                  const classeExibicao = proc.classe_processual || proc.classe_nome || 'Processo / Certidão Judicial'
                  const poloExibicao = proc.polo_alvo || proc.polo_parlamentar || 'Deputado Titular'
                  const dataExibicao = proc.data_ajuizamento_ou_certidao || proc.data_ajuizamento || 'N/D'
                  const andamentoExibicao = proc.ultima_movimentacao || proc.resumo_andamento || 'Sem movimentação detalhada'
                  return (
                    <div
                      key={proc.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        isObjetoPe
                          ? 'bg-red-50/40 border-red-300 shadow-sm'
                          : isPad
                          ? 'bg-amber-50/40 border-amber-300 shadow-sm'
                          : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200/70">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase ${
                              isObjetoPe
                                ? 'bg-red-600 text-white'
                                : isPad
                                ? 'bg-amber-600 text-white'
                                : 'bg-cyan-800 text-white'
                            }`}>
                              {proc.tribunal}
                            </span>
                            <span className="text-sm font-black text-slate-900 font-mono">
                              {proc.numero_processo}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white border border-slate-200 text-slate-700">
                              {classeExibicao}
                            </span>
                            {proc.qtd_movimentacoes > 0 && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                                {proc.qtd_movimentacoes} mov.
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 mt-1.5 font-semibold">
                            🏛️ Órgão Julgador: <span className="text-slate-900">{proc.orgao_julgador || 'Não informado'}</span> | Risco: <span className="text-slate-900">{proc.grau_risco || 'MEDIA'}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-3 self-start lg:self-auto">
                          <div className="text-right">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Polo / Vínculo</p>
                            <p className="text-xs font-black text-slate-800">{poloExibicao}</p>
                            <p className="text-[11px] text-slate-500">Data/Ref.: {dataExibicao}</p>
                          </div>
                          {proc.url_consulta && (
                            <a
                              href={proc.url_consulta}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-sm transition-all whitespace-nowrap"
                            >
                              <Scale className="w-3.5 h-3.5 text-cyan-400" /> Abrir Certidão / Autos <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 text-xs">
                        <div className="bg-white/80 p-3 rounded-xl border border-slate-200/80">
                          <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">📋 Assuntos Processuais / Matéria</p>
                          <p className="font-bold text-slate-800">{proc.assuntos || 'Matéria Eleitoral / Administrativa'}</p>
                          <p className="text-slate-500 mt-1">Movimentações mapeadas: {proc.qtd_movimentacoes || 1}</p>
                        </div>

                        <div className={`p-3 rounded-xl border ${
                          isObjetoPe
                            ? 'bg-red-100/60 border-red-200 text-red-950'
                            : isPad
                            ? 'bg-amber-100/60 border-amber-200 text-amber-950'
                            : 'bg-cyan-50/60 border-cyan-200 text-cyan-950'
                        }`}>
                          <p className="text-[10px] font-bold uppercase opacity-75 mb-1">⚡ Último Andamento / Resumo Forense</p>
                          <p className="font-semibold text-xs leading-snug">{andamentoExibicao}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* CONTEÚDO DA ABA 9: BLOCO 6 — AUDITORIA DE FOLHA, DOU (CEAF), DUPLA LOTAÇÃO & CNE EXTRA-COTA */}
      {activeTab === 'folha_dou' && (
        <section className="space-y-6 animate-in fade-in duration-300">
          {/* KPIs do Bloco 6 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">Servidores Auditados na Folha</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{auditoriaFolha.length}</p>
              <p className="text-xs text-slate-400 mt-0.5">Secretários SP01–SP25 + CNEs</p>
            </div>
            <div className="bg-teal-50 p-5 rounded-2xl border border-teal-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-teal-900 tracking-wider">💰 Folha Bruta Mensal Estimada</p>
              <p className="text-2xl font-black text-teal-950 mt-1">{formatarMoeda(folhaMensalEstimada)}</p>
              <p className="text-xs text-teal-700 mt-0.5">Pela tabela oficial SP/CNE da Câmara</p>
            </div>
            <div className={`p-5 rounded-2xl border shadow-sm ${cnesFolha.length >= 3 ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${cnesFolha.length >= 3 ? 'text-amber-900' : 'text-slate-600'}`}>
                🏛️ Cargos CNE Extra-Cota
              </p>
              <p className={`text-2xl font-black mt-1 ${cnesFolha.length >= 3 ? 'text-amber-800' : 'text-slate-800'}`}>
                {cnesFolha.length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Pagos fora da Verba de Gabinete</p>
            </div>
            <div className={`p-5 rounded-2xl border shadow-sm ${anomaliasFolha.length > 0 ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${anomaliasFolha.length > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                🕵️ Anomalias DOU / Acúmulo / QSA
              </p>
              <p className={`text-2xl font-black mt-1 ${anomaliasFolha.length > 0 ? 'text-red-700' : 'text-emerald-800'}`}>
                {anomaliasFolha.length}
              </p>
              <p className={`text-xs mt-0.5 ${anomaliasFolha.length > 0 ? 'text-red-700 font-semibold' : 'text-emerald-700'}`}>
                {anomaliasFolha.length > 0 ? 'CEAF/DOU, Dupla Lotação, QSA ou CNE' : 'Nenhum apontamento crítico'}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Award className="text-teal-700" /> Auditoria Funcional de Gabinete, Diário Oficial da União (CEAF/CGU), Dupla Lotação & QSA
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Cruzamento da base integral de servidores da Câmara (`funcionarios.json` — Matrícula/Ponto, Nível Salarial `SP01`–`SP25` e `CNE07`–`CNE15`, Atos no Diário) com o <strong>Cadastro de Expulsões da Administração Federal (CEAF/CGU — DOU)</strong> e o <strong>Quadro Societário (QSA)</strong> dos fornecedores contratados.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-100 text-teal-900 self-start md:self-auto">
                {auditoriaFolha.length} matrículas auditadas
              </span>
            </div>

            {auditoriaFolha.length === 0 ? (
              <div className="bg-slate-50 p-8 rounded-xl text-center text-slate-500">
                <p className="font-semibold text-slate-700">Nenhum dossiê funcional de folha sincronizado para este parlamentar ainda.</p>
                <p className="text-xs text-slate-400 mt-1">Clique em &ldquo;Analisar Gastos Agora&rdquo; no topo para cruzar a folha da Câmara com o CEAF/DOU e o QSA.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...auditoriaFolha]
                  .sort((a, b) => (b.indicio_fantasma_ou_acumulo ? 1 : 0) - (a.indicio_fantasma_ou_acumulo ? 1 : 0) || (b.remuneracao_estimada || 0) - (a.remuneracao_estimada || 0))
                  .map((af) => {
                    const isAlta = af.gravidade === 'ALTA'
                    const isMedia = af.gravidade === 'MEDIA'
                    return (
                      <div
                        key={af.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isAlta
                            ? 'bg-red-50/50 border-red-300 shadow-sm'
                            : isMedia
                            ? 'bg-amber-50/40 border-amber-300 shadow-sm'
                            : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                                {af.ponto_matricula}
                              </span>
                              <span className="text-sm font-black text-slate-900">
                                {af.nome_servidor}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase ${
                                (af.codigo_cargo || '').startsWith('CNE')
                                  ? 'bg-purple-700 text-white'
                                  : 'bg-teal-800 text-white'
                              }`}>
                                {af.codigo_cargo}
                              </span>
                              <span className="text-xs font-semibold text-slate-600">
                                {af.grupo_funcional}
                              </span>
                              {af.indicio_fantasma_ou_acumulo && (
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  isAlta ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                                }`}>
                                  🚨 {af.tipo_anomalia}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1.5 leading-snug">
                              {af.detalhe_auditoria}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 self-start lg:self-auto">
                            <div className="text-right whitespace-nowrap">
                              <p className="text-[10px] font-bold uppercase text-slate-400">Salário Bruto Tabulado</p>
                              <p className="text-base font-black text-slate-900">{formatarMoeda(af.remuneracao_estimada)}/mês</p>
                              <p className="text-[10px] text-slate-500">Ato: {af.ato_nomeacao || 'PORTARIA'} ({af.data_pub_nomeacao || 'N/D'})</p>
                            </div>
                            {af.url_comprovante && (
                              <a
                                href={af.url_comprovante}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-sm transition-all whitespace-nowrap"
                              >
                                Contracheque Oficial <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
