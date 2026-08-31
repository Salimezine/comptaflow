import { Routes, Route, Link, useLocation, useParams } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import Home from './pages/Home';
import DossierPage from './pages/DossierPage';
import BaudSocietes from './pages/baud/BaudSocietes';
import BaudDossierPage from './pages/baud/BaudDossierPage';

function DossierLayout() {
  const { id } = useParams();
  return <DossierPage />;
}

function BaudLayout() {
  const { id } = useParams();
  return <BaudDossierPage />;
}

export default function App() {
  const loc = useLocation();
  const isBaud = loc.pathname.startsWith('/baud');
  const isDossier = loc.pathname.startsWith('/dossier/');
  const isBaudDossier = loc.pathname.startsWith('/baud/dossier/');
  const isHome = loc.pathname === '/';

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-14">
          <Link to="/" className="flex items-center gap-2 mr-4">
            <span className="text-lg font-bold">EUREX</span>
          </Link>

          {isDossier && (
            <div className="flex gap-1 border-l pl-4">
              <Link to="/" className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700">
                ANIMALS
              </Link>
            </div>
          )}

          {(isBaud || isBaudDossier) && (
            <div className="flex gap-1 border-l pl-4">
              <Link to="/baud/societes" className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 text-purple-700">
                BAUD
              </Link>
            </div>
          )}
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
