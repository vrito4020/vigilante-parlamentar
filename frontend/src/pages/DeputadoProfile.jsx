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
  PieChart as PieChartIcon
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
      fetchDeputado() // Atualiza os dados após a análise
    } catch (error) {
      console.error("Erro ao analisar:", error)
      alert("Houve um erro ao realizar a análise.")
    } finally {
      setIsAnalyzing(false)
    }
  }

  if (!deputado) return <div className="text-center py-20 text-slate-500 font-medium">Carregando dossiê parlamentar...</div>

  const temDespesas = analytics && analytics.evolucao_mensal && analytics.evolucao_mensal.length > 0

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
              <p className="text-xs text-slate-400 mt-0.5">ID Parlamentar: {deputado.id} | Legislatura 57</p>
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
                    <RefreshCw className="w-4 h-4 animate-spin" /> Analisando Gastos...
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
        
        {/* Efeito decorativo se risco for alto */}
        {deputado.indice_risco > 50 && (
          <div className="absolute top-0 right-0 w-64 h-64 bg-red-500 opacity-5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none"></div>
        )}
      </div>

      {/* Mensagem de Sucesso na Análise */}
      {analysisDone && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-4 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-4">
          <p className="font-medium text-sm">
            Análise concluída com sucesso! As despesas foram baixadas da Câmara (CEAP), auditadas pelo motor forense e o patrimônio foi sincronizado com o TSE.
          </p>
          <button onClick={() => setAnalysisDone(false)} className="text-emerald-600 hover:text-emerald-900 font-bold px-2">&times;</button>
        </div>
      )}

      {/* RESUMO FINANCEIRO DO DEPUTADO */}
      {temDespesas ? (
        <section className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-wider">Total Gasto CEAP</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{formatarMoeda(analytics.total_gasto)}</p>
              <p className="text-xs text-slate-400 mt-1">Período auditado</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold uppercase tracking-wider">Média Mensal</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{formatarMoeda(analytics.media_mensal)}</p>
              <p className="text-xs text-slate-400 mt-1">Gasto médio por mês</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold uppercase tracking-wider">Maior Nota Fiscal</span>
              </div>
              <p className="text-2xl font-black text-emerald-600">{formatarMoeda(analytics.maior_nota)}</p>
              <p className="text-xs text-slate-400 mt-1">Despesa de pico único</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold uppercase tracking-wider">Notas Processadas</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{analytics.total_notas}</p>
              <p className="text-xs text-slate-400 mt-1">Comprovantes fiscais</p>
            </div>
          </div>

          {/* GRÁFICOS DO DEPUTADO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico 1: Evolução Mês a Mês */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-bold text-slate-900">Evolução Mensal dos Gastos</h3>
                </div>
                <span className="text-xs text-slate-400 font-medium">Histórico temporal</span>
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Curva de gastos da cota parlamentar ao longo dos meses auditados.
              </p>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={analytics.evolucao_mensal}
                    margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="corGastoDep" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="mes_rotulo" stroke="#94a3b8" fontSize={11} />
                    <YAxis 
                      tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} 
                      stroke="#94a3b8" 
                      fontSize={11} 
                    />
                    <Tooltip content={<TooltipMoeda />} />
                    <Area 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#2563eb" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#corGastoDep)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico 2: Categorias de Gastos deste Deputado */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-bold text-slate-900">Gastos por Categoria</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Divisão interna</span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Distribuição orçamentária dos recursos utilizados por este parlamentar.
                </p>

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
                          <span 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: CORES_CATEGORIAS[idx % CORES_CATEGORIAS.length] }} 
                          />
                          <span className="text-slate-700 font-medium truncate">{cat.categoria}</span>
                        </div>
                        <span className="font-bold text-slate-900 ml-2">{cat.percentual}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Concentração de gastos</span>
                <span className="font-semibold text-slate-700">{analytics.categorias.length} categorias</span>
              </div>
            </div>

            {/* Gráfico 3: Top Fornecedores do Deputado */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-slate-900">Maiores Fornecedores Contratados por este Deputado</h3>
                </div>
                <span className="text-xs text-slate-400 font-medium">Top 5 Empresas</span>
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Pessoas jurídicas que receberam os maiores repasses de cota direta deste parlamentar.
              </p>

              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analytics.top_fornecedores}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  >
                    <XAxis 
                      type="number" 
                      tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} 
                      stroke="#94a3b8" 
                      fontSize={11} 
                    />
                    <YAxis 
                      type="category" 
                      dataKey="razao_social" 
                      stroke="#64748b" 
                      fontSize={11} 
                      width={160}
                      tickLine={false} 
                    />
                    <Tooltip content={<TooltipMoeda />} />
                    <Bar 
                      dataKey="total" 
                      fill="#059669" 
                      radius={[0, 6, 6, 0]} 
                    />
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
            Este parlamentar ainda não teve suas notas fiscais da Câmara sincronizadas nesta sessão. Clique no botão <strong>"Analisar Gastos Agora"</strong> no topo da página para baixar os comprovantes, cruzar com a Receita Federal e gerar os gráficos analíticos em tempo real.
          </p>
        </div>
      )}

      {/* Cards de Comparação com a Câmara */}
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
                  <p className="text-4xl font-black text-slate-700">
                    {stats.media_risco_geral}
                  </p>
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
                Número de inconformidades flagradas pelo motor de 14 heurísticas forenses.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Painel de Alertas */}
      <section>
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <AlertCircle className={deputado.alertas.length > 0 ? "text-red-500" : "text-emerald-500"} />
          Painel de Inconformidades e Alertas ({deputado.alertas.length})
        </h2>
        
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
                ALTA: { borda: 'border-red-500', badge: 'bg-red-100 text-red-700', rotulo: 'Alta' },
                MEDIA: { borda: 'border-amber-500', badge: 'bg-amber-100 text-amber-800', rotulo: 'Média' },
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
                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                    {alerta.tipo_heuristica === 'PATRIMONIO_ELEVADO' ? 'Fonte: TSE (DivulgaCandContas)' : 'Fonte: Câmara (CEAP) + Receita Federal'}
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
    </div>
  )
}
