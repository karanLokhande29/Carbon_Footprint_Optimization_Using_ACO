import { useState, useMemo } from 'react'
import { Cpu, Leaf, Zap, BarChart2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useEfficiency } from '../hooks/useEfficiency'
import StatCard from '../components/common/StatCard'
import ChartCard from '../components/common/ChartCard'
import AccuracyEmissionScatter from '../components/charts/AccuracyEmissionScatter'
import ModelRadar from '../components/charts/ModelRadar'
import LeaderboardTable from '../components/leaderboard/LeaderboardTable'
import InsightsPanel from '../components/insights/InsightsPanel'
import Spinner from '../components/common/Spinner'
import ErrorBanner from '../components/common/ErrorBanner'

export default function DashboardPage() {
  const { state } = useApp()
  const { leaderboard: data, lbLoading, lbError } = state
  const { models: effModels, summary: effSummary } = useEfficiency()
  const [sortBy, setSortBy] = useState('rank')
  const [typeFilter, setTypeFilter] = useState('all')

  const sorted = useMemo(() => {
    let rows = [...(data ?? [])]
    if (typeFilter !== 'all') rows = rows.filter(r => r.type === typeFilter)
    rows.sort((a, b) => {
      const va = a[sortBy], vb = b[sortBy]
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      return sortBy === 'rank' ? va - vb : vb - va
    })
    return rows
  }, [data, sortBy, typeFilter])

  const topModel = data?.[0]
  const totalCO2 = data?.reduce((s, d) => s + d.total_emission_kg, 0) ?? 0
  const maxGreen = data ? Math.max(...data.map(d => d.green_score)) : 0

  if (lbLoading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  if (lbError)   return <ErrorBanner message={lbError} />

  return (
    <div className="space-y-12">
      <div className="mb-8 pl-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">Dashboard</h1>
        <p className="text-[11px] text-cyan-500/80 mt-2 font-mono tracking-wider uppercase">Carbon-aware CIFAR-100 model comparison</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
        <StatCard icon={Cpu}    label="Models Trained"  value={data?.length ?? 0}                           color="cyan"    />
        <StatCard icon={BarChart2} label="Best Accuracy" value={topModel ? `${(topModel.test_acc1*100).toFixed(1)}%` : '—'} sub={topModel?.model} color="purple"  />
        <StatCard icon={Leaf}   label="Total CO₂ (kg)"  value={totalCO2.toFixed(4)}                         color="emerald" />
        <StatCard icon={Zap}    label="Best Green Score" value={maxGreen.toFixed(0)}                          color="amber"   />
      </div>

      {/* Insight Narratives */}
      {effSummary && <InsightsPanel summary={effSummary} />}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Accuracy vs Carbon Footprint">
          <AccuracyEmissionScatter data={data} efficiencySummary={effSummary} />
        </ChartCard>
        <ChartCard title="Multi-Metric Radar">
          <ModelRadar data={data} />
        </ChartCard>
      </div>

      {/* Leaderboard */}
      <div className="glass rounded-3xl p-6 md:p-7 shadow-xl shadow-cyan-900/5">
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-gray-800/60 flex-wrap gap-4">
          <h3 className="text-sm font-bold text-gray-200 tracking-wide uppercase">Model Leaderboard</h3>
          <div className="flex gap-2 p-1 bg-gray-900/50 rounded-xl border border-gray-800/80 shadow-inner">
            {['all', 'deep_learning', 'classical'].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold hover:scale-105 active:scale-95 transition-all duration-300 ${
                  typeFilter === t
                    ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(56,189,248,0.15)]'
                    : 'text-gray-500 hover:text-gray-300 border border-transparent hover:bg-gray-800/60'
                }`}
              >
                {t === 'all' ? 'All' : t === 'deep_learning' ? 'Deep Learning' : 'Classical ML'}
              </button>
            ))}
          </div>
        </div>
        <LeaderboardTable
          data={sorted}
          sortBy={sortBy}
          onSort={setSortBy}
          efficiencyData={effModels}
          efficiencySummary={effSummary}
        />
      </div>
    </div>
  )
}
