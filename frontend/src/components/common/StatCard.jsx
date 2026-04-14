export default function StatCard({ icon: Icon, label, value, sub, color = 'cyan' }) {
  const colors = {
    cyan:   'text-cyan-400 bg-cyan-500/10 shadow-cyan-500/10 border-cyan-500/20',
    amber:  'text-amber-400 bg-amber-500/10 shadow-amber-500/10 border-amber-500/20',
    emerald:'text-emerald-400 bg-emerald-500/10 shadow-emerald-500/10 border-emerald-500/20',
    purple: 'text-purple-400 bg-purple-500/10 shadow-purple-500/10 border-purple-500/20',
  }
  return (
    <div className="glass rounded-3xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-4 transition-all duration-300 transform hover:-translate-y-1 hover:border-gray-700/80 hover:shadow-2xl hover:shadow-cyan-900/15 group text-center sm:text-left">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-inner border ${colors[color].split(' ').pop()} ${colors[color].replace(/border-[^\s]+/, '')}`}>
        <Icon size={22} className={colors[color].split(' ')[0]} />
      </div>
      <div>
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed mb-1">{label}</p>
        <p className="text-3xl font-extrabold text-white leading-tight tracking-tight">{value}</p>
        {sub && <p className="text-[11px] text-gray-500 mt-2 font-medium bg-gray-800/60 border border-gray-700/50 inline-block px-2.5 py-1 rounded-md">{sub}</p>}
      </div>
    </div>
  )
}
