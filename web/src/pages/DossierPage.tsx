import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Upload, Plus, Trash2, Download, ArrowLeft, FileText, Zap, Loader2, AlertTriangle, FileSpreadsheet, CheckCircle, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';

export default function DossierPage() {
  const { id } = useParams<{ id: string }>();
  const [dossier, setDossier] = useState<any>(null);
  const [pieces, setPieces] = useState<any[]>([]);
  const [ecritures, setEcritures] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [tab, setTab] = useState<'factures' | 'ecritures' | 'rapport' | 'analyse'>('factures');
  const [ecritureSubTab, setEcritureSubTab] = useState<'vtjc' | 'vtc'>('vtjc');
  const [rapport, setRapport] = useState<any[]>([]);
  const [analyse, setAnalyse] = useState<any[]>([]);
  const [analyseLoading, setAnalyseLoading] = useState(false);
  const rapportRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [vtjcResult, setVtjcResult] = useState<any>(null);
  const [vtcLoading, setVtcLoading] = useState(false);
  const vtcFileRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0]);
  const [fNum, setFNum] = useState('');
  const [fClient, setFClient] = useState('');
  const [fHt0, setFHt0] = useState('');
  const [fHt19, setFHt19] = useState('');
  const [fTva, setFTva] = useState('');
  const [fTtc, setFTtc] = useState('');

  const reload = async () => {
    if (!id) return;
    const [d, p, e, f, r] = await Promise.all([api.getDossier(id), api.getPieces(id), api.getEcritures(id), api.getFactures(id), api.getRapport(id)]);
    setDossier(d); setPieces(p); setEcritures(e); setFactures(f); setRapport(r);
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

  const delFacture = async (fid: string) => { await api.deleteFacture(fid); reload(); };
  const delAllFactures = async () => {
    if (!id || !confirm('Supprimer TOUT : factures + écritures VT J.C + rapport ?')) return;
    await api.deleteAllFactures(id);
    await api.deleteRapport(id);
    reload();
  };

  const generateVTJC = async () => {
    if (!id) return;
    setGenerating(true);
    setVtjcResult(null);
    try {
      const result = await api.generateVTJC(id);
      setVtjcResult(result);
      reload();
    } catch (e: any) { alert('Erreur: ' + e.message); }
    finally { setGenerating(false); }
  };

  const delEcriture = async (eid: string) => { await api.deleteEcriture(eid); reload(); };

  const handleRapport = async (files: FileList | null) => {
    if (!files?.[0] || !id) return;
    try { const r = await api.uploadRapport(id, files[0]); alert('Rapport importé: ' + r.count + ' jour(s)'); reload(); } catch (e: any) { alert('Erreur rapport: ' + e.message); }
    if (rapportRef.current) rapportRef.current.value = '';
  };
  const delRapport = async () => { if (!id || !confirm('Supprimer rapport?')) return; await api.deleteRapport(id); reload(); };

  const handleVTC = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !id) return;
    setVtcLoading(true);
    try {
      const r = await api.processVTC(id, Array.from(files));
      alert('VT C: ' + r.totalEntries + ' écriture(s) extraite(s)');
      reload();
    } catch (e: any) { alert('Erreur VT C: ' + e.message); }
    finally { setVtcLoading(false); if (vtcFileRef.current) vtcFileRef.current.value = ''; }
  };

  const loadAnalyse = async () => {
    if (!id) return;
    setAnalyseLoading(true);
    try { const r = await api.getExcluded(id); setAnalyse(r); } catch (e: any) { alert('Erreur: ' + e.message); }
    finally { setAnalyseLoading(false); }
  };
  useEffect(() => { if (tab === 'analyse' && id) loadAnalyse(); }, [tab, id]);

  const exportCSV = async () => {
    if (!id) return;
    const csv = await api.exportCSV(id);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ecritures_' + (dossier?.nom || id) + '.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = async () => {
    if (!id) return;
    const csv = await api.exportCSV(id);
    const lines = csv.trim().split('\n');
    const rows = lines.slice(1).map(l => l.split(';'));

    const xlsxHeaders = ['N° pièce comptable', 'Date pièce comptable', 'Journal', 'Libellé', 'N° compte', 'Libellé trésorerie', 'Débit', 'Crédit'];
    const data = [xlsxHeaders];

    for (const row of rows) {
      const formatDate = (d: string) => {
        if (d.includes('-')) { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; }
        return d;
      };
      const sens = (row[6] || '').trim().toUpperCase();
      const montant = Math.abs(parseFloat(row[7]) || 0).toFixed(3);
      const debit = sens === 'D' ? montant : '0.000';
      const credit = sens === 'C' ? montant : '0.000';
      data.push([
        row[3] || '', formatDate(row[0] || ''), row[2] || '', row[4] || '',
        row[5] || '', row[8] || '', debit, credit
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 20 }, { wch: 18 }, { wch: 8 }, { wch: 30 },
      { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ecritures');
    XLSX.writeFile(wb, 'ecritures_' + (dossier?.nom || id) + '.xlsx');
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  const ecrituresVTJC = ecritures.filter(e => e.journal_code === 'VT J.C');
  const ecrituresVTC = ecritures.filter(e => e.journal_code === 'VT C');

  const TABS: Array<{ key: typeof tab; label: string; count?: number; icon?: React.ReactNode }> = [
    { key: 'factures', label: 'Factures', count: factures.length },
    { key: 'rapport', label: 'Rapport', count: rapport.length },
    { key: 'ecritures', label: 'Ecritures', count: ecritures.length },
    { key: 'analyse', label: 'Analyse', icon: <AlertTriangle className="w-3 h-3 inline mr-1" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Retour</Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{dossier?.nom}</h1>
            <p className="text-sm text-gray-500">{factures.length} facture(s) | {ecrituresVTJC.length} VT J.C | {ecrituresVTC.length} VT C | {rapport.length} rapport(s)</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} disabled={!ecritures.length} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={exportXLSX} disabled={!ecritures.length} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4" /> XLSX
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
            {t.icon}{t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'factures' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Ajouter une facture</h2>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Date</label><input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={fDate} onChange={e => setFDate(e.target.value)} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">N Facture</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={fNum} onChange={e => setFNum(e.target.value)} placeholder="2026/408" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Client</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={fClient} onChange={e => setFClient(e.target.value)} placeholder="HBMI CONSULTING" /></div>
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
              {factures.length > 0 && <button onClick={delAllFactures} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 flex items-center gap-1"><Trash2 className="w-4 h-4" /> Supprimer tout</button>}
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

          {vtjcResult && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-blue-800">Resultat Generation VT J.C</h3>
                <button onClick={() => setVtjcResult(null)} className="text-blue-400 hover:text-blue-600 text-sm">Fermer</button>
              </div>
              <p className="text-sm text-blue-700">{vtjcResult.days} jour(s) traite(s), {vtjcResult.entries?.filter((e: any) => !e.excluded).length || 0} ecriture(s)</p>
              {vtjcResult.anomalies?.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-red-700 mb-1">Jours excludes (ecart &gt; 3DT) :</p>
                  {vtjcResult.anomalies.map((a: any, i: number) => (
                    <div key={i} className="bg-white border border-red-200 rounded-lg p-2 mb-2">
                      <p className="text-sm font-mono font-bold text-red-700">{a.date} — {a.error}</p>
                      {a.factures && <pre className="text-xs text-gray-600 mt-1 whitespace-pre-wrap font-mono">{a.factures}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'rapport' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-2">Rapport Vente par jour</h2>
            <p className="text-xs text-gray-500 mb-3">Upload le PDF "Vente par jour" — cas separe des factures. Ventilation: Espece→411004 / Cheque→411003 / Carte→411005 / Bons→709500.</p>
            <input ref={rapportRef} type="file" accept=".pdf" className="hidden" onChange={e => handleRapport(e.target.files)} />
            <div className="flex gap-2">
              <button onClick={() => rapportRef.current?.click()} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 flex items-center gap-1.5"><Upload className="w-4 h-4" /> Choisir rapport PDF</button>
              {rapport.length > 0 && <button onClick={delRapport} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> Supprimer</button>}
            </div>
            {rapport.length > 0 && <p className="text-xs text-emerald-600 mt-2">{rapport.length} jour(s) charges — Generer VT J.C utilisera ce rapport</p>}
            {rapport.length === 0 && <p className="text-xs text-gray-400 mt-2">Aucun rapport — generation utilisera le fallback par defaut</p>}
          </div>
          {rapport.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Espece</th><th className="px-3 py-2 text-right">Cheque</th><th className="px-3 py-2 text-right">Carte</th><th className="px-3 py-2 text-right">Bons+Avoir</th><th className="px-3 py-2 text-right">Credit</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">{rapport.map((r: any) => (
                  <tr key={r.date_jour} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{r.date_jour}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.especes.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.cheques.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.tpe.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{((r.bonsAchat||0)+(r.avoir||0)).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{(r.credit||0).toFixed(2)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'ecritures' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setEcritureSubTab('vtjc')} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${ecritureSubTab === 'vtjc' ? 'bg-violet-100 text-violet-700 border-2 border-violet-300' : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'}`}>
              <Zap className="w-4 h-4 inline mr-1" /> VT J.C <span className="ml-1 text-xs opacity-70">({ecrituresVTJC.length})</span>
            </button>
            <button onClick={() => setEcritureSubTab('vtc')} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${ecritureSubTab === 'vtc' ? 'bg-teal-100 text-teal-700 border-2 border-teal-300' : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'}`}>
              <FileText className="w-4 h-4 inline mr-1" /> VT C <span className="ml-1 text-xs opacity-70">({ecrituresVTC.length})</span>
            </button>
          </div>

          {ecritureSubTab === 'vtjc' && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-violet-700">Journal VT J.C — Ecritures generees</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Calculees a partir des factures + rapport (modes de paiement)</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={generateVTJC} disabled={generating || !factures.length} className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1">
                      <Zap className="w-4 h-4" /> {generating ? 'Generation...' : 'Regenerer'}
                    </button>
                    {ecrituresVTJC.length > 0 && (
                      <button onClick={async () => { if (!id || !confirm('Supprimer ecritures VT J.C?')) return; await api.deleteAllEcritures(id); reload(); }} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 flex items-center gap-1">
                        <Trash2 className="w-4 h-4" /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {ecrituresVTJC.length > 0 ? (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                        <th className="px-4 py-3">Date</th><th className="px-4 py-3">N Doc</th><th className="px-4 py-3">Libelle</th><th className="px-4 py-3">Compte</th><th className="px-4 py-3">Sens</th><th className="px-4 py-3 text-right">Montant</th><th className="px-4 py-3"></th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {ecrituresVTJC.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">{e.date_operation}</td>
                            <td className="px-4 py-2 font-mono text-xs">{e.numero_doc || '-'}</td>
                            <td className="px-4 py-2">{e.libelle}</td>
                            <td className="px-4 py-2 font-mono text-xs">{e.compte}</td>
                            <td className="px-4 py-2"><span className={e.sens === 'D' ? 'text-emerald-600 font-bold' : 'text-blue-600 font-bold'}>{e.sens}</span></td>
                            <td className="px-4 py-2 text-right font-mono">{(e.montant || 0).toFixed(3)}</td>
                            <td className="px-4 py-2"><button onClick={() => delEcriture(e.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
                  Aucune ecriture VT J.C. Saisissez les factures puis cliquez "Generer VT J.C".
                </div>
              )}
            </div>
          )}

          {ecritureSubTab === 'vtc' && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-teal-700">Journal VT C — Ecritures directes</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Extraction du PDF "Edition facture vente" — les ecritures sont deja dans le PDF</p>
                  </div>
                  <div className="flex gap-2">
                    <input ref={vtcFileRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleVTC} />
                    <button onClick={() => vtcFileRef.current?.click()} disabled={vtcLoading} className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5">
                      {vtcLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {vtcLoading ? 'Extraction...' : 'Upload PDF VT C'}
                    </button>
                    {ecrituresVTC.length > 0 && (
                      <button onClick={async () => { if (!id || !confirm('Supprimer toutes les ecritures VT C?')) return; await api.deleteAllEcritures(id); reload(); }} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 flex items-center gap-1">
                        <Trash2 className="w-4 h-4" /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {ecrituresVTC.length > 0 ? (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                        <th className="px-4 py-3">Date</th><th className="px-4 py-3">N Doc</th><th className="px-4 py-3">Libelle</th><th className="px-4 py-3">Compte</th><th className="px-4 py-3">Sens</th><th className="px-4 py-3 text-right">Montant</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {ecrituresVTC.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">{e.date_operation}</td>
                            <td className="px-4 py-2 font-mono text-xs">{e.numero_doc || '-'}</td>
                            <td className="px-4 py-2">{e.libelle}</td>
                            <td className="px-4 py-2 font-mono text-xs">{e.compte}</td>
                            <td className="px-4 py-2"><span className={e.sens === 'D' ? 'text-emerald-600 font-bold' : 'text-blue-600 font-bold'}>{e.sens}</span></td>
                            <td className="px-4 py-2 text-right font-mono">{(e.montant || 0).toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
                  Aucune ecriture VT C. Uploadez le PDF "Edition facture vente" pour extraire les ecritures.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'analyse' && (
        <div className="space-y-4">
          {analyseLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : analyse.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Aucune donnee. Ajoutez des factures d'abord.</p>
          ) : (
            <>
              <div className="bg-white rounded-xl border p-5">
                <h2 className="font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Analyse des ecarts par jour</h2>
                <p className="text-xs text-gray-500">Comparaison Rapport vs Factures — jours avec ecart &gt; 3DT = exclus de la generation VT J.C</p>
              </div>
              {analyse.filter(a => Math.abs(a.ecart) > 3).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <h3 className="font-semibold text-red-700 text-sm mb-2">Jours excludes (ecart &gt; 3DT) — a verifier manuellement :</h3>
                  {analyse.filter(a => Math.abs(a.ecart) > 3).map((a: any) => (
                    <details key={a.date} className="mb-3 bg-white border border-red-200 rounded-lg overflow-hidden">
                      <summary className="px-4 py-3 cursor-pointer hover:bg-red-50 flex items-center justify-between">
                        <span className="font-mono font-bold text-red-700">{a.date}</span>
                        <span className="text-sm">
                          <span className="text-red-600 font-mono font-bold">ecart = {a.ecart.toFixed(3)} DT</span>
                          <span className="text-gray-400 ml-2">| {a.nbFactures} facture(s)</span>
                          <span className="text-gray-400 ml-2">| Factures: {a.totalFactures.toFixed(2)} | Rapport: {a.totalModes.toFixed(2)}</span>
                        </span>
                      </summary>
                      <div className="px-4 pb-3 space-y-3">
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Modes de paiement (Rapport) :</h4>
                          <div className="grid grid-cols-3 gap-1 text-xs font-mono">
                            <span>Espece: {a.modes.especes.toFixed(2)}</span>
                            <span>Cheque: {a.modes.cheques.toFixed(2)}</span>
                            <span>Carte: {a.modes.tpe.toFixed(2)}</span>
                            <span>Bons: {a.modes.bonsAchat.toFixed(2)}</span>
                            <span>Avoir: {a.modes.avoir.toFixed(2)}</span>
                            <span>Credit: {a.modes.credit.toFixed(2)}</span>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Factures du jour :</h4>
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-400"><th className="text-left">Num</th><th className="text-left">Client</th><th className="text-right">HT0</th><th className="text-right">HT19</th><th className="text-right">TVA</th><th className="text-right">TTC</th></tr></thead>
                            <tbody className="divide-y divide-gray-100">{a.factures.map((f: any, i: number) => <tr key={i}><td className="font-mono">{f.num}</td><td>{f.client}</td><td className="text-right font-mono">{f.ht0.toFixed(3)}</td><td className="text-right font-mono">{f.ht19.toFixed(3)}</td><td className="text-right font-mono">{f.tva.toFixed(3)}</td><td className="text-right font-mono font-medium">{f.ttc.toFixed(3)}</td></tr>)}</tbody>
                          </table>
                        </div>
                        {a.proposedEcritures.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Ecritures proposees (non generees) :</h4>
                            <table className="w-full text-xs">
                              <thead><tr className="text-gray-400"><th className="text-left">Compte</th><th className="text-left">Sens</th><th className="text-right">Montant</th><th className="text-left">Libelle</th></tr></thead>
                              <tbody className="divide-y divide-gray-100">{a.proposedEcritures.map((l: any, i: number) => <tr key={i}><td className="font-mono">{l.compte}</td><td className={l.sens === 'D' ? 'text-emerald-600 font-bold' : 'text-blue-600 font-bold'}>{l.sens}</td><td className="text-right font-mono">{l.montant.toFixed(3)}</td><td>{l.libelle || '-'}</td></tr>)}</tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Factures TTC</th><th className="px-3 py-2 text-right">Rapport Total</th><th className="px-3 py-2 text-right">Ecart</th><th className="px-3 py-2 text-center">Statut</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {analyse.map((a: any) => (
                      <tr key={a.date} className={Math.abs(a.ecart) > 3 ? 'bg-red-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2 font-mono text-xs">{a.date}</td>
                        <td className="px-3 py-2 text-right font-mono">{a.totalFactures.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono">{a.totalModes.toFixed(2)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${Math.abs(a.ecart) > 3 ? 'text-red-600' : Math.abs(a.ecart) > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>{a.ecart.toFixed(3)}</td>
                        <td className="px-3 py-2 text-center">{a.excluded ? <XCircle className="w-4 h-4 text-red-500 inline" /> : <CheckCircle className="w-4 h-4 text-emerald-500 inline" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
