import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Download } from 'lucide-react';

export default function BaudExport() {
  const [societes, setSocietes] = useState<any[]>([]);
  const [societeId, setSocieteId] = useState('');
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [dossierId, setDossierId] = useState('');
  const [exports, setExports] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.baud.getSocietes().then(setSocietes).catch(() => {}); }, []);
  useEffect(() => { if (societeId) api.baud.getDossiers(societeId).then(setDossiers).catch(() => {}); }, [societeId]);
  useEffect(() => { if (dossierId) api.baud.getExports(dossierId).then(setExports).catch(() => {}); }, [dossierId]);

  const generate = async () => {
    if (!dossierId) return;
    setGenerating(true); setMsg('');
    try {
      const res = await api.baud.exportGA(dossierId);
      setMsg(`Fichiers generes : ${res.exports.map((e: any) => `${e.type} (${e.nb_lignes} lignes)`).join(', ')}`);
      api.baud.getExports(dossierId).then(setExports).catch(() => {});
    } catch (e: any) { setMsg(e.message); }
    setGenerating(false);
  };

  const download = async (eid: string, filename: string) => {
    try {
      const blob = await api.baud.downloadExport(eid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="space-y-4 mt-4">
      <h2 className="text-xl font-semibold">Export Sage GA</h2>
      <div className="bg-white border rounded-lg p-4 flex gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500">Societe</label>
          <select value={societeId} onChange={e => { setSocieteId(e.target.value); setDossierId(''); setExports([]); }}
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
        {dossierId && (
          <button onClick={generate} disabled={generating}
            className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50">
            {generating ? 'Generation...' : 'Generer fichiers Sage GA'}
          </button>
        )}
      </div>
      {msg && <p className={`text-sm ${msg.includes('Erreur') ? 'text-red-600' : 'text-green-700'}`}>{msg}</p>}

      {exports.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-medium text-sm mb-3">Fichiers generes</h3>
          <div className="space-y-2">
            {exports.map((exp: any) => (
              <div key={exp.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                <div>
                  <span className="text-sm font-medium">{exp.type_import === 'salaries' ? 'Import Salaries' : 'Import Variables'}</span>
                  <span className="text-xs text-gray-400 ml-2">{exp.nb_lignes} lignes</span>
                </div>
                <button onClick={() => download(exp.id, exp.fichier_nom)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                  <Download size={14} />Telecharger
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {dossierId && exports.length === 0 && <p className="text-sm text-gray-400">Aucun fichier exporte</p>}
    </div>
  );
}
