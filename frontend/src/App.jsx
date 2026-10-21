import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import DeputadoProfile from './pages/DeputadoProfile'
import Metodologia from './pages/Metodologia'
import MapaForense from './pages/MapaForense'
import Comparador from './pages/Comparador'
import Navbar from './components/Navbar'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar />
        <main className="flex-grow container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/deputado/:id" element={<DeputadoProfile />} />
            <Route path="/mapa" element={<MapaForense />} />
            <Route path="/comparar" element={<Comparador />} />
            <Route path="/metodologia" element={<Metodologia />} />
          </Routes>
        </main>
        <footer className="bg-slate-800 text-slate-400 py-6 mt-12 text-center text-sm border-t border-slate-700">
          <p className="max-w-3xl mx-auto px-4">
            <strong className="text-slate-200">Aviso Legal:</strong> Os alertas gerados representam anomalias estatísticas e inconsistências em bases públicas oficiais, não configurando condenação jurídica.
          </p>
        </footer>
      </div>
    </Router>
  )
}

export default App
