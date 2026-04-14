import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine, ReferenceDot,
} from 'recharts'

const MODEL_COLORS = {
  resnet50:        '#38bdf8',
  efficientnet_b3: '#818cf8',
  vit_tiny:        '#a78bfa',
  svm:             '#fbbf24',
  rf:              '#fb923c',
  xgboost:         '#f87171',
  logreg:          '#34d399',
}

// ── Quadrant label overlay —————————————————————————————————————————————————
// Rendered as an absolutely-positioned SVG layer on top of the Recharts canvas.
// Positions are expressed as percentages of the plot area so they never
// interfere with axes or data points.
const QUADRANT_LABELS = [
  {
    x: '28%',  y: '10%',
    text: ['High Accuracy', 'Low CO₂'],
    sub:  '✦ Optimal',
    fill: '#34d399', subFill: '#34d399',
    align: 'start',
  },
  {
    x: '72%',  y: '10%',
    text: ['High Accuracy', 'High CO₂'],
    sub:  null,
    fill: '#f87171', subFill: null,
    align: 'end',
  },
  {
    x: '28%',  y: '72%',
    text: ['Low Accuracy', 'Low CO₂'],
    sub:  null,
    fill: '#6b7280', subFill: null,
    align: 'start',
  },
  {
    x: '72%',  y: '72%',
    text: ['Low Accuracy', 'High CO₂'],
    sub:  '✦ Worst',
    fill: '#ef4444', subFill: '#ef4444',
    align: 'end',
  },
]

// ── Custom tooltip ————————————————————————————————————————————————————————
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="glass rounded-xl p-3 text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold text-white">{d.model}</p>
      <p className="text-gray-400">Accuracy: <span className="text-cyan-400">{(d.x * 100).toFixed(1)}%</span></p>
      <p className="text-gray-400">CO₂: <span className="text-emerald-400">{d.y.toExponential(2)} kg</span></p>
      <p className="text-gray-400">Size: {d.z} MB</p>
      {d.efficiency_score != null && (
        <p className="text-gray-400">Efficiency: <span className="text-purple-400">{d.efficiency_score.toFixed(4)}</span></p>
      )}
      {d.green_score != null && (
        <p className="text-gray-400">Green Score: <span className="text-emerald-400">{d.green_score.toFixed(1)}</span></p>
      )}
    </div>
  )
}

// ── "Best Balance" label that floats next to a ReferenceDot ——————————————
const BestBalanceLabel = ({ viewBox }) => {
  if (!viewBox) return null
  const { cx, cy } = viewBox
  return (
    <g>
      {/* Arrow shaft */}
      <line
        x1={cx + 14} y1={cy - 14}
        x2={cx + 38} y2={cy - 38}
        stroke="#fbbf24" strokeWidth={1.5}
        strokeDasharray="3 2"
      />
      {/* Arrow head */}
      <polygon
        points={`${cx+14},${cy-14} ${cx+21},${cy-11} ${cx+17},${cy-20}`}
        fill="#fbbf24"
      />
      {/* Label pill */}
      <rect x={cx + 38} y={cy - 54} width={80} height={20} rx={5} fill="#92400e" opacity={0.7} />
      <text
        x={cx + 78} y={cy - 40}
        textAnchor="middle"
        fontSize={10}
        fontWeight="700"
        fill="#fbbf24"
        fontFamily="monospace"
      >
        Best Balance
      </text>
    </g>
  )
}

// ── Main component ————————————————————————————————————————————————————————
export default function AccuracyEmissionScatter({ data, efficiencySummary }) {
  const tradeoffModel  = efficiencySummary?.best_tradeoff?.model
  const efficientModel = efficiencySummary?.most_efficient?.model

  const chartData = useMemo(() => data.map(d => ({
    x: d.test_acc1,
    y: d.total_emission_kg,
    z: d.model_size_mb,
    model: d.model,
    type: d.type,
    green_score: d.green_score,
    efficiency_score: d.efficiency_score ?? null,
  })), [data])

  // Compute midpoints for quadrant dividers
  const xs = chartData.map(d => d.x)
  const ys = chartData.map(d => d.y)
  const xMid = (Math.min(...xs) + Math.max(...xs)) / 2
  const yMid = (Math.min(...ys) + Math.max(...ys)) / 2

  // Find the tradeoff dot's coordinates for the annotation
  const tradeoffDot = chartData.find(d => d.model === tradeoffModel)

  return (
    <div className="space-y-3">
      {/* Chart with quadrant overlay ——————————————————————————— */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />

            <XAxis
              dataKey="x"
              name="Test Accuracy"
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              type="number"
              domain={['auto', 'auto']}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              label={{ value: 'Test Accuracy', position: 'insideBottom', offset: -10, fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              dataKey="y"
              name="CO₂ (kg)"
              tickFormatter={v => v.toExponential(1)}
              type="number"
              domain={['auto', 'auto']}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              label={{ value: 'CO₂ (kg)', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }}
            />

            {/* Quadrant dividers */}
            <ReferenceLine
              x={xMid}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <ReferenceLine
              y={yMid}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />

            {/* "Best Balance" annotation dot + arrow label */}
            {tradeoffDot && (
              <ReferenceDot
                x={tradeoffDot.x}
                y={tradeoffDot.y}
                r={0}
                label={<BestBalanceLabel />}
              />
            )}

            <Tooltip content={<CustomTooltip />} />

            <Scatter data={chartData}>
              {chartData.map((entry) => {
                const isTradeoff  = entry.model === tradeoffModel
                const isEfficient = entry.model === efficientModel
                return (
                  <Cell
                    key={entry.model}
                    fill={MODEL_COLORS[entry.model] ?? '#8888a0'}
                    fillOpacity={0.9}
                    r={Math.max(6, Math.min(20, entry.z / 10))}
                    stroke={isTradeoff ? '#c084fc' : isEfficient ? '#34d399' : 'none'}
                    strokeWidth={isTradeoff || isEfficient ? 3 : 0}
                  />
                )
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        {/* Quadrant labels — absolutely overlaid, pointer-events: none */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {/* Top-left: High Acc, Low CO2 — Optimal */}
          <div className="absolute top-[8%] left-[14%]">
            <p className="text-[9px] font-bold text-emerald-500/60 leading-tight">High Accuracy</p>
            <p className="text-[9px] font-bold text-emerald-500/60 leading-tight">Low CO₂</p>
            <p className="text-[9px] text-emerald-400/80 font-semibold mt-0.5">✦ Optimal</p>
          </div>
          {/* Top-right: High Acc, High CO2 */}
          <div className="absolute top-[8%] right-[6%] text-right">
            <p className="text-[9px] font-bold text-amber-500/50 leading-tight">High Accuracy</p>
            <p className="text-[9px] font-bold text-amber-500/50 leading-tight">High CO₂</p>
          </div>
          {/* Bottom-left: Low Acc, Low CO2 */}
          <div className="absolute bottom-[22%] left-[14%]">
            <p className="text-[9px] font-bold text-gray-600 leading-tight">Low Accuracy</p>
            <p className="text-[9px] font-bold text-gray-600 leading-tight">Low CO₂</p>
          </div>
          {/* Bottom-right: Low Acc, High CO2 — Worst */}
          <div className="absolute bottom-[22%] right-[6%] text-right">
            <p className="text-[9px] font-bold text-red-500/50 leading-tight">Low Accuracy</p>
            <p className="text-[9px] font-bold text-red-500/50 leading-tight">High CO₂</p>
            <p className="text-[9px] text-red-400/70 font-semibold mt-0.5">✦ Worst</p>
          </div>
        </div>
      </div>

      {/* Custom legend ——————————————————————————————————————————— */}
      <div className="flex items-center justify-center gap-6 pb-1">
        <div className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="5" fill="transparent" stroke="#c084fc" strokeWidth="2.5" />
            <circle cx="8" cy="8" r="2.5" fill="#c084fc" opacity="0.7" />
          </svg>
          <span className="text-[10px] text-purple-400/80 font-medium">Best Tradeoff ring</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="5" fill="transparent" stroke="#34d399" strokeWidth="2.5" />
            <circle cx="8" cy="8" r="2.5" fill="#34d399" opacity="0.7" />
          </svg>
          <span className="text-[10px] text-emerald-400/80 font-medium">Most Efficient ring</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <line x1="2" y1="8" x2="14" y2="8" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="3 2" />
          </svg>
          <span className="text-[10px] text-gray-500 font-medium">Quadrant midpoint</span>
        </div>
      </div>
    </div>
  )
}
