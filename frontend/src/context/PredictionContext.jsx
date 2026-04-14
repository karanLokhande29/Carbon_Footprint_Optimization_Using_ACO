import { createContext, useContext, useReducer } from 'react'

const Ctx = createContext(null)

const init = { file: null, preview: null, results: null, loading: false, error: null }

function reducer(s, a) {
  switch (a.type) {
    case 'SET_FILE':    return { ...s, file: a.payload.file, preview: a.payload.preview, results: null, error: null }
    case 'LOADING':     return { ...s, loading: true, error: null }
    case 'RESULTS':     return { ...s, results: a.payload, loading: false }
    case 'ERROR':       return { ...s, error: a.payload, loading: false }
    case 'RESET':       return init
    default:            return s
  }
}

export function PredictionProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init)
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export const usePrediction = () => useContext(Ctx)
