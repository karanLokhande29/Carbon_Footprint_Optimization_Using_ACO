import { Leaf, Trophy, Scale, Zap } from 'lucide-react'

const INSIGHT_CONFIG = {
  best_accuracy: {
    icon: Trophy,
    emoji: '🏆',
    title: 'Best Accuracy',
    color: 'amber',
    narrative: (m, v) =>
      `${m} achieves the highest accuracy at ${v}, but comes with a higher carbon footprint due to deep learning training costs.`,
  },
  most_efficient: {
    icon: Leaf,
    emoji: '🌱',
    title: 'Most Efficient',
    color: 'emerald',
    narrative: (m, v) =>
      `${m} produces the lowest emissions (green score: ${v}), making it the most environmentally sustainable choice despite lower raw accuracy.`,
  },
  best_tradeoff: {
    icon: Scale,
    emoji: '⚖️',
    title: 'Best Tradeoff',
    color: 'purple',
    narrative: (m, v) =>
      `${m} balances accuracy and carbon cost most effectively with an efficiency score of ${v}.`,
  },
  fastest: {
    icon: Zap,
    emoji: '⚡',
    title: 'Fastest',
    color: 'cyan',
    narrative: (m, v) =>
      `${m} has the lowest inference latency at ${v}, ideal for real-time deployment scenarios.`,
  },
}

const COLOR_MAP = {
  amber:   { border: 'border-amber-500/30',   bg: 'bg-amber-500/5',   glow: 'shadow-amber-500/10',   icon: 'text-amber-400',   dot: 'bg-amber-400' },
  emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', glow: 'shadow-emerald-500/10', icon: 'text-emerald-400', dot: 'bg-emerald-400' },
  purple:  { border: 'border-purple-500/30',  bg: 'bg-purple-500/5',  glow: 'shadow-purple-500/10',  icon: 'text-purple-400',  dot: 'bg-purple-400' },
  cyan:    { border: 'border-cyan-500/30',    bg: 'bg-cyan-500/5',    glow: 'shadow-cyan-500/10',    icon: 'text-cyan-400',    dot: 'bg-cyan-400' },
}

export default function InsightsPanel({ summary }) {
  if (!summary) return null

  const keys = ['best_accuracy', 'most_efficient', 'best_tradeoff', 'fastest']
  const insights = keys
    .filter(k => summary[k])
    .map(k => {
      const cfg = INSIGHT_CONFIG[k]
      const s   = summary[k]
      return { key: k, ...cfg, model: s.model, value: s.value, detail: s.detail }
    })

  if (!insights.length) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {insights.map(ins => {
        const c = COLOR_MAP[ins.color]
        const Icon = ins.icon
        return (
          <div
            key={ins.key}
            className={`glass rounded-2xl p-4 border ${c.border} ${c.bg} shadow-lg ${c.glow}
              transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl group`}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${c.bg} border ${c.border} group-hover:scale-110 transition-transform duration-300`}>
                <Icon size={16} className={c.icon} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{ins.title}</p>
                <p className="text-sm font-bold text-white font-mono">{ins.model}</p>
              </div>
            </div>

            {/* Value pill */}
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${c.bg} border ${c.border} mb-3`}>
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
              <span className={`text-xs font-semibold ${c.icon}`}>{ins.value}</span>
            </div>

            {/* Narrative */}
            <p className="text-[11px] text-gray-400 leading-relaxed">
              {ins.narrative(ins.model, ins.value)}
            </p>
          </div>
        )
      })}
    </div>
  )
}
