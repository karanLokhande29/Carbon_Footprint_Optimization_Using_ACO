import { useCallback } from 'react'
import { Download } from 'lucide-react'
import Badge from '../common/Badge'
import { useApp } from '../../context/AppContext'

const SORT_FIELDS = [
  { key: 'rank',                label: 'Rank'      },
  { key: 'test_acc1',          label: 'Accuracy'  },
  { key: 'f1_macro',           label: 'F1'        },
  { key: 'green_score',        label: 'Green'     },
  { key: 'efficiency_score',   label: 'Efficiency'},
  { key: 'total_emission_kg',  label: 'CO₂'       },
  { key: 'model_size_mb',      label: 'Size'      },
  { key: 'inference_latency_ms',label:'Latency'   },
]

function fmt(v, key) {
  if (v === null || v === undefined) return '—'
  if (key === 'test_acc1' || key === 'f1_macro') return `${(v * 100).toFixed(1)}%`
  if (key === 'total_emission_kg') return v < 0.001 ? v.toExponential(2) : v.toFixed(4)
  if (key === 'inference_latency_ms') return `${v.toFixed(2)} ms`
  if (key === 'model_size_mb') return `${v} MB`
  if (key === 'green_score') return v.toFixed(1)
  if (key === 'efficiency_score') return v.toFixed(4)
  return v
}

export default function LeaderboardTable({ data, sortBy, onSort, efficiencyData, efficiencySummary }) {
  const exportCsv = useCallback(() => {
    if (!data?.length) return
    const cols = ['rank','model','type','test_acc1','test_acc5','f1_macro','green_score','efficiency_score','total_emission_kg','model_size_mb','inference_latency_ms']
    const header = cols.join(',')
    const rows = data.map(row => cols.map(c => row[c] ?? '').join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'leaderboard.csv'
    a.click()
  }, [data])

  if (!data?.length) return <div className="text-center py-12 text-gray-600 text-sm">No data</div>

  // Build a lookup from efficiency data for each model
  const effMap = {}
  if (efficiencyData) {
    for (const m of efficiencyData) {
      effMap[m.name] = m
    }
  }

  // Find highlighted model names
  const tradeoffModel  = efficiencySummary?.best_tradeoff?.model
  const efficientModel = efficiencySummary?.most_efficient?.model

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all border border-gray-700 hover:border-cyan-500/30"
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {[
                { key: 'rank', label: '#' },
                { key: 'model', label: 'Model' },
                { key: 'test_acc1', label: 'Accuracy' },
                { key: 'f1_macro', label: 'F1' },
                { key: 'green_score', label: 'Green Score' },
                { key: 'efficiency_score', label: 'Efficiency' },
                { key: 'total_emission_kg', label: 'CO₂ (kg)' },
                { key: 'model_size_mb', label: 'Size' },
                { key: 'inference_latency_ms', label: 'Latency' },
              ].map(col => (
                <th
                  key={col.key}
                  onClick={() => onSort?.(col.key)}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider select-none cursor-pointer hover:text-gray-300 transition-colors ${sortBy === col.key ? 'text-cyan-400' : ''}`}
                >
                  {col.label} {sortBy === col.key && '↑'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const eff = effMap[row.model]
              const isTradeoff  = row.model === tradeoffModel
              const isEfficient = row.model === efficientModel

              // Row highlight: purple for tradeoff, emerald for efficient, cyan for rank #1
              let rowBg = ''
              if (isTradeoff)       rowBg = 'bg-purple-500/5 border-l-2 border-l-purple-500/40'
              else if (isEfficient) rowBg = 'bg-emerald-500/5 border-l-2 border-l-emerald-500/40'
              else if (i === 0)     rowBg = 'bg-cyan-500/5'

              return (
                <tr
                  key={row.model}
                  className={`border-b border-gray-800/50 transition-colors hover:bg-gray-800/30 ${rowBg}`}
                >
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{row.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white font-mono text-xs">{row.model}</span>
                      <Badge type={row.type} />
                      {isTradeoff && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-semibold border border-purple-500/30">⚖️ Tradeoff</span>}
                      {isEfficient && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">🌱 Efficient</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-cyan-400">{fmt(row.test_acc1, 'test_acc1')}</td>
                  <td className="px-4 py-3 text-gray-300">{fmt(row.f1_macro, 'f1_macro')}</td>
                  <td className="px-4 py-3 text-emerald-400">{fmt(row.green_score, 'green_score')}</td>
                  <td className="px-4 py-3 text-purple-400 font-mono text-xs">{fmt(eff?.efficiency_score, 'efficiency_score')}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{fmt(row.total_emission_kg, 'total_emission_kg')}</td>
                  <td className="px-4 py-3 text-gray-400">{fmt(row.model_size_mb, 'model_size_mb')}</td>
                  <td className="px-4 py-3 text-gray-400">{fmt(row.inference_latency_ms, 'inference_latency_ms')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
