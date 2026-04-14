import { useCallback } from 'react'
import { PredictionProvider, usePrediction } from '../context/PredictionContext'
import { postPredict } from '../api/client'
import { useEfficiency } from '../hooks/useEfficiency'
import ImageUploader from '../components/prediction/ImageUploader'
import PredictionResults from '../components/prediction/PredictionResults'
import ErrorBanner from '../components/common/ErrorBanner'
import Spinner from '../components/common/Spinner'
import { Scale } from 'lucide-react'

function PredictInner() {
  const { state, dispatch } = usePrediction()
  const { summary } = useEfficiency()
  const rec = summary?.best_tradeoff

  const runInference = useCallback(async () => {
    if (!state.file) return
    dispatch({ type: 'LOADING' })
    try {
      const results = await postPredict(state.file)
      dispatch({ type: 'RESULTS', payload: results })
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e.message })
    }
  }, [state.file, dispatch])

  return (
    <div className="space-y-6">
      <div className="mb-4 pl-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">Predict</h1>
        <p className="text-[11px] text-cyan-500/80 mt-2 font-mono tracking-wider uppercase">Upload an image or select a sample — all 7 models classify simultaneously</p>
      </div>

      {/* Recommendation banner — data-driven from backend summary.best_tradeoff */}
      {rec && (
        <div className="
          flex items-center gap-4 px-5 py-3.5 rounded-2xl
          bg-gradient-to-r from-purple-500/10 to-cyan-500/5
          border border-purple-500/30
          shadow-[0_0_20px_rgba(168,85,247,0.08)]
          transition-all duration-300
        ">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
            <Scale size={17} className="text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-purple-400/70 uppercase tracking-widest font-bold">Recommended Model</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 font-semibold font-mono">
                {rec.model}
              </span>
              <span className="text-[10px] text-gray-500 font-mono">efficiency: {rec.value}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Provides best balance between accuracy and carbon efficiency across all {7} trained models.
            </p>
          </div>
          <div className="hidden sm:block w-1.5 h-10 rounded-full bg-gradient-to-b from-purple-500 to-cyan-500 opacity-40 flex-shrink-0" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Left panel — upload + gallery */}
        <div className="glass rounded-2xl p-5">
          <ImageUploader onPredict={runInference} />
        </div>

        {/* Right panel — results */}
        <div className="min-w-0">
          {state.loading && (
            <div className="glass rounded-2xl p-12 flex flex-col items-center gap-4 text-gray-500">
              <Spinner size="lg" />
              <p className="text-sm">Running inference across 7 models…</p>
            </div>
          )}
          {state.error && !state.loading && (
            <div className="space-y-3">
              <ErrorBanner message={state.error} />
              <p className="text-xs text-gray-600 text-center">Make sure the backend is running on port 8000</p>
            </div>
          )}
          {state.results && !state.loading && (
            <PredictionResults results={state.results} />
          )}
          {!state.loading && !state.results && !state.error && (
            <div className="glass rounded-2xl p-12 flex items-center justify-center text-gray-600 text-sm">
              Select or upload an image to begin
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PredictPage() {
  return (
    <PredictionProvider>
      <PredictInner />
    </PredictionProvider>
  )
}
