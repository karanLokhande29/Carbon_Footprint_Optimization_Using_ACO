const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json()).detail ?? detail } catch {}
    throw new Error(detail)
  }
  return res.json()
}

export const fetchHealth     = ()           => request('/health')
export const fetchLeaderboard = (params='') => request(`/leaderboard${params}`)
export const fetchCarbon      = ()           => request('/carbon')
export const fetchCarbonEpoch = (model)      => request(`/carbon/epoch/${model}`)
export const fetchAcoSummary  = ()           => request('/aco')
export const fetchAcoHistory  = ()           => request('/aco/history')
export const fetchPheromones  = ()           => request('/aco/pheromones')

export const fetchEfficiency  = ()           => request('/efficiency')

export async function postPredict(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE}/predict`, { method: 'POST', body: fd })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json()).detail ?? detail } catch {}
    throw new Error(detail)
  }
  return res.json()
}
