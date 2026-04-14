import ModelPredictionCard from './ModelPredictionCard'
import ConfidenceBar from '../charts/ConfidenceBar'
import ChartCard from '../common/ChartCard'
import { Clock, Trophy } from 'lucide-react'
import { useEfficiency } from '../../hooks/useEfficiency'

export default function PredictionResults({ results }) {
  if (!results) return null
  const { predictions, best_overall_model, best_dl_model, total_latency_ms } = results

  // Fetch efficiency data to enrich prediction cards
  const { models: effModels, summary: effSummary } = useEfficiency()

  const dlPreds  = predictions.filter(p => p.type === 'deep_learning')
  const clPreds  = predictions.filter(p => p.type === 'classical')

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="glass rounded-2xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Trophy size={18} className="text-amber-400" />
          <div>
            <p className="text-xs text-gray-500">Best Overall</p>
            <p className="text-sm font-semibold text-white font-mono">{best_overall_model}</p>
          </div>
        </div>
        <div className="h-6 w-px bg-gray-700 hidden sm:block" />
        <div>
          <p className="text-xs text-gray-500">Best DL</p>
          <p className="text-sm font-semibold text-cyan-400 font-mono">{best_dl_model}</p>
        </div>
        <div className="h-6 w-px bg-gray-700 hidden sm:block" />
        <div className="flex items-center gap-2 text-gray-400">
          <Clock size={14} />
          <span className="text-sm">{total_latency_ms.toFixed(1)} ms total</span>
        </div>
      </div>

      {/* Confidence comparison */}
      <ChartCard title="Model Confidence Comparison">
        <ConfidenceBar predictions={predictions} />
      </ChartCard>

      {/* DL Models */}
      <div>
        <p className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">Deep Learning Models</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {dlPreds.map(p => (
            <ModelPredictionCard
              key={p.model}
              prediction={p}
              isBest={p.model === best_overall_model}
              efficiencyData={effModels}
              efficiencySummary={effSummary}
            />
          ))}
        </div>
      </div>

      {/* Classical Models */}
      <div>
        <p className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">Classical ML Models</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {clPreds.map(p => (
            <ModelPredictionCard
              key={p.model}
              prediction={p}
              isBest={p.model === best_overall_model}
              efficiencyData={effModels}
              efficiencySummary={effSummary}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
