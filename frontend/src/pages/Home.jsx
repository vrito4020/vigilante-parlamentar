import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  BarChart3,
  PieChart as PieChartIcon,
  Building2,
  ShieldAlert,
  Coins,
  Filter,
  Scale,
  MapPin,
  RotateCcw
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts'

const CORES_CATEGORIAS = [
  '#2563eb', // Azul
  '#4f46e5', // Índigo
  '#0891b2', // Ciano
  '#059669', // Esmeralda
  '#d97706', // Âmbar
  '#7c3aed', // Roxo
  '#db2777', // Rosa
  '#475569'  // Cinza ardósia
]

const formatarMoedaCompleta = (val) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)

// Tooltip para valores monetários
const TooltipMoeda = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 max-w-xs z-50">
        <p className="font-bold text-sm text-slate-100">{data.razao_completa || data.categoria}</p>
        {data.cnpj && <p className="text-slate-400">CNPJ: {data.cnpj}</p>}
        <p className="text-emerald-400 font-bold text-base">
          {formatarMoedaCompleta(payload[0].value)}
        </p>
        {data.quantidade && <p className="text-slate-300">{data.quantidade} notas fiscais emitidas</p>}
        {data.percentual !== undefined && (
          <p className="text-blue-300 font-semibold">{data.percentual}% do volume total</p>
        )}
      </div>
    )
  }
  return null
}

// Tooltip para contagem de alertas
const TooltipAlerta = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 z-50">
        <p className="font-bold text-sm text-slate-100">{data.tipo || data.severidade}</p>
        <p className="text-amber-400 font-bold text-base">
          {payload[0].value} {payload[0].value === 1 ? 'incidência' : 'incidências'}
        </p>
      </div>
    )
  }
  return null
}

import { API_URL } from '../config'

export default function Home() {
  const [stats, setStats] = useState(null)
  const [chartsData, setChartsData] = useState(null)
  const [deputados, setDeputados] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroUF, setFiltroUF] = useState('TODAS')
  const [filtroPartido, setFiltroPartido] = useState('TODOS')
  const [filtroFaixaRisco, setFiltroFaixaRisco] = useState('TODOS')
  const [filtroHeuristica, setFiltroHeuristica] = useState('TODAS')
  const [ordenacao, setOrdenacao] = useState('MAIOR_RISCO')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  
  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/api/dashboard/stats`),
      axios.get(`${API_URL}/api/deputados`),
      axios.get(`${API_URL}/api/dashboard/charts`)
    ]).then(([resStats, resDeps, resCharts]) => {
      setStats(resStats.data)
      setDeputados(resDeps.data)
      setChartsData(resCharts.data)
    }).catch(err => console.error("Erro ao carregar dados:", err))
  }, [])

  // Listas dinâmicas para os seletores de filtros avançados
  const listaUFs = useMemo(() => {
    const s = new Set(deputados.map(d => d.uf).filter(Boolean))
    return Array.from(s).sort()
  }, [deputados])

  const listaPartidos = useMemo(() => {
    const s = new Set(deputados.map(d => d.partido).filter(Boolean))
    return Array.from(s).sort()
  }, [deputados])

  const listaHeuristicas = useMemo(() => {
    const s = new Set()
    deputados.forEach(d => {
      (d.alertas || []).forEach(al => {
        const tipo = al.tipo_heuristica || al.tipo_alerta
        if (tipo) s.add(tipo)
      })
    })
    return Array.from(s).sort()
  }, [deputados])

  // Filtragem Combinada e Ordenação
  const filteredDeputados = useMemo(() => {
    const filtrados = deputados.filter(dep => {
      const matchBusca =
        !searchTerm ||
        dep.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
        dep.partido.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dep.uf.toLowerCase().includes(searchTerm.toLowerCase())

      if (!matchBusca) return false
      if (filtroUF !== 'TODAS' && dep.uf !== filtroUF) return false
      if (filtroPartido !== 'TODOS' && dep.partido !== filtroPartido) return false

      const risco = dep.indice_risco || 0
      const qtdAlertas = (dep.alertas || []).length

      if (filtroFaixaRisco === 'CRITICO_ALTO' && risco <= 50) return false
      if (filtroFaixaRisco === 'MODERADO' && (risco <= 20 || risco > 50)) return false
      if (filtroFaixaRisco === 'BAIXO' && (risco <= 0 || risco > 20)) return false
      if (filtroFaixaRisco === 'JA_AUDITADOS' && risco <= 0 && qtdAlertas === 0) return false
      if (filtroFaixaRisco === 'PENDENTES' && (risco > 0 || qtdAlertas > 0)) return false

      if (filtroHeuristica !== 'TODAS') {
        const possuiAlerta = (dep.alertas || []).some(al => (al.tipo_heuristica || al.tipo_alerta) === filtroHeuristica)
        if (!possuiAlerta) return false
      }

      return true
    })

    return [...filtrados].sort((a, b) => {
      if (ordenacao === 'MAIOR_RISCO') return (b.indice_risco || 0) - (a.indice_risco || 0)
      if (ordenacao === 'MAIS_ALERTAS') return ((b.alertas || []).length) - ((a.alertas || []).length)
      if (ordenacao === 'NOME_AZ') return a.nome.localeCompare(b.nome)
      return 0
    })
  }, [deputados, searchTerm, filtroUF, filtroPartido, filtroFaixaRisco, filtroHeuristica, ordenacao])

  const totalPages = Math.max(1, Math.ceil(filteredDeputados.length / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const currentDeputados = filteredDeputados.slice(startIndex, startIndex + itemsPerPage)

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
    setCurrentPage(1)
  }

  const limparFiltros = () => {
    setSearchTerm('')
    setFiltroUF('TODAS')
    setFiltroPartido('TODOS')
    setFiltroFaixaRisco('TODOS')
    setFiltroHeuristica('TODAS')
    setOrdenacao('MAIOR_RISCO')
    setCurrentPage(1)
  }

  const temFiltroAtivo =
    searchTerm !== '' ||
    filtroUF !== 'TODAS' ||
    filtroPartido !== 'TODOS' ||
    filtroFaixaRisco !== 'TODOS' ||
    filtroHeuristica !== 'TODAS'

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Painel de Monitoramento & Auditoria Forense</h1>
            <p className="text-slate-600 text-base mt-1">
              Auditoria cívica em tempo real dos gastos da Cota Parlamentar (CEAP) cruzados com <strong>CGU (CEIS/CNEP)</strong>, <strong>Folha da Câmara (Assessores)</strong>, <strong>Receita Federal (QSA)</strong> e <strong>TSE</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                🚨 CGU / CEIS / CNEP Integrados
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                ⚡ Emendas PIX & Transferegov
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                👥 Folha de Pessoal da Câmara
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                ⚖️ Tribunal de Contas da União (TCU)
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                🗳️ TSE Doações & Patrimônio
              </span>
            </div>
          </div>
          {chartsData?.total_volume_financeiro > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl flex items-center gap-2 self-start md:self-auto shadow-sm">
              <Coins className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xs uppercase font-bold text-emerald-700 tracking-wider">Volume CEAP Auditado</p>
                <p className="text-lg font-black text-emerald-950">{formatarMoedaCompleta(chartsData.total_volume_financeiro)}</p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-5 hover:shadow-md transition-shadow">
          <div className="bg-blue-50 p-4 rounded-xl text-blue-600 ring-1 ring-blue-100">
            <Users size={32} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Deputados Cadastrados</p>
            <p className="text-4xl font-black text-slate-800 mt-1">{stats?.total_deputados || '-'}</p>
            <p className="text-xs text-slate-400 mt-1">57ª Legislatura Federal</p>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-5 hover:shadow-md transition-shadow">
          <div className="bg-red-50 p-4 rounded-xl text-red-600 ring-1 ring-red-100">
            <AlertTriangle size={32} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inconformidades Detectadas</p>
            <p className="text-4xl font-black text-slate-800 mt-1">{stats?.total_alertas || '-'}</p>
            <p className="text-xs text-red-500 font-semibold mt-1">
              {stats?.alertas_fantasma || 0} empresas suspeitas/fantasmas
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-5 hover:shadow-md transition-shadow">
          <div className="bg-amber-50 p-4 rounded-xl text-amber-600 ring-1 ring-amber-100">
            <TrendingUp size={32} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Índice Médio de Risco</p>
            <p className="text-4xl font-black text-slate-800 mt-1">{stats?.media_risco_geral || '-'}</p>
            <p className="text-xs text-slate-400 mt-1">Escala forense de 0 a 100 pontos</p>
          </div>
        </div>
      </div>

      {/* SEÇÃO ANALÍTICA: GRÁFICOS */}
      {chartsData && (
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-slate-900">Gráficos Analíticos da Cota Parlamentar</h2>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
              Dados Reais Consolidados
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico 1: Top Fornecedores */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-bold text-slate-800">Top Fornecedores por Volume (R$)</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Maiores recebedores CEAP</span>
                </div>
                <p className="text-xs text-slate-500 mb-6">
                  Empresas e fornecedores que mais faturaram com a cota parlamentar dos deputados auditados.
                </p>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartsData.top_fornecedores}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
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
                        width={130}
                        tickLine={false}
                      />
                      <Tooltip content={<TooltipMoeda />} />
                      <Bar 
                        dataKey="total" 
                        fill="#2563eb" 
                        radius={[0, 6, 6, 0]} 
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Concentração financeira da cota</span>
                <span className="font-semibold text-slate-700">Top 6 Empresas</span>
              </div>
            </div>

            {/* Gráfico 2: Distribuição por Categorias */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-bold text-slate-800">Distribuição por Categoria de Despesa</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Divisão percentual</span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Onde os parlamentares mais concentram o uso dos recursos públicos disponíveis.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartsData.categorias_despesas.slice(0, 6)}
                          dataKey="total"
                          nameKey="categoria"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                        >
                          {chartsData.categorias_despesas.slice(0, 6).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CORES_CATEGORIAS[index % CORES_CATEGORIAS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<TooltipMoeda />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2 pr-2">
                    {chartsData.categorias_despesas.slice(0, 5).map((cat, idx) => (
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
                <span>Classificação oficial da CEAP</span>
                <span className="font-semibold text-slate-700">{chartsData.categorias_despesas.length} categorias identificadas</span>
              </div>
            </div>

            {/* Gráfico 3: Alertas por Heurística Forense */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-600" />
                    <h3 className="text-lg font-bold text-slate-800">Anomalias Detectadas por Heurística</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Fórmulas algorítmicas</span>
                </div>
                <p className="text-xs text-slate-500 mb-6">
                  Frequência das anomalias encontradas nas notas fiscais auditadas (motor forense v4).
                </p>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartsData.alertas_por_tipo}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                    >
                      <XAxis type="number" stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                      <YAxis 
                        type="category" 
                        dataKey="tipo" 
                        stroke="#64748b" 
                        fontSize={11}
                        width={150}
                        tickLine={false}
                      />
                      <Tooltip content={<TooltipAlerta />} />
                      <Bar 
                        dataKey="quantidade" 
                        fill="#f59e0b" 
                        radius={[0, 6, 6, 0]} 
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <Link to="/metodologia" className="text-blue-600 hover:underline font-semibold">
                  Ver metodologia e regras detalhadas &rarr;
                </Link>
                <span className="font-semibold text-slate-700">{stats?.total_alertas || 0} inconformidades</span>
              </div>
            </div>

            {/* Gráfico 4: Severidade dos Alertas */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <h3 className="text-lg font-bold text-slate-800">Classificação por Gravidade</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Severidade de risco</span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Proporção de inconformidades críticas (Alta), intermediárias (Média) e operacionais (Baixa).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartsData.severidade_alertas}
                          dataKey="quantidade"
                          nameKey="severidade"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={4}
                        >
                          {chartsData.severidade_alertas.map((entry, index) => (
                            <Cell key={`cell-sev-${index}`} fill={entry.cor} />
                          ))}
                        </Pie>
                        <Tooltip content={<TooltipAlerta />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-3">
                    {chartsData.severidade_alertas.map((sev) => (
                      <div 
                        key={sev.severidade} 
                        className="p-3 rounded-xl border flex items-center justify-between"
                        style={{ borderColor: `${sev.cor}40`, backgroundColor: `${sev.cor}10` }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: sev.cor }} />
                          <span className="text-xs font-bold text-slate-800">{sev.severidade}</span>
                        </div>
                        <span className="text-base font-black" style={{ color: sev.cor }}>
                          {sev.quantidade}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Critério baseado em materialidade e tipicidade</span>
                <span className="font-semibold text-slate-700">100% auditado</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tabela de Deputados com Ranking e Filtros Avançados */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">Ranking de Risco de Inconformidade</h2>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {filteredDeputados.length} exibidos
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Utilize os filtros combinados abaixo para cruzar UF, Partido, Faixa de Risco e Heurística Forense.
              </p>
            </div>
            
            {/* Caixa de Pesquisa Rápida */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Pesquisar nome, partido ou UF..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block w-full md:w-80 sm:text-sm transition-all shadow-sm bg-white"
              />
            </div>
          </div>

          {/* Barra de Filtros Avançados */}
          <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Estado (UF)
              </label>
              <select
                value={filtroUF}
                onChange={(e) => { setFiltroUF(e.target.value); setCurrentPage(1); }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500"
              >
                <option value="TODAS">Todas as 27 UFs</option>
                {listaUFs.map(uf => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Partido Político
              </label>
              <select
                value={filtroPartido}
                onChange={(e) => { setFiltroPartido(e.target.value); setCurrentPage(1); }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500"
              >
                <option value="TODOS">Todos os Partidos ({listaPartidos.length})</option>
                {listaPartidos.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Faixa de Risco / Status
              </label>
              <select
                value={filtroFaixaRisco}
                onChange={(e) => { setFiltroFaixaRisco(e.target.value); setCurrentPage(1); }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500"
              >
                <option value="TODOS">Todos os Parlamentares</option>
                <option value="JA_AUDITADOS">Somente Já Auditados (Risco &gt; 0)</option>
                <option value="CRITICO_ALTO">Risco Crítico / Alto (&gt; 50 pts)</option>
                <option value="MODERADO">Risco Moderado (20.1 a 50 pts)</option>
                <option value="BAIXO">Risco Baixo (0.1 a 20 pts)</option>
                <option value="PENDENTES">Aguardando Auditoria (0.0 pts)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Anomalia / Heurística Forense
              </label>
              <select
                value={filtroHeuristica}
                onChange={(e) => { setFiltroHeuristica(e.target.value); setCurrentPage(1); }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500"
              >
                <option value="TODAS">Todas as Heurísticas</option>
                {listaHeuristicas.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-grow">
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Ordenar Por
                </label>
                <select
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="MAIOR_RISCO">Maior Índice de Risco</option>
                  <option value="MAIS_ALERTAS">Maior Nº de Alertas</option>
                  <option value="NOME_AZ">Ordem Alfabética (A-Z)</option>
                </select>
              </div>

              {temFiltroAtivo && (
                <button
                  onClick={limparFiltros}
                  title="Limpar todos os filtros"
                  className="mt-5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="px-6 py-4 font-semibold">Parlamentar</th>
                <th className="px-6 py-4 font-semibold">Partido/UF</th>
                <th className="px-6 py-4 font-semibold text-center">Alertas Detectados</th>
                <th className="px-6 py-4 font-semibold text-center">Índice de Risco</th>
                <th className="px-6 py-4 font-semibold text-right">Ações Forenses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentDeputados.map((dep) => {
                const qtdAlertas = (dep.alertas || []).length
                const possuiSancaoCGU = dep.possui_sancao_cgu || dep.alertas?.some(a => a.tipo_heuristica === 'FORNECEDOR_SANCIONADO_CEIS_CNEP')
                const totalAssessores = dep.total_assessores || dep.assessores?.length || 0
                const totalEmendasPix = dep.total_emendas_pix || 0
                const qtdFavSanc = dep.qtd_favorecidos_sancionados || 0

                return (
                  <tr key={dep.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img src={dep.url_foto} alt={dep.nome} className="w-12 h-12 rounded-full object-cover border border-slate-200 shadow-sm" />
                        <div>
                          <p className="font-bold text-slate-800 text-base">{dep.nome}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-400">ID: {dep.id}</span>
                            {possuiSancaoCGU && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-300">
                                🚨 Sancionado CGU
                              </span>
                            )}
                            {qtdFavSanc > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-900 border border-rose-300">
                                💸 {qtdFavSanc} Emenda(s) em Lista Negra
                              </span>
                            )}
                            {totalEmendasPix > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                                ⚡ PIX: R$ {(totalEmendasPix / 1000000).toFixed(1)}M
                              </span>
                            )}
                            {totalAssessores > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                👥 {totalAssessores} assessores
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {dep.partido} - {dep.uf}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {qtdAlertas > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3.5 h-3.5" /> {qtdAlertas} {qtdAlertas === 1 ? 'alerta' : 'alertas'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Sem alertas</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`font-black text-2xl ${dep.indice_risco > 50 ? 'text-red-600' : dep.indice_risco > 20 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {dep.indice_risco.toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <Link
                          to={`/comparar?dep1=${dep.id}`}
                          title="Comparar lado a lado com outro deputado"
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 border border-slate-300 text-xs font-bold rounded-xl text-slate-700 bg-white hover:bg-slate-100 transition-all"
                        >
                          <Scale className="w-3.5 h-3.5 text-blue-600" /> Comparar
                        </Link>
                        <Link
                          to={`/deputado/${dep.id}`}
                          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-semibold rounded-xl text-white bg-slate-900 hover:bg-slate-800 shadow-sm hover:shadow transition-all"
                        >
                          Ver Dossiê &rarr;
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {currentDeputados.length === 0 && deputados.length > 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-slate-500 font-medium">
                    Nenhum parlamentar encontrado para a combinação de filtros selecionada.
                  </td>
                </tr>
              )}
              {deputados.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-slate-500 font-medium">
                    Carregando dados da Câmara dos Deputados... Pode levar alguns instantes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {filteredDeputados.length > 0 && (
          <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Mostrando <span className="font-semibold">{startIndex + 1}</span> a <span className="font-semibold">{Math.min(startIndex + itemsPerPage, filteredDeputados.length)}</span> de <span className="font-semibold">{filteredDeputados.length}</span> parlamentares
            </p>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center px-3 py-2 border border-slate-300 rounded-xl bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center px-3 py-2 border border-slate-300 rounded-xl bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Próxima <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
