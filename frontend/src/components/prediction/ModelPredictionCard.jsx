import Badge from '../common/Badge'

const MODEL_COLORS = {
  resnet50:        '#38bdf8',
  efficientnet_b3: '#818cf8',
  vit_tiny:        '#a78bfa',
  svm:             '#fbbf24',
  rf:              '#fb923c',
  xgboost:         '#f87171',
  logreg:          '#34d399',
}

const BADGE_MAP = {
  best_accuracy:   { emoji: '🏆', label: 'Best Accuracy',   color: 'text-amber-400  bg-amber-500/10  border-amber-500/30' },
  most_efficient:  { emoji: '🌱', label: 'Most Efficient',  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  best_tradeoff:   { emoji: '⚖️', label: 'Best Tradeoff',   color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  fastest:         { emoji: '⚡', label: 'Fastest',          color: 'text-cyan-400   bg-cyan-500/10   border-cyan-500/30' },
}

export default function ModelPredictionCard({ prediction, isBest, efficiencyData, efficiencySummary }) {
  const { model, type, predicted_class, top1_confidence, top5_classes, top5_confidences, latency_ms, reliability } = prediction
  const color = MODEL_COLORS[model] ?? '#8888a0'

  // Find matching efficiency entry for this model
  const eff = efficiencyData?.find(m => m.name === model)

  // Determine which badges this model earns
  const badges = []
  if (efficiencySummary) {
    for (const [key, info] of Object.entries(efficiencySummary)) {
      if (info.model === model && BADGE_MAP[key]) {
        badges.push(BADGE_MAP[key])
      }
    }
  }

  return (
    <div
      className={`glass rounded-2xl p-4 space-y-3 transition-all duration-200 hover:-translate-y-0.5
        ${isBest ? 'ring-2 ring-cyan-500/40 shadow-lg shadow-cyan-500/10' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-sm font-semibold text-white font-mono truncate">{model}</span>
            {isBest && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-semibold flex-shrink-0">BEST</span>}
          </div>
          <Badge type={type} />
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-white leading-none mb-1" style={{ color }}>{(top1_confidence * 100).toFixed(1)}%</p>
          <p className="text-[10px] text-gray-500 font-mono inline-block bg-gray-800/40 px-1.5 py-0.5 rounded-md">{latency_ms.toFixed(1)} ms</p>
        </div>
      </div>

      {/* Predicted class */}
      <p className="text-sm text-gray-300 capitalize font-medium truncate pt-1 bg-gradient-to-r from-gray-800/20 to-transparent p-2 rounded-lg">{predicted_class?.replace(/_/g, ' ')}</p>

      {/* Efficiency badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map(b => (
            <span key={b.label} className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${b.color}`}>
              {b.emoji} {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Reliability label */}
      {reliability && reliability !== 'Unknown' && (
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-medium ${
            reliability === 'High' ? 'text-emerald-400' : reliability === 'Medium' ? 'text-amber-400' : 'text-red-400'
          }`}>
            {reliability === 'High' ? '●' : reliability === 'Medium' ? '●' : '●'} {reliability} confidence
          </span>
        </div>
      )}

      {/* Green + Efficiency scores */}
      {eff && (
        <div className="flex items-center gap-3 pt-1 border-t border-gray-800/40">
          <span className="text-[10px] text-emerald-400/70">🌱 Green: {eff.green_score?.toFixed(1)}</span>
          <span className="text-[10px] text-purple-400/70">⚡ Efficiency: {eff.efficiency_score?.toFixed(4)}</span>
        </div>
      )}

      {/* Top-5 breakdown (DL only) */}
      {top5_classes?.length > 1 && (
        <div className="space-y-1.5">
          {top5_classes.slice(0, 5).map((cls, i) => (
            <div key={cls} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 w-4 text-right">{i + 1}</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(top5_confidences[i] * 100).toFixed(1)}%`, background: color, opacity: 1 - i * 0.15 }}
                />
              </div>
              <span className="text-[10px] text-gray-400 capitalize w-20 truncate">{cls.replace(/_/g, ' ')}</span>
              <span className="text-[10px] text-gray-500 w-10 text-right">{(top5_confidences[i] * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
