import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert, BookOpen, LayoutDashboard, MapPin, Scale } from 'lucide-react'

export default function Navbar() {
  const location = useLocation()

  return (
    <nav className="bg-slate-900 text-white shadow-md sticky top-0 z-50 border-b border-slate-800">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
          <ShieldAlert className="text-red-500 w-7 h-7" />
          <span>Vigilante<span className="text-blue-400 font-semibold">Parlamentar</span></span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium overflow-x-auto">
          <Link 
            to="/" 
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              location.pathname === '/' 
                ? 'bg-slate-800 text-white font-semibold' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-slate-400" />
            Painel Geral
          </Link>

          <Link 
            to="/mapa" 
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              location.pathname === '/mapa' 
                ? 'bg-red-600 text-white font-semibold shadow-sm' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <MapPin className="w-4 h-4 text-red-400" />
            Mapa Forense & Rotas
          </Link>

          <Link 
            to="/comparar" 
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              location.pathname === '/comparar' 
                ? 'bg-indigo-600 text-white font-semibold shadow-sm' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Scale className="w-4 h-4 text-indigo-300" />
            Comparador 1x1
          </Link>

          <Link 
            to="/metodologia" 
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              location.pathname === '/metodologia' 
                ? 'bg-blue-600 text-white font-semibold shadow-sm' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4 text-blue-300" />
            Metodologia
          </Link>
        </div>
      </div>
    </nav>
  )
}
