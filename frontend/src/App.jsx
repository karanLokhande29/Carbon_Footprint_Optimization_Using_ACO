import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Sidebar from './components/layout/Sidebar'
import Spinner from './components/common/Spinner'
import DashboardPage from './pages/DashboardPage'

const PredictPage   = lazy(() => import('./pages/PredictPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        {/* flex: sidebar (sticky, in-flow) + main (flex-1) — no margin matching required */}
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-x-hidden">
            <div className="max-w-[1400px] mx-auto p-6 lg:p-8">
              <Suspense fallback={<div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>}>
                <Routes>
                  <Route path="/"          element={<DashboardPage />} />
                  <Route path="/predict"   element={<PredictPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                </Routes>
              </Suspense>
            </div>
          </main>
        </div>
      </AppProvider>
    </BrowserRouter>
  )
}
