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
            {temSancoes && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5 mr-1 text-red-600" /> Fornecedor Sancionado (CGU)
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
          onClick={() => setActiveTab('gabinete')}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'gabinete'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" /> Pessoal de Gabinete ({assessores.length})
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

      {/* CONTEÚDO DA ABA 3: PESSOAL DE GABINETE & SECRETÁRIOS PARLAMENTARES */}
      {activeTab === 'gabinete' && (
        <section className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Users className="text-blue-600" /> Folha de Pessoal do Gabinete Parlamentar
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Servidores comissionados nomeados diretamente pelo deputado na Câmara Federal, auditados contra o Quadro Societário (QSA) da Receita Federal para detecção de autocontratação e repasse de cota.
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
                      <th className="px-4 py-3 font-semibold text-center">Status QSA / Vínculo</th>
                      <th className="px-4 py-3 font-semibold text-right">Transparência Câmara</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assessores.map((assessor) => (
                      <tr key={assessor.id} className="hover:bg-slate-50 transition-colors">
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
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                            Auditado no QSA
                          </span>
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
                    ))}
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
    </div>
  )
}
