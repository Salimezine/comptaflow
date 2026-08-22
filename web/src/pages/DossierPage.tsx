import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Upload, Plus, Trash2, Download, ArrowLeft, FileText, Eye } from 'lucide-react';
import { api } from '../lib/api';

export default function DossierPage() {
  const { id } = useParams<{ id: string }>();
  const [dossier, setDossier] = useState<any>(null);
  const [pieces, setPieces] = useState<any[]>([]);
  const [ecritures, setEcritures] = useState<any[]>([]);
  const [journaux, setJournaux] = useState<any[]>([]);
  const [tab, setTab] = useState<'pieces' | 'ecritures'>('pieces');
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form ecriture
  const [fJournal, setFJournal] = useState('VE');
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0]);
  const [fDatePiece, setFDatePiece] = useState('');
  const [fNumDoc, setFNumDoc] = useState('');
  const [fLibelle, setFLibelle] = useState('');
  const [fCompteD, setFCompteD] = useState('411100');
  const [fCompteC, setFCompteC] = useState('701100');
  const [fMontant, setFMontant] = useState('');
  const [fTresorerie, setFTresorerie] = useState('');
  const [fPieceId, setFPieceId] = useState('');

  const reload = async () => {
    if (!id) return;
    const [d, p, e] = await Promise.all([api.getDossier(id), api.getPieces(id), api.getEcritures(id)]);
    setDossier(d); setPieces(p); setEcritures(e);
    if (d?.societe_id) api.getJournaux(d.societe_id).then(setJournaux);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [id]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !id) return;
    await api.upload(id, Array.from(files));
    reload();
  };

  const addEcriture = async () => {
    if (!id || !fMontant || !fLibelle) return;
    await api.addEcriture(id, {
      societe_id: dossier.societe_id,
      journal_code: fJournal,
      date_operation: fDate,
      date_piece: fDatePiece || null,
      numero_doc: fNumDoc || null,
      libelle: fLibelle,
      compte_debit: fCompteD,
      compte_credit: fCompteC,
      montant: parseFloat(fMontant),
      tresorerie: fTresorerie || null,
      piece_id: fPieceId || null,
    });
    setFLibelle(''); setFMontant(''); setFNumDoc('');
    reload();
  };

  const delEcriture = async (eid: string) => {
    await api.deleteEcriture(eid);
    reload();
  };

  const exportCSV = async () => {
    if (!id) return;
    const csv = await api.exportCSV(id);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ecritures_${dossier?.nom || id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  const totalD = ecritures.reduce((s, e) => s + e.montant, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/societes" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Retour</Link>
        <h1 className="text-xl font-bold">{dossier?.nom}</h1>
      </div>

      {/* TABS */}
      <div className="flex gap-2">
        <button onClick={() => setTab('pieces')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'pieces' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          <FileText className="w-4 h-4 inline mr-1" /> Pieces ({pieces.length})
        </button>
        <button onClick={() => setTab('ecritures')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'ecritures' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          Ecritures ({ecritures.length})
        </button>
      </div>

      {/* PIECES */}
      {tab === 'pieces' && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pieces justificatives</h2>
            <div>
              <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => handleUpload(e.target.files)} />
              <button onClick={() => fileRef.current?.click()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
                <Upload className="w-4 h-4" /> Deposer des PDF/images
              </button>
            </div>
          </div>
          {pieces.length === 0 ? <p className="text-sm text-gray-400">Aucune piece. Deposez vos factures ici.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-3 py-2">Fichier</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">N Facture</th><th className="px-3 py-2">Tiers</th><th className="px-3 py-2 text-right">HT</th><th className="px-3 py-2 text-right">TVA</th><th className="px-3 py-2 text-right">TTC</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {pieces.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{p.nom_fichier}</td>
                      <td className="px-3 py-2">{p.date_document || '-'}</td>
                      <td className="px-3 py-2">{p.numero_facture || '-'}</td>
                      <td className="px-3 py-2">{p.tiers || '-'}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.montant_ht?.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.montant_tva?.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.montant_ttc?.toFixed(3)}</td>
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
        <div className="space-y-4">
          {/* FORM AJOUT */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Ajouter une ecriture</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Journal</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={fJournal} onChange={e => setFJournal(e.target.value)}>
                  {journaux.map((j: any) => <option key={j.id} value={j.code}>{j.code} - {j.libelle}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date operation</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={fDate} onChange={e => setFDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date piece</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={fDatePiece} onChange={e => setFDatePiece(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">N Document</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={fNumDoc} onChange={e => setFNumDoc(e.target.value)} placeholder="FV-001" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Libelle</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={fLibelle} onChange={e => setFLibelle(e.target.value)} placeholder="Vente marchandises" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Compte DEBIT</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" value={fCompteD} onChange={e => setFCompteD(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Compte CREDIT</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" value={fCompteC} onChange={e => setFCompteC(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Montant (DT)</label>
                <input type="number" step="0.001" className="w-full border rounded-lg px-3 py-2 text-sm" value={fMontant} onChange={e => setFMontant(e.target.value)} placeholder="0.000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tresorerie</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={fTresorerie} onChange={e => setFTresorerie(e.target.value)}>
                  <option value="">-</option>
                  <option value="Especes">Especes</option>
                  <option value="TPE">TPE</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Virement">Virement</option>
                  <option value="Prelevement">Prelevement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Lier a piece</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={fPieceId} onChange={e => setFPieceId(e.target.value)}>
                  <option value="">-</option>
                  {pieces.map(p => <option key={p.id} value={p.id}>{p.nom_fichier}</option>)}
                </select>
              </div>
            </div>
            <button onClick={addEcriture} disabled={!fMontant || !fLibelle} className="mt-3 bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Ajouter l'ecriture
            </button>
          </div>

          {/* TABLEAU ECRITURES */}
          <div className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Ecritures ({ecritures.length})</h2>
              <button onClick={exportCSV} disabled={!ecritures.length} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Exporter CSV pour Axeane
              </button>
            </div>
            {ecritures.length === 0 ? <p className="text-sm text-gray-400">Aucune ecriture. Ajoutez-en une ci-dessus.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-3 py-2">Journal</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">N Doc</th><th className="px-3 py-2">Libelle</th><th className="px-3 py-2">Compte D</th><th className="px-3 py-2">Compte C</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2">Tresorerie</th><th className="px-3 py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {ecritures.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2"><span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">{e.journal_code}</span></td>
                        <td className="px-3 py-2">{e.date_operation}</td>
                        <td className="px-3 py-2 font-mono text-xs">{e.numero_doc || '-'}</td>
                        <td className="px-3 py-2">{e.libelle}</td>
                        <td className="px-3 py-2 font-mono text-xs">{e.compte_debit}</td>
                        <td className="px-3 py-2 font-mono text-xs">{e.compte_credit}</td>
                        <td className="px-3 py-2 text-right font-mono">{e.montant.toFixed(3)}</td>
                        <td className="px-3 py-2 text-xs">{e.tresorerie || '-'}</td>
                        <td className="px-3 py-2"><button onClick={() => delEcriture(e.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-gray-50 font-semibold">
                    <td colSpan={6} className="px-3 py-2 text-right text-sm">Total:</td>
                    <td className="px-3 py-2 text-right font-mono">{totalD.toFixed(3)}</td>
                    <td colSpan={2}></td>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
