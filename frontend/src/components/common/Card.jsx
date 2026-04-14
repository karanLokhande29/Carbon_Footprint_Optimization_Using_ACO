export default function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`glass rounded-3xl p-6 md:p-7 transition-all duration-300 hover:border-gray-700/80 hover:shadow-xl hover:shadow-cyan-900/10 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
