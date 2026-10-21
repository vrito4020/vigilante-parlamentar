import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import {
  Scale,
  ArrowLeftRight,
  ShieldAlert,
  Coins,
  Building2,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  FileSpreadsheet,
  Users
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts'
import { API_URL } from '../config'

const formatarMoeda = (val) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)

export default function Comparador() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [deputados, setDeputados] = useState([])
  const [dep1Id, setDep1Id] = useState('')
  const [dep2Id, setDep2Id] = useState('')
  const [dadosComparacao, setDadosComparacao] = useState(null)
  const [loading, setLoading] = useState(true)
  const [auditandoId, setAuditandoId] = useState(null)

  // Carrega a lista de deputados e escolhe automaticamente 2 já auditados caso não venham na URL
  useEffect(() => {
    axios.get(`${API_URL}/api/deputados`)
      .then(res => {
        const lista = res.data || []
        setDeputados(lista)

        const urlDep1 = searchParams.get('dep1')
        const urlDep2 = searchParams.get('dep2')

        // Deputados que já possuem índice de risco > 0 (já auditados)
        const comRisco = lista.filter(d => d.indice_risco > 0)
        const padrao1 = urlDep1 || (comRisco[0]?.id ?? lista[0]?.id)
        const padrao2 = urlDep2 || (comRisco.find(d => String(d.id) !== String(padrao1))?.id ?? lista[1]?.id)

        if (padrao1) setDep1Id(String(padrao1))
        if (padrao2) setDep2Id(String(padrao2))
      })
      .catch(err => {
        console.error('Erro ao buscar lista de deputados:', err)
        setLoading(false)
      })
  }, [])

  const carregarComparacao = (id1, id2) => {
    if (!id1 || !id2) return
    setLoading(true)
    axios.get(`${API_URL}/api/comparar?dep1=${id1}&dep2=${id2}`)
      .then(res => {
        setDadosComparacao(res.data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Erro ao comparar deputados:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    if (dep1Id && dep2Id) {
      setSearchParams({ dep1: dep1Id, dep2: dep2Id }, { replace: true })
      carregarComparacao(dep1Id, dep2Id)
    }
  }, [dep1Id, dep2Id])

  const executarAuditoriaIndividual = async (idAlvo) => {
    try {
      setAuditandoId(idAlvo)
      await axios.post(`${API_URL}/api/auditar/${idAlvo}`)
      carregarComparacao(dep1Id, dep2Id)
    } catch (e) {
      console.error('Erro ao auditar parlamentar:', e)
    } finally {
      setAuditandoId(null)
    }
  }

  const inverterPosicoes = () => {
    const temp = dep1Id
    setDep1Id(dep2Id)
    setDep2Id(temp)
  }

  const d1 = dadosComparacao?.dep1
  const d2 = dadosComparacao?.dep2

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Cabeçalho do Comparador */}
      <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl p-8 shadow-xl border border-slate-800">
        <div className="max-w-3xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold uppercase tracking-wider">
            <Scale className="w-3.5 h-3.5" /> Auditoria Comparativa 1x1
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Comparador Lado a Lado de Parlamentares
          </h1>
          <p className="text-slate-300 text-sm md:text-base">
            Confronte o Índice de Risco Forense, evolução mensal de gastos CEAP, categorias de despesas e descubra <strong>fornecedores em comum (mesmo CNPJ)</strong> contratados simultaneamente por dois deputados.
          </p>
        </div>

        {/* Barra de Seleção Dupla */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-11 gap-4 items-center bg-slate-900/90 p-4 rounded-2xl border border-slate-700">
          <div className="lg:col-span-5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-blue-400 mb-1">
              Parlamentar A (Linha Azul)
            </label>
            <select
              value={dep1Id}
              onChange={(e) => setDep1Id(e.target.value)}
              className="w-full bg-slate-800 border border-blue-500/50 text-white rounded-xl px-3.5 py-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500"
            >
              {deputados.map(d => (
                <option key={d.id} value={d.id}>
                  {d.nome} ({d.partido}-{d.uf}) {d.indice_risco > 0 ? `• [Risco: ${d.indice_risco.toFixed(1)}]` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1 flex justify-center">
            <button
              onClick={inverterPosicoes}
              title="Inverter Parlamentares"
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition-transform active:scale-95"
            >
              <ArrowLeftRight className="w-5 h-5" />
            </button>
          </div>

          <div className="lg:col-span-5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1">
              Parlamentar B (Linha Âmbar)
            </label>
            <select
              value={dep2Id}
              onChange={(e) => setDep2Id(e.target.value)}
              className="w-full bg-slate-800 border border-amber-500/50 text-white rounded-xl px-3.5 py-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500"
            >
              {deputados.map(d => (
                <option key={d.id} value={d.id}>
                  {d.nome} ({d.partido}-{d.uf}) {d.indice_risco > 0 ? `• [Risco: ${d.indice_risco.toFixed(1)}]` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {loading || !d1 || !d2 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 font-semibold">Cruzando histórico financeiro e fornecedores dos dois gabinetes...</p>
        </div>
      ) : (
        <>
          {/* Placar Frente a Frente (2 Cartões Espelhados) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[{ dep: d1, cor: 'blue', titulo: 'Parlamentar A' }, { dep: d2, cor: 'amber', titulo: 'Parlamentar B' }].map(
              ({ dep, cor, titulo }) => (
                <div
                  key={dep.id}
                  className={`bg-white rounded-3xl border-2 shadow-sm p-6 flex flex-col justify-between ${
                    cor === 'blue' ? 'border-blue-200' : 'border-amber-200'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-100">
                      <div className="flex items-center gap-4">
                        <img
                          src={dep.url_foto}
                          alt={dep.nome}
                          className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-200 shadow-sm"
                        />
                        <div>
                          <span
                            className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                              cor === 'blue'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {titulo}
                          </span>
                          <h2 className="text-xl font-black text-slate-900 mt-1">{dep.nome}</h2>
                          <p className="text-xs font-bold text-slate-500">
                            {dep.partido} - {dep.uf} • ID: {dep.id}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] font-bold text-slate-400 uppercase block">Índice de Risco</span>
                        <span
                          className={`text-3xl font-black ${
                            dep.indice_risco > 50
                              ? 'text-red-600'
                              : dep.indice_risco > 20
                              ? 'text-amber-500'
                              : 'text-emerald-600'
                          }`}
                        >
                          {dep.indice_risco.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Indicadores do Deputado */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="text-[11px] text-slate-500 font-semibold block">Total Gasto CEAP</span>
                        <span className="text-sm font-black text-slate-900">{formatarMoeda(dep.total_gasto)}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="text-[11px] text-slate-500 font-semibold block">Média Mensal</span>
                        <span className="text-sm font-black text-slate-900">{formatarMoeda(dep.media_mensal)}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="text-[11px] text-slate-500 font-semibold block">Notas Emitidas</span>
                        <span className="text-sm font-black text-slate-900">{dep.total_notas} docs</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="text-[11px] text-slate-500 font-semibold block">Alertas Ativos</span>
                        <span className="text-sm font-black text-red-600">{dep.total_alertas} alertas</span>
                      </div>
                    </div>

                    {/* Se ainda não foi auditado, exibe botão de auditoria rápida */}
                    {dep.total_notas === 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4 mb-4">
                        <div className="text-xs text-amber-900">
                          <strong>Gabinete ainda não auditado localmente.</strong> Clique ao lado para baixar as notas oficiais da Câmara agora.
                        </div>
                        <button
                          onClick={() => executarAuditoriaIndividual(dep.id)}
                          disabled={auditandoId === dep.id}
                          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${auditandoId === dep.id ? 'animate-spin' : ''}`} />
                          {auditandoId === dep.id ? 'Auditando...' : 'Auditar Agora'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Severidade: <strong className="text-red-600">{dep.alertas_por_severidade.ALTA} Alta</strong> •{' '}
                      <strong className="text-amber-600">{dep.alertas_por_severidade.MEDIA} Média</strong>
                    </span>
                    <Link
                      to={`/deputado/${dep.id}`}
                      className="font-bold text-blue-600 hover:underline"
                    >
                      Ver Dossiê Individual Completo &rarr;
                    </Link>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Gráficos Comparativos Sobrepostos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Evolução Mensal Sobreposta */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Evolução Mensal Comparada (Série Histórica)
                  </h3>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Confronto direto do ritmo de gastos mensais da Cota Parlamentar entre {d1.nome} e {d2.nome}.
              </p>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dadosComparacao.evolucao_conjunta} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mes_rotulo" stroke="#64748b" fontSize={11} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip formatter={(value) => formatarMoeda(value)} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="dep1_total"
                      name={d1.nome}
                      stroke="#2563eb"
                      fill="#3b82f6"
                      fillOpacity={0.25}
                      strokeWidth={2.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="dep2_total"
                      name={d2.nome}
                      stroke="#d97706"
                      fill="#f59e0b"
                      fillOpacity={0.25}
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gastos por Categoria Lado a Lado */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-amber-600" />
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Gastos por Categoria CEAP (Lado a Lado)
                  </h3>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Comparação de onde cada gabinete aloca a maior fatia dos recursos públicos.
              </p>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dadosComparacao.categorias_conjuntas.slice(0, 7)}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      stroke="#64748b"
                      fontSize={11}
                      tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      type="category"
                      dataKey="categoria"
                      stroke="#475569"
                      fontSize={11}
                      width={135}
                    />
                    <Tooltip formatter={(value) => formatarMoeda(value)} />
                    <Legend />
                    <Bar dataKey="dep1_total" name={d1.nome} fill="#2563eb" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="dep2_total" name={d2.nome} fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Seção Forense: Fornecedores em Comum (Mesmo CNPJ contratado por ambos) */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Building2 className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="text-lg font-black">
                    Cruzamento de Fornecedores em Comum (Mesmo CNPJ)
                  </h3>
                  <p className="text-xs text-slate-300">
                    Empresas que emitiram notas fiscais simultaneamente para <strong>{d1.nome}</strong> e <strong>{d2.nome}</strong>
                  </p>
                </div>
              </div>
              <span className="bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black px-3 py-1.5 rounded-full self-start sm:self-auto">
                {dadosComparacao.fornecedores_em_comum.length} CNPJs compartilhados
              </span>
            </div>

            {dadosComparacao.fornecedores_em_comum.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                      <th className="py-3.5 px-6 font-bold">Fornecedor / Razão Social</th>
                      <th className="py-3.5 px-4 font-bold">CNPJ / UF</th>
                      <th className="py-3.5 px-4 font-bold text-right text-blue-700">Pago por {d1.nome}</th>
                      <th className="py-3.5 px-4 font-bold text-right text-amber-700">Pago por {d2.nome}</th>
                      <th className="py-3.5 px-6 font-bold text-right">Volume Conjunto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dadosComparacao.fornecedores_em_comum.map((f) => (
                      <tr key={f.cnpj} className="hover:bg-slate-50">
                        <td className="py-3.5 px-6">
                          <p className="font-bold text-slate-900">{f.razao_social}</p>
                          {f.cnae && <p className="text-xs text-slate-400 truncate max-w-md">CNAE: {f.cnae}</p>}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                          {f.cnpj} {f.uf && <span className="font-sans font-bold text-slate-800">({f.uf})</span>}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-bold text-blue-700">{formatarMoeda(f.dep1_total)}</span>
                          <span className="block text-[11px] text-slate-400">{f.dep1_notas} notas</span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-bold text-amber-700">{formatarMoeda(f.dep2_total)}</span>
                          <span className="block text-[11px] text-slate-400">{f.dep2_notas} notas</span>
                        </td>
                        <td className="py-3.5 px-6 text-right font-black text-emerald-700">
                          {formatarMoeda(f.soma_conjunta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-sm">
                Nenhum CNPJ fornecedor em comum foi encontrado entre as notas auditadas destes dois parlamentares.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
