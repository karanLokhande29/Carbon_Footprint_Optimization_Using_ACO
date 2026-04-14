import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
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

export default function EmissionBarChart({ data }) {
  const chartData = [...data]
    .sort((a, b) => b.total_emission_kg - a.total_emission_kg)
    .map(d => ({
      name: d.model,
      emission: +d.total_emission_kg.toFixed(6),
    }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
        <YAxis
          tickFormatter={v => v.toExponential(1)}
          tick={{ fill: '#6b7280', fontSize: 11 }}
        />
        <Tooltip
          formatter={(v) => [v.toExponential(4) + ' kg', 'CO₂']}
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px' }}
          labelStyle={{ color: '#f3f4f6' }}
        />
        <Bar dataKey="emission" radius={[6, 6, 0, 0]}>
          {chartData.map(entry => (
            <Cell key={entry.name} fill={MODEL_COLORS[entry.name] ?? '#8888a0'} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
