import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  MapPin,
  Plane,
  Flame,
  ShieldAlert,
  FileText,
  ExternalLink,
  Navigation,
  Building2,
  Users,
  Filter,
  AlertTriangle,
  Activity,
  Award
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts'
import { API_URL } from '../config'

// Posicionamento cartográfico esquemático das 27 UFs no Mapa SVG do Brasil (viewBox 0 0 800 720)
const POSICOES_UF = {
  RR: { x: 255, y: 75, regiao: 'Norte' },
  AP: { x: 445, y: 95, regiao: 'Norte' },
  AM: { x: 195, y: 185, regiao: 'Norte' },
  PA: { x: 410, y: 195, regiao: 'Norte' },
  AC: { x: 95,  y: 265, regiao: 'Norte' },
  RO: { x: 215, y: 295, regiao: 'Norte' },
  TO: { x: 465, y: 300, regiao: 'Norte' },

  MA: { x: 530, y: 195, regiao: 'Nordeste' },
  PI: { x: 580, y: 235, regiao: 'Nordeste' },
  CE: { x: 645, y: 195, regiao: 'Nordeste' },
  RN: { x: 705, y: 215, regiao: 'Nordeste' },
  PB: { x: 710, y: 255, regiao: 'Nordeste' },
  PE: { x: 660, y: 285, regiao: 'Nordeste' },
  AL: { x: 705, y: 320, regiao: 'Nordeste' },
  SE: { x: 680, y: 355, regiao: 'Nordeste' },
  BA: { x: 585, y: 365, regiao: 'Nordeste' },

  MT: { x: 335, y: 355, regiao: 'Centro-Oeste' },
  GO: { x: 445, y: 420, regiao: 'Centro-Oeste' },
  DF: { x: 485, y: 395, regiao: 'Centro-Oeste' },
  MS: { x: 355, y: 485, regiao: 'Centro-Oeste' },

  MG: { x: 545, y: 465, regiao: 'Sudeste' },
  ES: { x: 635, y: 485, regiao: 'Sudeste' },
  RJ: { x: 595, y: 540, regiao: 'Sudeste' },
  SP: { x: 475, y: 535, regiao: 'Sudeste' },

  PR: { x: 430, y: 590, regiao: 'Sul' },
  SC: { x: 455, y: 635, regiao: 'Sul' },
  RS: { x: 405, y: 680, regiao: 'Sul' }
}

const formatarMoeda = (val) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)

const obterCorCalor = (risco, auditados) => {
  if (!auditados || auditados === 0) return '#334155' // Slate-700 (sem auditoria ainda)
  if (risco >= 65) return '#ef4444' // Vermelho Crítico
  if (risco >= 40) return '#f97316' // Laranja Alto
  if (risco >= 20) return '#eab308' // Amarelo Moderado
  return '#10b981' // Esmeralda Baixo
}

export default function MapaForense() {
  const [dadosMapa, setDadosMapa] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ufSelecionada, setUfSelecionada] = useState(null)
  const [rotaSelecionada, setRotaSelecionada] = useState(null)
  const [filtroDeputadoRota, setFiltroDeputadoRota] = useState('TODOS')
  const [modoCor, setModoCor] = useState('RISCO') // 'RISCO' ou 'GASTO'
  const [abaAtiva, setAbaAtiva] = useState('MAPA_ROTAS') // 'MAPA_ROTAS' | 'PARTIDOS_ESTADOS'

  useEffect(() => {
    axios.get(`${API_URL}/api/mapa-forense`)
      .then(res => {
        setDadosMapa(res.data)
        if (res.data?.rotas_teletransporte?.length > 0) {
          setRotaSelecionada(res.data.rotas_teletransporte[0])
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('Erro ao carregar mapa forense:', err)
        setLoading(false)
      })
  }, [])

  const ufMap = useMemo(() => {
    if (!dadosMapa?.heatmap_uf) return {}
    const m = {}
    dadosMapa.heatmap_uf.forEach(item => {
      m[item.uf] = item
    })
    return m
  }, [dadosMapa])

  const deputadosComRotas = useMemo(() => {
    if (!dadosMapa?.rotas_teletransporte) return []
    const mapDeps = new Map()
    dadosMapa.rotas_teletransporte.forEach(r => {
      if (!mapDeps.has(r.deputado_id)) {
        mapDeps.set(r.deputado_id, {
          id: r.deputado_id,
          nome: r.deputado_nome,
          partido: r.partido,
          uf: r.uf_deputado
        })
      }
    })
    return Array.from(mapDeps.values())
  }, [dadosMapa])

  const rotasFiltradas = useMemo(() => {
    if (!dadosMapa?.rotas_teletransporte) return []
    return dadosMapa.rotas_teletransporte.filter(r => {
      if (filtroDeputadoRota !== 'TODOS' && String(r.deputado_id) !== String(filtroDeputadoRota)) {
        return false
      }
      if (ufSelecionada && r.origem_uf !== ufSelecionada && r.destino_uf !== ufSelecionada) {
        return false
      }
      return true
    })
  }, [dadosMapa, filtroDeputadoRota, ufSelecionada])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 font-semibold">Calculando rotas geográficas (Haversine) e matrizes de calor por Estado e Partido...</p>
      </div>
    )
  }

  const maxGastoUf = Math.max(...(dadosMapa?.heatmap_uf?.map(u => u.total_gasto) || [1]), 1)

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Cabeçalho */}
      <header className="bg-slate-900 text-white rounded-3xl p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold uppercase tracking-wider">
              <Plane className="w-3.5 h-3.5" /> Geointeligência Forense & Auditoria Espacial
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">
              Mapa de Teletransporte & Calor de Inconformidades
            </h1>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Rastreamento geográfico de notas fiscais presenciais emitidas na <strong>mesma data</strong> em estados fisicamente incompatíveis (Fórmula de Haversine), além da concentração de risco por <strong>Unidade Federativa (UF)</strong> e <strong>Partido Político</strong>.
            </p>
          </div>

          {/* Seletor de Abas */}
          <div className="flex bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700 self-start">
            <button
              onClick={() => setAbaAtiva('MAPA_ROTAS')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                abaAtiva === 'MAPA_ROTAS'
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Navigation className="w-4 h-4" />
              Mapa & Rotas de Teletransporte ({dadosMapa?.rotas_teletransporte?.length || 0})
            </button>
            <button
              onClick={() => setAbaAtiva('PARTIDOS_ESTADOS')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                abaAtiva === 'PARTIDOS_ESTADOS'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Flame className="w-4 h-4" />
              Matriz de Calor: Partidos & UFs
            </button>
          </div>
        </div>
      </header>

      {abaAtiva === 'MAPA_ROTAS' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* COLUNA ESQUERDA: Mapa Interativo SVG do Brasil (7 colunas) */}
          <div className="lg:col-span-7 bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl p-6 text-white flex flex-col justify-between">
            <div>
              {/* Barra de Controles do Mapa */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-extrabold flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-red-500" />
                    Cartografia Forense das 27 UFs e Rotas Críticas
                  </h2>
                  <p className="text-xs text-slate-400">
                    Clique em um estado para filtrar ou selecione um arco vermelho pulsante para inspecionar os PDFs.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={filtroDeputadoRota}
                    onChange={(e) => setFiltroDeputadoRota(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 font-semibold focus:ring-2 focus:ring-red-500"
                  >
                    <option value="TODOS">Todos os Parlamentares ({rotasFiltradas.length} rotas)</option>
                    {deputadosComRotas.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.nome} ({d.partido}-{d.uf})
                      </option>
                    ))}
                  </select>

                  {ufSelecionada && (
                    <button
                      onClick={() => setUfSelecionada(null)}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl font-bold border border-slate-700"
                    >
                      Limpar UF ({ufSelecionada}) ✕
                    </button>
                  )}
                </div>
              </div>

              {/* SVG Interativo do Brasil */}
              <div className="relative w-full aspect-[800/700] bg-gradient-to-b from-slate-900/70 to-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden">
                <svg viewBox="0 0 800 740" className="w-full h-full select-none">
                  <defs>
                    <radialGradient id="brGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#1e293b" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#020617" stopOpacity="0" />
                    </radialGradient>
                    <filter id="neonRed" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Grade de fundo estilo radar forense */}
                  <circle cx="430" cy="380" r="310" fill="url(#brGlow)" stroke="#1e293b" strokeDasharray="4 4" />
                  <circle cx="430" cy="380" r="210" fill="none" stroke="#1e293b" strokeDasharray="4 4" />
                  <circle cx="430" cy="380" r="110" fill="none" stroke="#1e293b" strokeDasharray="4 4" />
                  <line x1="60" y1="380" x2="760" y2="380" stroke="#1e293b" strokeWidth="1" />
                  <line x1="430" y1="30" x2="430" y2="710" stroke="#1e293b" strokeWidth="1" />

                  {/* Silhueta Poligonal Estilizada do Território Brasileiro */}
                  <polygon
                    points="250,50 460,65 550,165 735,200 735,335 615,400 665,495 595,565 480,565 420,710 355,665 385,575 325,505 295,365 190,320 65,270 155,150"
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />

                  {/* Linhas Vermelhas de Teletransporte (Arcos Bézier) */}
                  {rotasFiltradas.map((rota) => {
                    const p1 = POSICOES_UF[rota.origem_uf]
                    const p2 = POSICOES_UF[rota.destino_uf]
                    if (!p1 || !p2) return null

                    const isSelected = rotaSelecionada?.id === rota.id
                    const midX = (p1.x + p2.x) / 2
                    const midY = (p1.y + p2.y) / 2 - 42 // Curvatura do arco
                    const pathData = `M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`

                    return (
                      <g
                        key={rota.id}
                        onClick={() => setRotaSelecionada(rota)}
                        className="cursor-pointer group"
                      >
                        {/* Linha de fundo para clique mais fácil */}
                        <path
                          d={pathData}
                          fill="none"
                          stroke={isSelected ? '#ef4444' : '#f87171'}
                          strokeWidth={isSelected ? 4.5 : 2.2}
                          strokeOpacity={isSelected ? 1 : 0.55}
                          filter={isSelected ? 'url(#neonRed)' : undefined}
                        />
                        {/* Linha tracejada animada */}
                        <path
                          d={pathData}
                          fill="none"
                          stroke="#fecaca"
                          strokeWidth={isSelected ? 2.5 : 1.2}
                          strokeDasharray="6 6"
                        >
                          <animate
                            attributeName="stroke-dashoffset"
                            from="24"
                            to="0"
                            dur={isSelected ? '0.8s' : '1.6s'}
                            repeatCount="indefinite"
                          />
                        </path>

                        {/* Etiqueta de quilometragem no meio do arco se selecionado */}
                        {isSelected && (
                          <g transform={`translate(${midX}, ${midY - 8})`}>
                            <rect
                              x="-52"
                              y="-14"
                              width="104"
                              height="22"
                              rx="6"
                              fill="#7f1d1d"
                              stroke="#ef4444"
                              strokeWidth="1.5"
                            />
                            <text
                              x="0"
                              y="1"
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="10"
                              fontWeight="bold"
                            >
                              ⚡ {rota.distancia_km} km
                            </text>
                          </g>
                        )}
                      </g>
                    )
                  })}

                  {/* Nós dos 27 Estados (UFs) */}
                  {Object.entries(POSICOES_UF).map(([sigla, pos]) => {
                    const info = ufMap[sigla] || {
                      media_risco_auditados: 0,
                      deputados_auditados: 0,
                      total_deputados: 0,
                      total_alertas: 0,
                      total_gasto: 0
                    }

                    const cor =
                      modoCor === 'RISCO'
                        ? obterCorCalor(info.media_risco_auditados, info.deputados_auditados)
                        : info.total_gasto > 0
                        ? '#2563eb'
                        : '#334155'

                    const isSelected = ufSelecionada === sigla
                    const isEnvolvidoRota =
                      rotaSelecionada &&
                      (rotaSelecionada.origem_uf === sigla || rotaSelecionada.destino_uf === sigla)

                    const raioBase =
                      modoCor === 'GASTO' && info.total_gasto > 0
                        ? 16 + Math.min(10, (info.total_gasto / maxGastoUf) * 10)
                        : info.deputados_auditados > 0
                        ? 19
                        : 15

                    return (
                      <g
                        key={sigla}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        onClick={() => setUfSelecionada(isSelected ? null : sigla)}
                        className="cursor-pointer transition-transform hover:scale-110"
                      >
                        {/* Halo pulsante para UFs da rota selecionada */}
                        {(isEnvolvidoRota || isSelected) && (
                          <circle
                            r={raioBase + 7}
                            fill="none"
                            stroke={isEnvolvidoRota ? '#ef4444' : '#38bdf8'}
                            strokeWidth="2.5"
                            strokeDasharray="3 3"
                          />
                        )}

                        <circle
                          r={raioBase}
                          fill={cor}
                          stroke={isSelected ? '#ffffff' : '#0f172a'}
                          strokeWidth={isSelected ? '3' : '2'}
                        />

                        <text
                          textAnchor="middle"
                          dy="4"
                          fill="#ffffff"
                          fontSize="11"
                          fontWeight="900"
                        >
                          {sigla}
                        </text>

                        {info.deputados_auditados > 0 && (
                          <text
                            textAnchor="middle"
                            dy={raioBase + 12}
                            fill="#94a3b8"
                            fontSize="9"
                            fontWeight="bold"
                          >
                            {info.media_risco_auditados} pts
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>

                {/* Legenda Flutuante no Canto Inferior */}
                <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-slate-300">Calor de Risco (UFs):</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-red-500" /> Crítico (≥65)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-orange-500" /> Alto (40-64)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-yellow-500" /> Médio (20-39)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-emerald-500" /> Baixo (&lt;20)
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <span className="w-3 h-3 rounded-full bg-slate-700" /> Pendente
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                    <button
                      onClick={() => setModoCor('RISCO')}
                      className={`px-2 py-0.5 rounded font-bold ${
                        modoCor === 'RISCO' ? 'bg-red-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      Risco
                    </button>
                    <button
                      onClick={() => setModoCor('GASTO')}
                      className={`px-2 py-0.5 rounded font-bold ${
                        modoCor === 'GASTO' ? 'bg-blue-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      Volume R$
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Resumo Rápido da UF clicada */}
            {ufSelecionada && ufMap[ufSelecionada] && (
              <div className="mt-4 bg-slate-900 border border-slate-700 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase text-blue-400">
                    Bancada Selecionada: {ufMap[ufSelecionada].nome_estado} ({ufSelecionada})
                  </span>
                  <p className="text-sm font-bold text-white mt-0.5">
                    {ufMap[ufSelecionada].deputados_auditados} de {ufMap[ufSelecionada].total_deputados} deputados auditados •{' '}
                    {ufMap[ufSelecionada].total_alertas} alertas emitidos
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Risco Médio Auditado</span>
                    <span className="text-lg font-black text-amber-400">
                      {ufMap[ufSelecionada].media_risco_auditados} pts
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Gasto Auditado na UF</span>
                    <span className="text-lg font-black text-emerald-400">
                      {formatarMoeda(ufMap[ufSelecionada].total_gasto)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: Inspetor de Evidência de Teletransporte + Lista de Rotas (5 colunas) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Card de Inspeção da Rota Ativa */}
            {rotaSelecionada ? (
              <div className="bg-white rounded-3xl border-2 border-red-200 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-6 h-6" />
                    <div>
                      <span className="text-[11px] uppercase font-extrabold tracking-wider text-red-100 block">
                        Incompatibilidade Espaço-Temporal
                      </span>
                      <h3 className="text-lg font-black">
                        {rotaSelecionada.origem_uf} ➔ {rotaSelecionada.destino_uf} ({rotaSelecionada.distancia_km} km no mesmo dia)
                      </h3>
                    </div>
                  </div>
                  <span className="bg-white/20 backdrop-blur px-3 py-1 rounded-full text-xs font-black">
                    {rotaSelecionada.data}
                  </span>
                </div>

                <div className="p-6 space-y-5">
                  {/* Parlamentar Responsável */}
                  <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-3">
                      <img
                        src={rotaSelecionada.url_foto}
                        alt={rotaSelecionada.deputado_nome}
                        className="w-12 h-12 rounded-full object-cover border border-slate-300"
                      />
                      <div>
                        <p className="font-black text-slate-900">{rotaSelecionada.deputado_nome}</p>
                        <p className="text-xs font-bold text-slate-500">
                          {rotaSelecionada.partido} - {rotaSelecionada.uf_deputado}
                        </p>
                      </div>
                    </div>
                    <Link
                      to={`/deputado/${rotaSelecionada.deputado_id}`}
                      className="text-xs font-bold bg-slate-900 text-white px-3.5 py-2 rounded-xl hover:bg-slate-800 transition-colors"
                    >
                      Abrir Dossiê &rarr;
                    </Link>
                  </div>

                  {/* Comparativo das 2 Notas Fiscais Presenciais Conflitantes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Nota 1: Ponto A */}
                    <div className="p-4 rounded-2xl bg-red-50/60 border border-red-200 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold text-red-700 mb-1">
                          <span>PONTO A ({rotaSelecionada.origem_uf})</span>
                          <span>{rotaSelecionada.data}</span>
                        </div>
                        <p className="text-xs font-black text-slate-900 line-clamp-2">
                          {rotaSelecionada.origem_fornecedor}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-1">
                          📍 {rotaSelecionada.origem_municipio} - {rotaSelecionada.origem_uf}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Categoria: {rotaSelecionada.origem_categoria}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-red-200/70 flex items-center justify-between">
                        <span className="font-black text-red-700 text-sm">
                          {formatarMoeda(rotaSelecionada.origem_valor)}
                        </span>
                        {rotaSelecionada.origem_url_documento ? (
                          <a
                            href={rotaSelecionada.origem_url_documento}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-2.5 py-1.5 rounded-lg shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5" /> PDF Nota A <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">Sem PDF online</span>
                        )}
                      </div>
                    </div>

                    {/* Nota 2: Ponto B */}
                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold text-amber-800 mb-1">
                          <span>PONTO B ({rotaSelecionada.destino_uf})</span>
                          <span>{rotaSelecionada.data}</span>
                        </div>
                        <p className="text-xs font-black text-slate-900 line-clamp-2">
                          {rotaSelecionada.destino_fornecedor}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-1">
                          📍 {rotaSelecionada.destino_municipio} - {rotaSelecionada.destino_uf}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Categoria: {rotaSelecionada.destino_categoria}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-amber-200/70 flex items-center justify-between">
                        <span className="font-black text-amber-800 text-sm">
                          {formatarMoeda(rotaSelecionada.destino_valor)}
                        </span>
                        {rotaSelecionada.destino_url_documento ? (
                          <a
                            href={rotaSelecionada.destino_url_documento}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-2.5 py-1.5 rounded-lg shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5" /> PDF Nota B <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">Sem PDF online</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-500">
                Selecione uma rota no mapa para inspecionar os comprovantes fiscais.
              </div>
            )}

            {/* Lista Completa de Rotas de Teletransporte */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Registro de Rotas de Teletransporte Detectadas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ordenadas pela maior distância física entre os fornecedores na mesma data
                  </p>
                </div>
                <span className="bg-red-100 text-red-700 font-black text-xs px-2.5 py-1 rounded-full">
                  {rotasFiltradas.length} ocorrências
                </span>
              </div>

              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {rotasFiltradas.map((r) => {
                  const ativa = rotaSelecionada?.id === r.id
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRotaSelecionada(r)}
                      className={`w-full text-left px-6 py-3.5 flex items-center justify-between transition-colors ${
                        ativa ? 'bg-red-50/90 border-l-4 border-red-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-0.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{r.deputado_nome}</span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {r.partido}-{r.uf_deputado}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Data: <strong>{r.data}</strong> • {r.origem_municipio}/{r.origem_uf} ➔ {r.destino_municipio}/{r.destino_uf}
                        </p>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="inline-block bg-red-100 text-red-700 font-black text-xs px-2.5 py-1 rounded-lg">
                          {r.distancia_km} km
                        </span>
                        <span className="block text-[11px] text-slate-500 font-semibold mt-1">
                          {formatarMoeda(r.valor_combinado)}
                        </span>
                      </div>
                    </button>
                  )
                })}
                {rotasFiltradas.length === 0 && (
                  <p className="p-8 text-center text-sm text-slate-500">
                    Nenhuma rota de teletransporte encontrada para o filtro selecionado.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ABA 2: MATRIZ DE CALOR DE PARTIDOS E BANCADAS ESTADUAIS */
        <div className="space-y-8">
          {/* Gráfico e Ranking por Partido Político */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-red-600" />
                  <h2 className="text-lg font-extrabold text-slate-900">
                    Mapa de Calor por Partido Político (Risco Médio Auditado)
                  </h2>
                </div>
                <span className="text-xs bg-red-50 text-red-700 font-bold px-2.5 py-1 rounded-full">
                  Por Legenda
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Comparativo da pontuação média de risco forense entre os partidos com parlamentares já auditados.
              </p>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(dadosMapa?.heatmap_partidos || []).filter(p => p.deputados_auditados > 0).slice(0, 12)}
                    layout="vertical"
                    margin={{ top: 5, right: 25, left: 10, bottom: 5 }}
                  >
                    <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                    <YAxis
                      type="category"
                      dataKey="partido"
                      stroke="#475569"
                      fontSize={12}
                      fontWeight="bold"
                      width={75}
                    />
                    <Tooltip
                      formatter={(val) => [`${val} pts`, 'Risco Médio (Auditados)']}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #cbd5e1' }}
                    />
                    <Bar dataKey="media_risco_auditados" radius={[0, 6, 6, 0]}>
                      {(dadosMapa?.heatmap_partidos || [])
                        .filter(p => p.deputados_auditados > 0)
                        .slice(0, 12)
                        .map((entry, idx) => (
                          <Cell
                            key={`cell-part-${idx}`}
                            fill={obterCorCalor(entry.media_risco_auditados, entry.deputados_auditados)}
                          />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela Completa de Partidos */}
            <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800 text-base">
                  Matriz Consolidada das Bancadas Partidárias
                </h3>
                <span className="text-xs text-slate-500 font-semibold">
                  {dadosMapa?.heatmap_partidos?.length || 0} partidos registrados
                </span>
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-xs uppercase">
                      <th className="py-3 px-4 font-bold">Partido</th>
                      <th className="py-3 px-4 font-bold text-center">Auditados / Bancada</th>
                      <th className="py-3 px-4 font-bold text-center">Alertas</th>
                      <th className="py-3 px-4 font-bold text-center">Risco Médio</th>
                      <th className="py-3 px-4 font-bold text-right">Volume Auditado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(dadosMapa?.heatmap_partidos || []).map((p) => (
                      <tr key={p.partido} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-black text-slate-900">{p.partido}</td>
                        <td className="py-3 px-4 text-center text-xs font-semibold text-slate-600">
                          {p.deputados_auditados} / {p.total_deputados}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {p.total_alertas}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className="font-black px-2.5 py-1 rounded-lg text-xs text-white"
                            style={{ backgroundColor: obterCorCalor(p.media_risco_auditados, p.deputados_auditados) }}
                          >
                            {p.media_risco_auditados.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800 text-xs">
                          {formatarMoeda(p.total_gasto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Grade de Calor dos 27 Estados (UFs) */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  Ranking das 27 Bancadas Estaduais (Unidades Federativas)
                </h3>
                <p className="text-xs text-slate-500">
                  Média de risco dos deputados auditados, total de alertas e volume financeiro inspecionado por estado.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {(dadosMapa?.heatmap_uf || []).map((u) => (
                <div
                  key={u.uf}
                  className="p-4 rounded-2xl border border-slate-200 hover:shadow-md transition-all flex flex-col justify-between bg-slate-50/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase">{u.uf}</span>
                      <h4 className="font-black text-slate-900 text-base">{u.nome_estado}</h4>
                    </div>
                    <span
                      className="px-2.5 py-1 rounded-xl text-xs font-black text-white shadow-sm"
                      style={{ backgroundColor: obterCorCalor(u.media_risco_auditados, u.deputados_auditados) }}
                    >
                      {u.media_risco_auditados.toFixed(1)} pts
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Deputados Auditados:</span>
                      <span className="font-bold text-slate-800">
                        {u.deputados_auditados} de {u.total_deputados}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Alertas Forenses:</span>
                      <span className="font-bold text-red-600">{u.total_alertas}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Volume Auditado:</span>
                      <span className="font-bold text-emerald-700">{formatarMoeda(u.total_gasto)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
