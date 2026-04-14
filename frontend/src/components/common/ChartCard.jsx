import { useRef } from 'react'
import { toPng } from 'html-to-image'
import { Download } from 'lucide-react'
import Card from '../common/Card'

export default function ChartCard({ title, children, className = '' }) {
  const ref = useRef(null)

  const exportPng = async () => {
    if (!ref.current) return
    try {
      const dataUrl = await toPng(ref.current, { backgroundColor: '#0f0f14', pixelRatio: 2 })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.png`
      a.click()
    } catch (e) {
      console.error('Export failed', e)
    }
  }

  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-800/40">
        <h3 className="text-xs font-bold text-gray-300 tracking-wider uppercase">{title}</h3>
        <button
          onClick={exportPng}
          title="Export as PNG"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-150"
        >
          <Download size={13} />
          PNG
        </button>
      </div>
      <div ref={ref} className="chart-export">
        {children}
      </div>
    </Card>
  )
}
