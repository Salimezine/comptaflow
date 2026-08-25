import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, FolderOpen } from 'lucide-react';
import Home from './pages/Home';
import DossierPage from './pages/DossierPage';

export default function App() {
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span className="text-lg font-bold">EUREX</span>
          </Link>
          <div className="flex gap-1">
            <Link to="/" className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${loc.pathname === '/' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              <LayoutDashboard className="w-4 h-4" />Dossiers
            </Link>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dossier/:id" element={<DossierPage />} />
        </Routes>
      </main>
    </div>
  );
}
