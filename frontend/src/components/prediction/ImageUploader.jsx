import { useCallback, useRef } from 'react'
import { Upload, X } from 'lucide-react'
import { usePrediction } from '../../context/PredictionContext'

// Sample images — served from /public/images/ (Vite static, no CORS)
const SAMPLES = [
  { label: 'rose',      url: '/images/rose.jpg'      },
  { label: 'sunflower', url: '/images/sunflower.jpg'  },
  { label: 'dolphin',   url: '/images/dolphin.jpg'    },
  { label: 'bear',      url: '/images/bear.jpg'       },
  { label: 'rocket',    url: '/images/rocket.jpg'     },
  { label: 'mushroom',  url: '/images/mushroom.jpg'   },
  { label: 'bicycle',   url: '/images/bicycle.jpg'    },
  { label: 'castle',    url: '/images/castle.jpg'     },
]

export default function ImageUploader({ onPredict }) {
  const { state, dispatch } = usePrediction()
  const inputRef = useRef(null)

  const setFile = useCallback((file) => {
    if (!file) return
    const preview = URL.createObjectURL(file)
    dispatch({ type: 'SET_FILE', payload: { file, preview } })
  }, [dispatch])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) setFile(file)
  }, [setFile])

  const onInputChange = (e) => setFile(e.target.files[0])

  const onSampleClick = async (url, label) => {
    try {
      // Local /images/ files — fetch directly, no CORS
      const res  = await fetch(url)
      const blob = await res.blob()
      const file = new File([blob], `${label}.jpg`, { type: 'image/jpeg' })
      setFile(file)
    } catch (err) {
      console.error('Failed to load sample:', label, err)
    }
  }

  const clear = () => {
    dispatch({ type: 'RESET' })
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => !state.preview && inputRef.current?.click()}
        className={`relative rounded-3xl border-2 border-dashed transition-all duration-300 overflow-hidden
          ${state.preview
            ? 'border-transparent cursor-default shadow-lg shadow-black/50'
            : 'border-gray-700/80 bg-gray-900/40 hover:bg-gray-800/60 hover:border-cyan-500/60 cursor-pointer hover:shadow-[0_0_20px_rgba(56,189,248,0.15)] group'
          }`}
      >
        {state.preview ? (
          <div className="relative p-2 bg-gray-900/40">
            <img src={state.preview} alt="Preview" className="w-full max-h-64 object-contain rounded-2xl shadow-inner" />
            <button
              onClick={clear}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center hover:bg-red-500/40 hover:scale-110 active:scale-90 transition-all duration-200 text-red-200 shadow-lg backdrop-blur-sm"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="py-14 flex flex-col items-center gap-4 text-gray-500">
            <div className="w-14 h-14 rounded-2xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center group-hover:scale-110 group-hover:bg-cyan-500/10 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition-all duration-300 shadow-inner">
              <Upload size={24} className="transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-400 font-medium">Drag & drop image here or <span className="text-cyan-400">browse</span></p>
              <p className="text-[11px] mt-1.5 text-gray-600 font-mono tracking-wide uppercase">JPEG, PNG, BMP · Max 10MB</p>
            </div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={onInputChange} className="hidden" />
      </div>

      {/* Run button */}
      {state.preview && (
        <button
          onClick={onPredict}
          disabled={state.loading}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white text-sm font-bold tracking-wide
            hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] hover:scale-[1.01] active:scale-[0.98] disabled:hover:scale-100 disabled:opacity-40 transition-all duration-300 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
        >
          {state.loading ? (
            <><span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Running inference…</>
          ) : '🔬 Run Inference'}
        </button>
      )}

      {/* Sample gallery */}
      <div>
        <p className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">Sample Images</p>
        <div className="grid grid-cols-2 gap-2">
          {SAMPLES.map(s => (
            <button
              key={s.label}
              onClick={() => onSampleClick(s.url, s.label)}
              className={`group relative rounded-2xl overflow-hidden bg-gray-800 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/20 ${
                state.file?.name === `${s.label}.jpg`
                  ? 'ring-2 ring-cyan-400 shadow-[0_0_15px_rgba(56,189,248,0.4)]'
                  : 'hover:ring-2 hover:ring-cyan-500/50'
              }`}
              style={{ height: '84px' }}
            >
              <img
                src={s.url}
                alt={s.label}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
                onError={e => {
                  // Fallback: hide broken img, show gradient placeholder
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.parentElement.style.background =
                    'linear-gradient(135deg, #1e3a5f 0%, #0f2027 100%)'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-[2px]">
                <span className="text-[11px] text-white font-bold tracking-widest uppercase drop-shadow-sm transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">{s.label}</span>
              </div>
              {/* Always-visible label at bottom for fallback state */}
              <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-1 opacity-40 group-hover:opacity-0 transition-opacity pointer-events-none">
                <span className="text-[9px] text-gray-400 capitalize">{s.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
