import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip,
} from 'recharts'

const AXES = [
  { key: 'test_acc1',          label: 'Accuracy',  scale: v => v * 100 },
  { key: 'f1_macro',           label: 'F1',        scale: v => v * 100 },
  { key: 'green_score',        label: 'Green',     scale: v => Math.min(v / 100, 100) },
  { key: 'inference_latency_ms',label:'Speed',     scale: v => Math.max(0, 100 - v * 200) },
  { key: 'total_emission_kg',  label: 'Low CO₂',  scale: v => Math.max(0, 100 - v * 1000) },
]

const COLORS = ['#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#f87171', '#fb923c', '#818cf8']

export default function ModelRadar({ data }) {
  if (!data?.length) return null

  const radarData = AXES.map(ax => {
    const point = { subject: ax.label }
    data.forEach(m => { point[m.model] = +(ax.scale(m[ax.key] ?? 0)).toFixed(1) })
    return point
  })

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={radarData} outerRadius={90}>
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 9 }} />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px' }}
          labelStyle={{ color: '#f3f4f6', fontSize: 11 }}
        />
        {data.map((m, i) => (
          <Radar
            key={m.model}
            name={m.model}
            dataKey={m.model}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.12}
            strokeWidth={1.5}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
