import { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Play, Pause, RotateCcw } from 'lucide-react'

export default function AcoConvergenceLine({ data }) {
  const [visibleData, setVisibleData] = useState([])
  const [isPlaying, setIsPlaying] = useState(true)

  const chartData = useMemo(() => {
    if (!data?.history?.length) return []
    return data.history.map(h => ({
      iter: h.iteration,
      fitness: +h.best_fitness.toFixed(4),
      rho: +h.rho_adaptive.toFixed(4),
      model: h.best_model,
    }))
  }, [data])

  useEffect(() => {
    if (!chartData.length) return

    let i = visibleData.length
    let interval

    if (isPlaying && i < chartData.length) {
      interval = setInterval(() => {
        setVisibleData(chartData.slice(0, i + 1))
        i++
        if (i >= chartData.length) {
          clearInterval(interval)
          setIsPlaying(false)
        }
      }, 120) // smooth speed
    }

    return () => clearInterval(interval)
  }, [isPlaying, chartData, visibleData.length])

  // Reset if data changes
  useEffect(() => {
    setVisibleData([])
    setIsPlaying(true)
  }, [data])

  if (!chartData.length) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No ACO history</div>
  )

  const handlePlayPause = () => {
    if (visibleData.length >= chartData.length) {
      // Replay from start
      setVisibleData([])
      setIsPlaying(true)
    } else {
      setIsPlaying(!isPlaying)
    }
  }

  const handleReset = () => {
    setVisibleData([])
    setIsPlaying(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 pr-4 relative z-10 -mb-8">
        <button
          onClick={handlePlayPause}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-cyan-400 border border-gray-700 hover:border-cyan-500/30 transition-all bg-gray-800/40 hover:bg-cyan-500/10 backdrop-blur-sm"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          {isPlaying ? 'Pause' : visibleData.length >= chartData.length ? 'Replay' : 'Play'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-cyan-400 border border-gray-700 hover:border-cyan-500/30 transition-all bg-gray-800/40 hover:bg-cyan-500/10 backdrop-blur-sm"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>
      
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={visibleData} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          {/* Ensure X-Axis has fixed domain so it doesn't jump as data loads */}
          <XAxis 
            dataKey="iter" 
            type="number"
            domain={[1, chartData.length]} 
            tick={{ fill: '#6b7280', fontSize: 11 }} 
            label={{ value: 'Iteration', position: 'insideBottom', offset: -5, fill: '#6b7280', fontSize: 11 }} 
          />
          <YAxis 
            yAxisId="left"  
            tick={{ fill: '#6b7280', fontSize: 11 }} 
            domain={['auto', 'auto']} 
            tickFormatter={v => v.toFixed(3)} 
          />
          <YAxis 
            yAxisId="right" 
            orientation="right" 
            tick={{ fill: '#6b7280', fontSize: 11 }} 
            domain={[0, 1]} 
            tickFormatter={v => v.toFixed(2)} 
          />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px' }}
            labelStyle={{ color: '#f3f4f6' }}
            labelFormatter={l => `Iteration ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
          <Line 
            yAxisId="left"  
            type="monotone" 
            dataKey="fitness" 
            stroke="#a78bfa" 
            strokeWidth={2} 
            dot={{ r: 3, fill: '#a78bfa' }} 
            name="Best Fitness" 
            animationDuration={300}
            isAnimationActive={true}
          />
          <Line 
            yAxisId="right" 
            type="monotone" 
            dataKey="rho"     
            stroke="#fbbf24" 
            strokeWidth={1.5} 
            dot={false} 
            strokeDasharray="4 2" 
            name="ρ Adaptive" 
            animationDuration={300}
            isAnimationActive={true}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
