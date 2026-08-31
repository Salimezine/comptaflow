import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { FolderOpen, Plus, Trash2, FileText, Users } from 'lucide-react';

export default function Home() {
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [nom, setNom] = useState('');

  const load = async () => {
    try {
      const d = await api.dashboard();
      setDossiers(d.recentDossiers || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createDossier = async () => {
    if (!nom.trim()) return;
    try {
      const s = await api.getSocietes();
      if (!s.length) return;
      const d = await api.createDossier(s[0].id, { nom: nom.trim() });
      setDossiers([d, ...dossiers]);
      setNom(''); setShowNew(false);
    } catch {}
  };

  const deleteDossier = async (id: string) => {
    if (!confirm('Supprimer ce dossier ?')) return;
    await api.deleteDossier(id);
    setDossiers(dossiers.filter(d => d.id !== id));
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Dossiers</h2>
        <button onClick={() => setShowNew(!showNew)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">+ Nouveau</button>
      </div>

      {showNew && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <input placeholder="Nom du dossier" value={nom} onChange={e => setNom(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
          <button onClick={createDossier} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">Creer</button>
        </div>
      )}

      {dossiers.length === 0 && (
        <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">
          Aucun dossier. Cliquez "+ Nouveau" pour creer.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {dossiers.map((d: any) => (
          <Link key={d.id} to={`/dossier/${d.id}`}
            className="bg-white border rounded-lg p-4 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FolderOpen size={20} className="text-blue-500" />
                <span className="font-medium">{d.nom || 'Dossier'}</span>
              </div>
              <button onClick={(e) => { e.preventDefault(); deleteDossier(d.id); }}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity">
                <Trash2 size={14} />
              </button>
            </div>
            <p className="text-xs text-gray-400">{d.raison_sociale || ''}</p>
            <p className="text-xs text-gray-400 mt-1">{new Date(d.created_at).toLocaleDateString('fr-FR')}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
