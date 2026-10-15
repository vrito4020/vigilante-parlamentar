import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert, BookOpen, LayoutDashboard } from 'lucide-react'

export default function Navbar() {
  const location = useLocation()

  return (
    <nav className="bg-slate-900 text-white shadow-md sticky top-0 z-50 border-b border-slate-800">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
          <ShieldAlert className="text-red-500 w-7 h-7" />
          <span>Vigilante<span className="text-blue-400 font-semibold">Parlamentar</span></span>
        </Link>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link 
            to="/" 
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors ${
              location.pathname === '/' 
                ? 'bg-slate-800 text-white font-semibold' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-slate-400" />
            Painel Geral
          </Link>
          <Link 
            to="/metodologia" 
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors ${
              location.pathname === '/metodologia' 
                ? 'bg-blue-600 text-white font-semibold shadow-sm' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4 text-blue-300" />
            Metodologia & Definições
          </Link>
        </div>
      </div>
    </nav>
  )
}
