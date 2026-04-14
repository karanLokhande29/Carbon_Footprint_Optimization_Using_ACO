import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
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

export default function ConfidenceBar({ predictions }) {
  const data = [...predictions]
    .sort((a, b) => b.top1_confidence - a.top1_confidence)
    .map(p => ({
      name: p.model,
      confidence: +(p.top1_confidence * 100).toFixed(1),
    }))

  return (
    <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
      <BarChart layout="vertical" data={data} margin={{ top: 5, right: 20, bottom: 5, left: 80 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={75} />
        <Tooltip
          formatter={v => [`${v}%`, 'Confidence']}
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px' }}
          labelStyle={{ color: '#f3f4f6' }}
        />
        <Bar dataKey="confidence" radius={[0, 6, 6, 0]}>
          {data.map(entry => (
            <Cell key={entry.name} fill={MODEL_COLORS[entry.name] ?? '#8888a0'} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
