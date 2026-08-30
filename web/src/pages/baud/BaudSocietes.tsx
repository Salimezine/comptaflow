import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function BaudSocietes() {
  const [societes, setSocietes] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [salaries, setSalaries] = useState<any[]>([]);
  const [rubriques, setRubriques] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [nom, setNom] = useState('');
  const [activite, setActivite] = useState('');

  useEffect(() => { api.baud.getSocietes().then(setSocietes).catch(() => {}); }, []);

  useEffect(() => {
    if (!selectedId) return;
    api.baud.getSalaries(selectedId).then(setSalaries).catch(() => {});
    api.baud.getRubriques(selectedId).then(setRubriques).catch(() => {});
  }, [selectedId]);

  const create = async () => {
    if (!nom.trim()) return;
    const s = await api.baud.createSociete({ nom: nom.trim(), activite: activite.trim() || undefined });
    setSocietes([...societes, s]);
    setNom(''); setActivite(''); setShowNew(false);
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
          <input placeholder="Nom" value={nom} onChange={e => setNom(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
          <input placeholder="Activite (optionnel)" value={activite} onChange={e => setActivite(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
          <button onClick={create} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">Creer</button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-1 bg-white border rounded-lg p-3 space-y-1">
          <p className="text-xs text-gray-500 mb-2">Liste</p>
          {societes.map(s => (
            <button key={s.id} onClick={() => setSelectedId(s.id)}
              className={`block w-full text-left px-3 py-2 rounded text-sm ${selectedId === s.id ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-50'}`}>
              {s.nom}
            </button>
          ))}
        </div>

        <div className="col-span-3 space-y-4">
          {selected && (
            <>
              <div className="bg-white border rounded-lg p-4">
                <h3 className="font-medium mb-2">{selected.nom}</h3>
                <p className="text-sm text-gray-500">Activite: {selected.activite || '—'}</p>
                <p className="text-sm text-gray-500">MF: {selected.matricule_fiscal || '—'}</p>
              </div>

              <div className="bg-white border rounded-lg p-4">
                <h4 className="font-medium text-sm mb-2">Salaries ({salaries.length})</h4>
                {salaries.length === 0 && <p className="text-xs text-gray-400">Aucun</p>}
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-1">Matricule</th><th>Nom</th><th>Prenom</th></tr></thead>
                  <tbody className="divide-y">
                    {salaries.map((s: any) => <tr key={s.id}><td className="py-1">{s.matricule}</td><td>{s.nom}</td><td>{s.prenom || '—'}</td></tr>)}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border rounded-lg p-4">
                <h4 className="font-medium text-sm mb-2">Rubriques ({rubriques.length})</h4>
                {rubriques.length === 0 && <p className="text-xs text-gray-400">Aucune</p>}
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-1">Code</th><th>Libelle</th><th>Type</th><th>Zone</th></tr></thead>
                  <tbody className="divide-y">
                    {rubriques.map((r: any) => <tr key={r.id}><td className="py-1 font-mono">{r.code}</td><td>{r.libelle}</td><td>{r.type}</td><td>{r.zone}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!selected && <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">Selectionnez une societe</div>}
        </div>
      </div>
    </div>
  );
}
