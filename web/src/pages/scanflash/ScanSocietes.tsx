import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Building2, FolderOpen } from 'lucide-react';
import { api } from '../../lib/api';

export default function ScanSocietes() {
  const [societes, setSocietes] = useState<any[]>([]);
  const [dossiersBySoc, setDossiersBySoc] = useState<Record<string, any[]>>({});
  const [newNom, setNewNom] = useState('');
  const [newMF, setNewMF] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newDossierMonth, setNewDossierMonth] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const socs = await api.scan.getSocietes();
    setSocietes(socs);
    const dd: Record<string, any[]> = {};
    for (const s of socs) {
      dd[s.id] = await api.scan.getDossiers(s.id);
    }
    setDossiersBySoc(dd);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newNom.trim()) return;
    setCreating(true);
    await api.scan.createSociete({ raison_sociale: newNom.trim(), matricule_fiscal: newMF.trim() || null });
    setNewNom(''); setNewMF('');
    await load();
    setCreating(false);
  };

  const handleDeleteSoc = async (id: string) => {
    if (!confirm('Supprimer cette societe et tous ses dossiers?')) return;
    await api.scan.deleteSociete(id);
    await load();
  };

  const handleCreateDossier = async (sid: string) => {
    const val = newDossierMonth[sid] || '';
    if (!val) return;
    const [m, y] = val.split('/').map(Number);
    await api.scan.createDossier(sid, { mois: m, annee: y, nom: `SCAN ${m}/${y}` });
    setNewDossierMonth(prev => ({ ...prev, [sid]: '' }));
    await load();
  };

  const handleDeleteDossier = async (did: string) => {
    if (!confirm('Supprimer ce dossier et toutes ses factures/ecritures?')) return;
    await api.scan.deleteDossier(did);
    await load();
  };

  const currentMonth = () => {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 size={28} className="text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-800">SCANFLASH — Societes</h1>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h2 className="font-semibold text-gray-700 mb-3">Nouvelle societe</h2>
        <div className="flex gap-3 items-end">
          <input value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Raison sociale" className="flex-1 border rounded px-3 py-2 text-sm" />
          <input value={newMF} onChange={e => setNewMF(e.target.value)} placeholder="Matricule fiscal" className="w-48 border rounded px-3 py-2 text-sm" />
          <button onClick={handleCreate} disabled={creating || !newNom.trim()} className="bg-emerald-600 text-white px-4 py-2 rounded text-sm hover:bg-emerald-700 disabled:opacity-50">
            <Plus size={16} className="inline mr-1" /> Ajouter
          </button>
        </div>
      </div>

      {loading ? <div className="text-gray-400">Chargement...</div> : societes.length === 0 ? (
        <div className="text-center text-gray-400 py-10">Aucune societe</div>
      ) : societes.map(s => (
        <div key={s.id} className="bg-white rounded-lg border">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-lg">
            <div>
              <span className="font-semibold text-gray-800">{s.raison_sociale}</span>
              {s.matricule_fiscal && <span className="ml-2 text-xs text-gray-500">MF: {s.matricule_fiscal}</span>}
            </div>
            <button onClick={() => handleDeleteSoc(s.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
          </div>
          <div className="p-4">
            <div className="flex gap-3 items-end mb-3">
              <div>
                <label className="text-xs text-gray-500">Mois/Annee</label>
                <input type="month" value={newDossierMonth[s.id] || ''} onChange={e => {
                  const [y, m] = e.target.value.split('-');
                  setNewDossierMonth(prev => ({ ...prev, [s.id]: `${m}/${y}` }));
                }} className="border rounded px-3 py-2 text-sm ml-2" />
              </div>
              <button onClick={() => handleCreateDossier(s.id)} className="bg-emerald-500 text-white px-3 py-2 rounded text-sm hover:bg-emerald-600">
                <Plus size={14} className="inline mr-1" /> Nouveau dossier
              </button>
            </div>
            {(dossiersBySoc[s.id] || []).length === 0 ? (
              <div className="text-gray-400 text-sm">Aucun dossier</div>
            ) : (
              <div className="space-y-2">
                {(dossiersBySoc[s.id] || []).map(d => (
                  <div key={d.id} className="flex items-center justify-between border rounded px-3 py-2 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <FolderOpen size={16} className="text-emerald-500" />
                      <span className="font-medium">{d.nom}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${d.statut === 'traite' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                        {d.statut}
                      </span>
                      <span className="text-xs text-gray-400">{d.nb_pieces} pieces / {d.nb_ecritures} ecritures</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => navigate(`/scanflash/dossier/${d.id}`)} className="text-emerald-600 hover:underline text-sm">
                        Ouvrir
                      </button>
                      <button onClick={() => handleDeleteDossier(d.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
