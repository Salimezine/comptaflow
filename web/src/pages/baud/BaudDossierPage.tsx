import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, Download, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { api } from '../../lib/api';
import * as XLSX from 'xlsx';

function parseExcelRows(wb: XLSX.WorkBook): any[] {
  const lignes: any[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { header: 1, defval: '' });
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      const nonEmpty = row.filter((c: any) => c !== '' && c !== null && c !== undefined);
      if (nonEmpty.length === 0) continue;
      lignes.push({ source_feuille: name, source_ligne: i + 1, champs: row.map((c: any) => String(c ?? '')) });
    }
  }
  return lignes;
}

export default function BaudDossierPage() {
  const { id } = useParams<{ id: string }>();
  const [dossier, setDossier] = useState<any>(null);
  const [lignes, setLignes] = useState<any[]>([]);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [exports, setExports] = useState<any[]>([]);
  const [tab, setTab] = useState<'navette' | 'controle' | 'export'>('navette');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editField, setEditField] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const d = await api.baud.getDossier(id);
      setDossier(d);
      if (d.societe_id) {
        const l = await api.baud.getLignes(id);
        setLignes(l);
        const c = await api.baud.getCorrections(d.societe_id);
        setCorrections(c);
        const e = await api.baud.getExports(id);
        setExports(e);
      }
    } catch {}
  };

  useEffect(() => { load(); }, [id]);

  const uploadFile = async () => {
    if (!dossier || !file) return;
    setUploading(true); setMsg('');
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const lignesData = parseExcelRows(wb);
      const res = await api.baud.upload(dossier.id, file.name, lignesData);
      setMsg(`${res.lignes_count} lignes extraites`);
      await load();
    } catch (e: any) { setMsg('Erreur: ' + e.message); }
    setUploading(false);
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
      setMsg('Corrigee');
      if (dossier?.societe_id) api.baud.getCorrections(dossier.societe_id).then(setCorrections).catch(() => {});
    } catch (e: any) { setMsg(e.message); }
    setEditing(null);
  };

  const generateGA = async () => {
    if (!dossier) return;
    setGenerating(true); setMsg('');
    try {
      const res = await api.baud.exportGA(dossier.id);
      setMsg(`Fichiers generes: ${res.exports.map((e: any) => `${e.type} (${e.nb_lignes})`).join(', ')}`);
      await load();
    } catch (e: any) { setMsg('Erreur: ' + e.message); }
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

  if (!dossier) return <div className="mt-8 text-gray-400 text-sm">Chargement...</div>;

  const tabs = [
    { key: 'navette', label: 'Fiche navette', icon: Upload },
    { key: 'controle', label: `Controle (${lignes.length})`, icon: CheckCircle },
    { key: 'export', label: `Export Sage GA (${exports.length})`, icon: FileSpreadsheet },
  ] as const;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <Link to="/baud/societes" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
        <h2 className="text-xl font-semibold">Dossier {String(dossier.mois).padStart(2, '0')}/{dossier.annee}</h2>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${dossier.statut === 'valide' ? 'bg-green-100 text-green-700' : dossier.statut === 'controle' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          {dossier.statut}
        </span>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon size={16} />{t.label}
            </button>
          );
        })}
      </div>

      {msg && <p className={`text-sm ${msg.includes('Erreur') ? 'text-red-600' : 'text-green-700'}`}>{msg}</p>}

      {/* TAB: FICHE NAVETTE */}
      {tab === 'navette' && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          {dossier.fichier_navette_nom && (
            <p className="text-sm text-green-600">Fichier: {dossier.fichier_navette_nom}</p>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Fichier Excel (.xlsx)</label>
              <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full text-sm mt-1" />
            </div>
            <button onClick={uploadFile} disabled={!file || uploading}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
              <Upload size={14} />{uploading ? 'Upload...' : 'Upload + Extract'}
            </button>
          </div>
          <p className="text-xs text-gray-400">L'extraction est automatique lors de l'upload.</p>
        </div>
      )}

      {/* TAB: CONTROLE */}
      {tab === 'controle' && (
        <div className="space-y-4">
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
          {lignes.length === 0 && <p className="text-sm text-gray-400">Aucune ligne. Uploadez d'abord une fiche navette.</p>}

          {corrections.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="font-medium text-sm mb-2 text-purple-700">Corrections apprises ({corrections.length})</h3>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-purple-500 border-b border-purple-200">
                  <th className="py-1">Champ</th><th>Ancien</th><th>Nouveau</th><th>Utilisations</th>
                </tr></thead>
                <tbody className="divide-y divide-purple-100">
                  {corrections.map((c: any) => (
                    <tr key={c.id}>
                      <td className="py-1 font-medium">{c.field}</td>
                      <td className="text-red-500">{c.old_value || '(vide)'}</td>
                      <td className="text-green-600">{c.new_value}</td>
                      <td>{c.hit_count}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: EXPORT */}
      {tab === 'export' && (
        <div className="space-y-4">
          <button onClick={generateGA} disabled={generating || lignes.length === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50">
            {generating ? 'Generation...' : 'Generer fichiers Sage GA'}
          </button>

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
          {exports.length === 0 && <p className="text-sm text-gray-400">Aucun fichier exporte</p>}
        </div>
      )}
    </div>
  );
}
