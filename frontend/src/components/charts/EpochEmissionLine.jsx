import {
  LineChart, Line, Area, AreaChart, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

export default function EpochEmissionLine({ data, model }) {
  if (!data?.epochs?.length) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No epoch data</div>
  )

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data.epochs} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
        <defs>
          <linearGradient id="epochGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="epoch" tick={{ fill: '#6b7280', fontSize: 11 }} label={{ value: 'Epoch', position: 'insideBottom', offset: -5, fill: '#6b7280', fontSize: 11 }} />
        <YAxis tickFormatter={v => v.toExponential(1)} tick={{ fill: '#6b7280', fontSize: 11 }} />
        <Tooltip
          formatter={v => [v.toExponential(4) + ' kg', 'CO₂']}
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px' }}
          labelStyle={{ color: '#f3f4f6' }}
          labelFormatter={l => `Epoch ${l}`}
        />
        <Area type="monotone" dataKey="emission_kg" stroke="#38bdf8" fill="url(#epochGrad)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
