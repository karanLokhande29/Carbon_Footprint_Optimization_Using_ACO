// Pheromone heatmap
const DIMS = ['tau_model', 'tau_lr', 'tau_wd', 'tau_ep']
const DIM_LABELS = {
  tau_model: { label: 'Model Importance',          items: ['resnet50','efficientnet_b3','vit_tiny','svm','rf','xgboost','logreg'] },
  tau_lr:    { label: 'Learning Rate Preference',  items: ['1e-4','5e-4','1e-3','5e-3'] },
  tau_wd:    { label: 'Weight Decay Preference',   items: ['1e-5','1e-4','1e-3'] },
  tau_ep:    { label: 'Epoch Preference',          items: ['50','75','100'] },
}

function normalize(arr) {
  const mn = Math.min(...arr), mx = Math.max(...arr)
  return mn === mx ? arr.map(() => 0.5) : arr.map(v => (v - mn) / (mx - mn))
}

function cellColor(norm) {
  // low → dark / muted
  // medium → soft blue
  // high → bright cyan
  // Base off the user's requested rgba(0, 200, 255, intensity) format
  const intensity = 0.05 + (norm * 0.45) // clamp so it isn't completely invisible or violently opaque
  return `rgba(0, 200, 255, ${intensity})`
}

function borderColor(norm) {
  const intensity = 0.1 + (norm * 0.4)
  return `rgba(0, 200, 255, ${intensity})`
}

export default function PheromoneHeatmap({ data }) {
  if (!data?.pheromones) return <div className="h-40 flex items-center justify-center text-gray-600 text-sm">No pheromone data</div>

  const ph = data.pheromones

  return (
    <div className="space-y-6">
      {DIMS.map(dim => {
        const values = ph[dim] ?? []
        const norms  = normalize(values)
        const meta   = DIM_LABELS[dim]

        return (
          <div key={dim}>
            <p className="text-xs text-gray-400 mb-3 font-semibold tracking-wide uppercase">{meta.label}</p>
            <div 
              className="grid gap-2.5" 
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))' }}
            >
              {values.map((v, i) => (
                <div
                  key={i}
                  className={`group relative flex flex-col items-center justify-center p-3 rounded-xl cursor-default 
                    transition-all duration-200 ease-in-out hover:scale-[1.03] 
                    ${norms[i] === 1 
                      ? 'ring-1 ring-cyan-400/60 shadow-[0_0_20px_rgba(0,200,255,0.25)]' 
                      : 'hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-950/20'
                    }`}
                  style={{
                    background: cellColor(norms[i]),
                    border: `1px solid ${borderColor(norms[i])}`,
                    minHeight: '64px',
                  }}
                >
                  <span className={`text-[11px] font-bold leading-tight mb-1 text-center transition-colors duration-200 ${norms[i] > 0.6 ? 'text-white' : 'text-gray-300'}`}>
                    {meta.items[i] ?? i}
                  </span>
                  <span className={`text-[10px] font-mono leading-none transition-colors duration-200 ${norms[i] > 0.6 ? 'text-cyan-100' : 'text-gray-500'}`}>
                    {v.toFixed(3)}
                  </span>

                  {/* Glass Tooltip */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-gray-900/95 border border-white/10 backdrop-blur-md rounded-lg text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-2xl z-30 scale-95 group-hover:scale-100 origin-bottom">
                    <span className="text-cyan-400 font-bold">pheromone weight:</span> {v.toFixed(4)}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-4 border-x-transparent border-t-4 border-t-gray-900/95" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
