import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function BaudControle() {
  const [societes, setSocietes] = useState<any[]>([]);
  const [societeId, setSocieteId] = useState('');
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [dossierId, setDossierId] = useState('');
  const [lignes, setLignes] = useState<any[]>([]);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editField, setEditField] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { api.baud.getSocietes().then(setSocietes).catch(() => {}); }, []);
  useEffect(() => { if (societeId) { api.baud.getDossiers(societeId).then(setDossiers).catch(() => {}); api.baud.getCorrections(societeId).then(setCorrections).catch(() => {}); } }, [societeId]);
  useEffect(() => { if (dossierId) api.baud.getLignes(dossierId).then(setLignes).catch(() => {}); }, [dossierId]);

  const valider = async () => {
    if (!dossierId) return;
    setMsg('');
    try { await api.baud.valider(dossierId); setMsg('Dossier valide !'); }
    catch (e: any) { setMsg(e.message); }
  };

  const startEdit = (ligneId: string, field: string, value: any) => {
    setEditing(ligneId); setEditField(field); setEditVal(String(value ?? ''));
  };

  const saveEdit = async (ligneId: string) => {
    const update: any = {};
    update[editField] = editField === 'valeur' ? parseFloat(editVal) || 0 : editVal;
    try {
      await api.baud.updateLigne(ligneId, update);
      setLignes(lignes.map(l => l.id === ligneId ? { ...l, ...update } : l));
      setMsg('Corrigee — l\'IA apprendra de cette correction');
      // Refresh corrections
      if (societeId) api.baud.getCorrections(societeId).then(setCorrections).catch(() => {});
    } catch (e: any) { setMsg(e.message); }
    setEditing(null);
  };

  const deleteCorr = async (cid: string) => {
    await api.baud.deleteCorrection(cid);
    setCorrections(corrections.filter(c => c.id !== cid));
  };

  return (
    <div className="space-y-4 mt-4">
      <h2 className="text-xl font-semibold">Controle des extractions</h2>
      <div className="bg-white border rounded-lg p-4 flex gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500">Societe</label>
          <select value={societeId} onChange={e => { setSocieteId(e.target.value); setDossierId(''); setLignes([]); }}
            className="w-full border rounded px-3 py-2 text-sm mt-1">
            <option value="">— Choisir —</option>
            {societes.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Dossier</label>
          <select value={dossierId} onChange={e => setDossierId(e.target.value)} className="w-full border rounded px-3 py-2 text-sm mt-1">
            <option value="">— Choisir —</option>
            {dossiers.map((d: any) => <option key={d.id} value={d.id}>{String(d.mois).padStart(2, '0')}/{d.annee}</option>)}
          </select>
        </div>
        {dossierId && <button onClick={valider} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">Valider</button>}
      </div>
      {msg && <p className={`text-sm ${msg.includes('Erreur') ? 'text-red-600' : 'text-green-700'}`}>{msg}</p>}

      {lignes.length > 0 && (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
              <th className="p-2">Matricule</th><th className="p-2">Nom</th><th className="p-2">Type</th>
              <th className="p-2">Rubrique</th><th className="p-2">Zone</th><th className="p-2">Valeur</th>
            </tr></thead>
            <tbody className="divide-y">
              {lignes.map((l: any) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  {(['matricule','nom_prenom','type_ligne','rubrique_code','zone','valeur'] as const).map(f => (
                    <td key={f} className="p-2 cursor-pointer hover:bg-blue-50"
                      onClick={() => startEdit(l.id, f, l[f])}>
                      {editing === l.id && editField === f ? (
                        <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                          onBlur={() => saveEdit(l.id)} onKeyDown={e => e.key === 'Enter' && saveEdit(l.id)}
                          className="w-full border rounded px-1 py-0.5 text-xs" />
                      ) : (
                        f === 'valeur' ? (l[f] != null ? Number(l[f]).toLocaleString('fr-TN', { minimumFractionDigits: 3 }) : '—')
                          : (l[f] || '—')
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dossierId && lignes.length === 0 && <p className="text-sm text-gray-400">Aucune ligne extraite</p>}

      {corrections.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="font-medium text-sm mb-2 text-purple-700">Corrections apprises ({corrections.length})</h3>
          <p className="text-xs text-purple-600 mb-3">Ces corrections seront appliquees automatiquement lors du prochain upload.</p>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-purple-500 border-b border-purple-200">
              <th className="py-1">Champ</th><th>Ancienne valeur</th><th>Nouvelle valeur</th><th>Utilisations</th><th></th>
            </tr></thead>
            <tbody className="divide-y divide-purple-100">
              {corrections.map((c: any) => (
                <tr key={c.id}>
                  <td className="py-1 font-medium">{c.field}</td>
                  <td className="text-red-500">{c.old_value || '(vide)'}</td>
                  <td className="text-green-600">{c.new_value}</td>
                  <td>{c.hit_count}x</td>
                  <td><button onClick={() => deleteCorr(c.id)} className="text-red-400 hover:text-red-600">X</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
