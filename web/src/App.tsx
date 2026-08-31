import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, FolderOpen, Users, Upload, FileCheck, FileOutput } from 'lucide-react';
import Home from './pages/Home';
import DossierPage from './pages/DossierPage';
import BaudSocietes from './pages/baud/BaudSocietes';
import BaudDossierPage from './pages/baud/BaudDossierPage';

const eurexNav = [
  { to: '/', label: 'Dossiers', icon: LayoutDashboard },
];

const baudNav = [
  { to: '/baud/societes', label: 'Societes', icon: Users },
];

export default function App() {
  const loc = useLocation();
  const isBaud = loc.pathname.startsWith('/baud');
  const nav = isBaud ? baudNav : eurexNav;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-600" />
              <span className="text-lg font-bold">EUREX</span>
            </Link>
            <div className="flex gap-1 border-l pl-4">
              <Link to="/" className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!isBaud ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                ANIMALS
              </Link>
              <Link to="/baud/societes" className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isBaud ? 'bg-purple-50 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                BAUD
              </Link>
            </div>
          </div>
          <div className="flex gap-1">
            {nav.map(n => {
              const Icon = n.icon;
              const active = loc.pathname === n.to || (n.to !== '/' && n.to !== '/baud/societes' && loc.pathname.startsWith(n.to));
              return (
                <Link key={n.to} to={n.to}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active ? (isBaud ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700') : 'text-gray-600 hover:bg-gray-100'}`}>
                  <Icon className="w-4 h-4" />{n.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dossier/:id" element={<DossierPage />} />
          <Route path="/baud/societes" element={<BaudSocietes />} />
          <Route path="/baud/dossier/:id" element={<BaudDossierPage />} />
        </Routes>
      </main>
    </div>
  );
}
