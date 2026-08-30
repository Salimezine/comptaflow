import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';

export default function BaudSocietes() {
  const [societes, setSocietes] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [nom, setNom] = useState('');
  const [newMois, setNewMois] = useState(new Date().getMonth() + 1);
  const [newAnnee, setNewAnnee] = useState(new Date().getFullYear());

  useEffect(() => { api.baud.getSocietes().then(setSocietes).catch(() => {}); }, []);
  useEffect(() => { if (selectedId) api.baud.getDossiers(selectedId).then(setDossiers).catch(() => {}); }, [selectedId]);

  const createSociete = async () => {
    if (!nom.trim()) return;
    const s = await api.baud.createSociete({ nom: nom.trim() });
    setSocietes([...societes, s]);
    setNom(''); setShowNew(false);
  };

  const createDossier = async () => {
    if (!selectedId) return;
    try {
      const d = await api.baud.createDossier(selectedId, { mois: newMois, annee: newAnnee });
      setDossiers([d, ...dossiers]);
    } catch {}
  };

  const deleteSociete = async (id: string) => {
    if (!confirm('Supprimer cette societe ?')) return;
    await api.baud.deleteSociete(id);
    setSocietes(societes.filter(s => s.id !== id));
    if (selectedId === id) { setSelectedId(null); setDossiers([]); }
  };

  const selected = societes.find(s => s.id === selectedId);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Societes Paie</h2>
        <button onClick={() => setShowNew(!showNew)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">+ Nouvelle</button>
      </div>

      {showNew && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <input placeholder="Nom de la societe" value={nom} onChange={e => setNom(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
          <button onClick={createSociete} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">Creer</button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {/* List */}
        <div className="col-span-1 bg-white border rounded-lg p-3 space-y-1">
          <p className="text-xs text-gray-500 mb-2">Liste</p>
          {societes.map(s => (
            <div key={s.id} className="flex items-center justify-between group">
              <button onClick={() => setSelectedId(s.id)}
                className={`flex-1 text-left px-3 py-2 rounded text-sm ${selectedId === s.id ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}>
                {s.nom}
              </button>
              <button onClick={() => deleteSociete(s.id)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 px-1 transition-opacity">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="col-span-3 space-y-4">
          {selected && (
            <>
              <div className="bg-white border rounded-lg p-4">
                <h3 className="font-medium mb-1">{selected.nom}</h3>
                <p className="text-xs text-gray-400">Les salaries et rubriques sont extraites automatiquement lors de l'upload de la fiche navette.</p>
              </div>

              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-sm">Dossiers ({dossiers.length})</h4>
                  <div className="flex gap-2 items-end">
                    <select value={newMois} onChange={e => setNewMois(Number(e.target.value))} className="border rounded px-2 py-1 text-xs">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                    </select>
                    <select value={newAnnee} onChange={e => setNewAnnee(Number(e.target.value))} className="border rounded px-2 py-1 text-xs">
                      {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button onClick={createDossier}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1">
                      <Plus size={12} />Nouveau
                    </button>
                  </div>
                </div>
                {dossiers.length === 0 && <p className="text-xs text-gray-400">Aucun dossier</p>}
                <div className="divide-y">
                  {dossiers.map((d: any) => (
                    <Link key={d.id} to={`/baud/dossier/${d.id}`}
                      className="flex items-center justify-between py-2 hover:bg-gray-50 px-2 rounded">
                      <div className="flex items-center gap-2">
                        <FolderOpen size={16} className="text-blue-500" />
                        <span className="text-sm font-medium">{String(d.mois).padStart(2, '0')}/{d.annee}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${d.statut === 'valide' ? 'bg-green-100 text-green-700' : d.statut === 'controle' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {d.statut}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{d.fichier_navette_nom || '—'}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
          {!selected && <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">Selectionnez une societe</div>}
        </div>
      </div>
    </div>
  );
}
