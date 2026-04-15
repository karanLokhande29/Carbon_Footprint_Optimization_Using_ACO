import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import {
  fetchCarbon, fetchCarbonEpoch,
  fetchAcoSummary, fetchAcoHistory, fetchPheromones,
} from '../api/client'
import ChartCard from '../components/common/ChartCard'
import Card from '../components/common/Card'
import StatCard from '../components/common/StatCard'
import EmissionBarChart from '../components/charts/EmissionBarChart'
import EpochEmissionLine from '../components/charts/EpochEmissionLine'
import AcoConvergenceLine from '../components/charts/AcoConvergenceLine'
import PheromoneHeatmap from '../components/charts/PheromoneHeatmap'
import Spinner from '../components/common/Spinner'
import ErrorBanner from '../components/common/ErrorBanner'
import { Leaf, Cpu, TrendingDown, Settings } from 'lucide-react'

const DL_MODELS = ['resnet50', 'efficientnet_b3', 'vit_tiny']
const TABS = ['Carbon Emissions', 'ACO Optimization']

// ── Carbon Tab ──────────────────────────────────────────────────────────────

function CarbonTab() {
  const [epochModel, setEpochModel] = useState('vit_tiny')
  const carbon = useApi(fetchCarbon)
  const epoch  = useApi(() => fetchCarbonEpoch(epochModel), [epochModel])

  if (carbon.loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  if (carbon.error)   return <ErrorBanner message={carbon.error} />

  const summary = carbon.data
  const byModel = summary?.by_model ?? []
  const byType  = summary?.by_type  ?? {}
  const tableRows = [...byModel].sort((a, b) => b.total_emission_kg - a.total_emission_kg)

  return (
    <div className="space-y-10">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
        <StatCard icon={Leaf}        label="Total CO₂"          value={summary?.total_emission_kg_all?.toFixed(4) + ' kg'} color="emerald" />
        <StatCard icon={Cpu}         label="Deep Learning CO₂"  value={(byType.deep_learning ?? 0).toFixed(4) + ' kg'}     color="cyan"    />
        <StatCard icon={TrendingDown} label="Classical ML CO₂"   value={(byType.classical ?? 0).toFixed(6) + ' kg'}         color="amber"   />
      </div>

      {/* Bar chart */}
      <ChartCard title="CO₂ Emissions by Model">
        {/* Adapt from by_model to match the leaderboard shape expected by EmissionBarChart */}
        <EmissionBarChart data={tableRows.map(r => ({ model: r.model_name, total_emission_kg: r.total_emission_kg, type: '' }))} />
      </ChartCard>

      {/* Epoch line */}
      <div className="glass rounded-3xl p-6 md:p-7 shadow-xl shadow-cyan-900/5">
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-gray-800/60 flex-wrap gap-4">
          <h3 className="text-sm font-bold text-gray-200 tracking-wide uppercase">Per-Epoch Emissions</h3>
          <div className="flex gap-2 p-1 bg-gray-900/50 rounded-xl border border-gray-800/80 shadow-inner">
            {DL_MODELS.map(m => (
              <button
                key={m}
                onClick={() => setEpochModel(m)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold hover:scale-105 active:scale-95 transition-all duration-300 ${
                  epochModel === m
                    ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(56,189,248,0.15)]'
                    : 'text-gray-500 hover:text-gray-300 border border-transparent hover:bg-gray-800/60'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          {epoch.loading ? <div className="flex justify-center py-8"><Spinner /></div> :
           epoch.error   ? <ErrorBanner message={epoch.error} /> :
           <EpochEmissionLine data={epoch.data} model={epochModel} />}
        </div>
      </div>

      {/* Emission table */}
      <Card>
        <div className="mb-6 pb-3 border-b border-gray-800/60 flex justify-between items-center">
          <h3 className="text-xs font-bold text-gray-300 tracking-wider uppercase">Emission Detail by Model</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-3 py-2 text-left text-gray-500 font-medium">Model</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">Total CO₂ (kg)</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">Runs</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">Avg Duration (s)</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(r => (
                <tr key={r.model_name} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="px-3 py-2 font-mono text-gray-300">{r.model_name}</td>
                  <td className="px-3 py-2 text-right text-emerald-400">{r.total_emission_kg.toExponential(4)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{r.run_count}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{r.avg_duration_s?.toFixed(1) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ── ACO Tab ──────────────────────────────────────────────────────────────────

function AcoTab() {
  const acoSummary  = useApi(fetchAcoSummary)
  const acoHistory  = useApi(fetchAcoHistory)
  const pheromones  = useApi(fetchPheromones)

  if (acoSummary.loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  if (acoSummary.error)   return <ErrorBanner message={acoSummary.error} />

  const s = acoSummary.data
  const bc = s?.best_config

  return (
    <div className="space-y-10">
      {/* KPI */}
      {bc && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          <StatCard icon={Settings}    label="Best Model"     value={bc.model}                          color="purple"  />
          <StatCard icon={TrendingDown} label="Final Fitness"  value={bc.fitness?.toFixed(4)}            color="cyan"    />
          <StatCard icon={Leaf}        label="ACO CO₂ (kg)"   value={bc.aco_emission_kg?.toFixed(6)}    color="emerald" />
        </div>
      )}

      {/* Best config card */}
      {bc && (
        <Card>
          <div className="mb-6 pb-3 border-b border-gray-800/60">
            <h3 className="text-xs font-bold text-gray-300 tracking-wider uppercase">Best Hyperparameter Config</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Model',         value: bc.model },
              { label: 'Learning Rate', value: bc.lr },
              { label: 'Weight Decay',  value: bc.weight_decay },
              { label: 'Epochs',        value: bc.epochs },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800/40 hover:bg-gray-700/40 transition-colors duration-300 rounded-2xl p-4 text-center border border-gray-700/30 shadow-inner">
                <p className="text-[10px] text-cyan-500/80 uppercase tracking-widest font-bold mb-1">{label}</p>
                <p className="text-base font-semibold text-gray-100 font-mono tracking-tight">{value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Convergence chart */}
      <ChartCard title="ACO Convergence — Fitness & ρ Adaptive">
        {acoHistory.loading ? <div className="flex justify-center py-8"><Spinner /></div> :
         acoHistory.error   ? <ErrorBanner message={acoHistory.error} /> :
         <AcoConvergenceLine data={acoHistory.data} />}
      </ChartCard>

      {/* Pheromone heatmap */}
      <Card>
        <div className="mb-6 pb-3 border-b border-gray-800/60">
          <h3 className="text-xs font-bold text-gray-300 tracking-wider uppercase">Final Pheromone State</h3>
        </div>
        {pheromones.loading ? <div className="flex justify-center py-6"><Spinner /></div> :
         pheromones.error   ? <ErrorBanner message={pheromones.error} /> :
         <PheromoneHeatmap data={pheromones.data} />}
      </Card>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [tab, setTab] = useState(0)
  return (
    <div className="space-y-6">
      <div className="mb-8 pl-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">Analytics</h1>
        <p className="text-[11px] text-cyan-500/80 mt-2 font-mono tracking-wider uppercase">Carbon emissions and ACO optimization results</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-gray-900/50 rounded-2xl border border-gray-800/80 shadow-inner w-fit mb-4">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold hover:-translate-y-0.5 active:scale-95 active:translate-y-0 transition-all duration-300 ${
              tab === i
                ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(56,189,248,0.15)]'
                : 'text-gray-500 hover:text-gray-300 border border-transparent hover:bg-gray-800/60'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 ? <CarbonTab /> : <AcoTab />}
    </div>
  )
}
