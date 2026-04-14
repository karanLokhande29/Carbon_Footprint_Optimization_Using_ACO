export default function Spinner({ size = 'md' }) {
  const s = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }[size]
  return (
    <div className="flex items-center justify-center">
      <div className={`${s} border-2 border-gray-700 border-t-cyan-400 rounded-full animate-spin`} />
    </div>
  )
}
