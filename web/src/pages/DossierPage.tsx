import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Upload, Plus, Trash2, Download, ArrowLeft, FileText, Zap, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export default function DossierPage() {
  const { id } = useParams<{ id: string }>();
  const [dossier, setDossier] = useState<any>(null);
  const [pieces, setPieces] = useState<any[]>([]);
  const [ecritures, setEcritures] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [tab, setTab] = useState<'factures' | 'ecritures' | 'pieces'>('factures');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  // Form facture
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0]);
  const [fNum, setFNum] = useState('');
  const [fClient, setFClient] = useState('');
  const [fHt0, setFHt0] = useState('');
  const [fHt19, setFHt19] = useState('');
  const [fTva, setFTva] = useState('');
  const [fTtc, setFTtc] = useState('');

  const reload = async () => {
    if (!id) return;
    const [d, p, e, f] = await Promise.all([api.getDossier(id), api.getPieces(id), api.getEcritures(id), api.getFactures(id)]);
    setDossier(d); setPieces(p); setEcritures(e); setFactures(f);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [id]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !id) return;
    setUploading(true);
    setOcrProgress('Traitement de ' + files.length + ' fichier(s) en cours...');
    try {
      const result = await api.process(id, Array.from(files));
      const ok = result.results.filter((r: any) => r.ok).length;
      const ko = result.results.filter((r: any) => !r.ok).length;
      setOcrProgress(ok + ' facture(s) extraite(s). Generation VT J.C...');
      await api.generateVTJC(id);
      setOcrProgress('Termine! ' + ok + ' facture(s) + ecritures generees' + (ko ? ' (' + ko + ' erreur(s))' : ''));
      await reload();
    } catch (e: any) { alert('Erreur: ' + e.message); }
    finally { setUploading(false); setTimeout(() => setOcrProgress(''), 3000); }
  };

  const addFacture = async () => {
    if (!id || !fNum || !fDate) return;
    const ht0 = parseFloat(fHt0) || 0;
    const ht19 = parseFloat(fHt19) || 0;
    const tva = parseFloat(fTva) || 0;
    const ttc = parseFloat(fTtc) || (ht0 + ht19 + tva + 1);
    await api.addFacture(id, { date_facture: fDate, numero_facture: fNum, client: fClient, total_ht_0: ht0, total_ht_19: ht19, tva_19: tva, timbre: 1, total_ttc: ttc });
    setFNum(''); setFHt0(''); setFHt19(''); setFTva(''); setFTtc(''); setFClient('');
    reload();
  };

  const delFacture = async (fid: string) => {
    await api.deleteFacture(fid);
    reload();
  };

  const generateVTJC = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      const result = await api.generateVTJC(id);
      alert('Genere! ' + result.days + ' jour(s) traite(s), ' + result.entries.length + ' ecriture(s)');
      reload();
    } catch (e: any) { alert('Erreur: ' + e.message); }
    finally { setGenerating(false); }
  };

  const delEcriture = async (eid: string) => { await api.deleteEcriture(eid); reload(); };

  const exportCSV = async () => {
    if (!id) return;
    const csv = await api.exportCSV(id);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ecritures_' + (dossier?.nom || id) + '.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Retour</Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{dossier?.nom}</h1>
            <p className="text-sm text-gray-500">{factures.length} facture(s) | {ecritures.length} ecriture(s) | {pieces.length} piece(s)</p>
          </div>
          <button onClick={exportCSV} disabled={!ecritures.length} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Exporter CSV
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {(['factures', 'ecritures', 'pieces'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
            {t} {t === 'factures' ? `(${factures.length})` : t === 'ecritures' ? `(${ecritures.length})` : `(${pieces.length})`}
          </button>
        ))}
      </div>

      {/* FACTURES */}
      {tab === 'factures' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Ajouter une facture</h2>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Date</label><input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={fDate} onChange={e => setFDate(e.target.value)} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">N Facture</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={fNum} onChange={e => setFNum(e.target.value)} placeholder="2026/408" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Client (optionnel)</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={fClient} onChange={e => setFClient(e.target.value)} placeholder="HBMI CONSULTING" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">HT 0%</label><input type="number" step="0.001" className="w-full border rounded-lg px-3 py-2 text-sm" value={fHt0} onChange={e => setFHt0(e.target.value)} placeholder="0.000" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">HT 19%</label><input type="number" step="0.001" className="w-full border rounded-lg px-3 py-2 text-sm" value={fHt19} onChange={e => setFHt19(e.target.value)} placeholder="0.000" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">TVA 19%</label><input type="number" step="0.001" className="w-full border rounded-lg px-3 py-2 text-sm" value={fTva} onChange={e => setFTva(e.target.value)} placeholder="0.000" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Net TTC</label><input type="number" step="0.001" className="w-full border rounded-lg px-3 py-2 text-sm" value={fTtc} onChange={e => setFTtc(e.target.value)} placeholder="0.000" /></div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={addFacture} disabled={!fNum || !fDate} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                <Plus className="w-4 h-4" /> Ajouter
              </button>
              <button onClick={generateVTJC} disabled={generating || !factures.length} className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1">
                <Zap className="w-4 h-4" /> {generating ? 'Generation...' : 'Generer VT J.C'}
              </button>
            </div>
          </div>

          {factures.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">N Facture</th><th className="px-4 py-3">Client</th><th className="px-4 py-3 text-right">HT 0%</th><th className="px-4 py-3 text-right">HT 19%</th><th className="px-4 py-3 text-right">TVA</th><th className="px-4 py-3 text-right">TTC</th><th className="px-4 py-3"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {factures.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{f.date_facture}</td>
                      <td className="px-4 py-2 font-mono text-xs">{f.numero_facture}</td>
                      <td className="px-4 py-2">{f.client || '-'}</td>
                      <td className="px-4 py-2 text-right font-mono">{(f.total_ht_0 || 0).toFixed(3)}</td>
                      <td className="px-4 py-2 text-right font-mono">{(f.total_ht_19 || 0).toFixed(3)}</td>
                      <td className="px-4 py-2 text-right font-mono">{(f.tva_19 || 0).toFixed(3)}</td>
                      <td className="px-4 py-2 text-right font-mono font-medium">{(f.total_ttc || 0).toFixed(3)}</td>
                      <td className="px-4 py-2"><button onClick={() => delFacture(f.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ECRITURES */}
      {tab === 'ecritures' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                <th className="px-4 py-3">Journal</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">N Doc</th><th className="px-4 py-3">Libelle</th><th className="px-4 py-3">Compte D</th><th className="px-4 py-3">Compte C</th><th className="px-4 py-3 text-right">Montant</th><th className="px-4 py-3"></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {ecritures.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Aucune ecriture. Saisissez les factures puis cliquez "Generer VT J.C".</td></tr>
                ) : ecritures.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2"><span className="bg-violet-100 text-violet-700 text-xs font-bold px-2 py-0.5 rounded">{e.journal_code}</span></td>
                    <td className="px-4 py-2">{e.date_operation}</td>
                    <td className="px-4 py-2 font-mono text-xs">{e.numero_doc || '-'}</td>
                    <td className="px-4 py-2">{e.libelle}</td>
                    <td className="px-4 py-2 font-mono text-xs">{e.compte_debit}</td>
                    <td className="px-4 py-2 font-mono text-xs">{e.compte_credit}</td>
                    <td className="px-4 py-2 text-right font-mono">{e.montant.toFixed(3)}</td>
                    <td className="px-4 py-2"><button onClick={() => delEcriture(e.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PIECES */}
      {tab === 'pieces' && (
        <div className="space-y-4">
          <div className={`bg-white rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => handleUpload(e.target.files)} />
            {uploading ? <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" /> : <><Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" /><p className="text-sm font-medium text-gray-700">Glissez vos PDF/images ici</p><p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG - Multiple fichiers</p></>}
          </div>
          <input ref={dirRef} type="file" className="hidden" /* @ts-ignore */
            webkitdirectory="" directory="" multiple
            onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ''; }} />
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
              <Upload className="w-4 h-4" /> Choisir des fichiers
            </button>
            <button onClick={() => dirRef.current?.click()} disabled={uploading}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> Choisir un dossier
            </button>
          </div>
          <p className="text-xs text-gray-400">"Choisir un dossier" selectionne tous les PDF d'un dossier d'un seul click</p>
          {pieces.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase"><th className="px-4 py-3">Fichier</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {pieces.map(p => <tr key={p.id} className="hover:bg-gray-50"><td className="px-4 py-2 flex items-center gap-2"><FileText className="w-4 h-4 text-red-500" />{p.nom_fichier}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
