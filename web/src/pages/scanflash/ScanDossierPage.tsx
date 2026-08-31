import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Table2, Trash2, Download, Zap, Upload, CheckCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { extractTextItemsFromPDF } from '../../lib/pdf';

type Tab = 'factures' | 'ecritures' | 'export';

export default function ScanDossierPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dossier, setDossier] = useState<any>(null);
  const [factures, setFactures] = useState<any[]>([]);
  const [ecritures, setEcritures] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('factures');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Manual add form
  const [form, setForm] = useState({ numero: '', date_facture: '', client: '', compte_client: '', total_ht_0: '0', total_ht_19: '0', tva_19: '0', fodec: '0', timbre: '0', total_ttc: '0' });

  const load = async (withEcritures = false) => {
    if (!id) return;
    setLoading(true);
    const d = await api.scan.getDossier(id);
    setDossier(d);
    const f = await api.scan.getFactures(id);
    setFactures(f);
    if (withEcritures) {
      const e = await api.scan.getEcritures(id);
      setEcritures(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleUploadPDF = async (files: FileList) => {
    if (!id || !files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const items = await extractTextItemsFromPDF(file);
        const text = items.map((i: any) => i.text).join('\n');
        const parsed = parseScanInvoice(text);
        if (parsed) {
          await api.scan.addFacture(id, parsed);
        }
      }
      await load();
    } catch (e: any) {
      alert('Erreur extraction: ' + e.message);
    }
    setUploading(false);
  };

  // Client code → 411XXX account mapping (stored in localStorage)
  const [clientMap, setClientMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('scan_client_map') || '{}'); } catch { return {}; }
  });
  const [newClientCode, setNewClientCode] = useState('');
  const [newClientAccount, setNewClientAccount] = useState('');
  const [newClientName, setNewClientName] = useState('');

  const saveClientMap = (map: Record<string, string>) => {
    setClientMap(map);
    localStorage.setItem('scan_client_map', JSON.stringify(map));
  };

  const parseAmount = (s: string): number => {
    // "1 560,391" → 1560.391, "-299,438" → -299.438
    return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0;
  };

  const parseScanInvoice = (text: string): any | null => {
    const lines = text.split('\n');
    let numero = '';
    let isAvoir = false;
    let date = '';
    let codeClient = '';
    let clientName = '';
    let totalHT = 0;
    let tva19 = 0;
    let fodec = 0;
    let timbre = 0;
    let totalTTC = 0;
    let afterAdressA = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // "Facture FAC2606-00001989" or "Facture avoir AVR2606-000029"
      const facMatch = line.match(/^Facture\s+(avoir\s+)?(FAC|AVR)\S+/i);
      if (facMatch) {
        isAvoir = !!facMatch[1];
        numero = line.replace(/^Facture\s+(avoir\s+)?/i, '').trim();
      }

      // "Date facturation : 05/06/2026"
      const dateMatch = line.match(/Date\s+facturation\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
      if (dateMatch) date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

      // "Code client : CLT0626-1187"
      const codeMatch = line.match(/Code\s+client\s*:\s*(\S+)/i);
      if (codeMatch) codeClient = codeMatch[1];

      // Client name after "Adressé à"
      if (line.match(/Adress[ée]\s+[àa]/i)) { afterAdressA = true; continue; }
      if (afterAdressA && line && !line.match(/^(Numéro|Tél|Email|Web|Scan)/i)) {
        clientName = line;
        afterAdressA = false;
      }

      // "Total HT" "279,000" or "Total HT" "-1 560,391"
      if (line.match(/^Total\s+HT$/i) && i + 1 < lines.length) {
        totalHT = parseAmount(lines[i + 1].trim());
      }

      // "Total TVA 19%" "53,541"
      if (line.match(/^Total\s+TVA\s+19\s*%$/i) && i + 1 < lines.length) {
        tva19 = parseAmount(lines[i + 1].trim());
      }

      // "FODEC 1%" "2,790"
      if (line.match(/^FODEC\s+1\s*%$/i) && i + 1 < lines.length) {
        fodec = parseAmount(lines[i + 1].trim());
      }

      // "Timbre fiscal" "1,000"
      if (line.match(/^Timbre\s+fiscal$/i) && i + 1 < lines.length) {
        timbre = parseAmount(lines[i + 1].trim());
      }

      // "Total TTC" "336,331"
      if (line.match(/^Total\s+TTC$/i) && i + 1 < lines.length) {
        totalTTC = parseAmount(lines[i + 1].trim());
      }
    }

    if (!numero || !date) return null;

    // Map code_client → 411XXX
    const compteClient = clientMap[codeClient] || '411000';

    return {
      numero, date_facture: date, client: clientName || codeClient, code_client: codeClient,
      compte_client: compteClient, is_avoir: isAvoir,
      total_ht_0: 0, total_ht_19: Math.abs(totalHT),
      tva_19: Math.abs(tva19), fodec: Math.abs(fodec),
      timbre: isAvoir ? 0 : Math.abs(timbre),
      total_ttc: Math.abs(totalTTC),
    };
  };

  const handleAddFacture = async () => {
    if (!id) return;
    const f = {
      ...form,
      total_ht_0: parseFloat(form.total_ht_0) || 0,
      total_ht_19: parseFloat(form.total_ht_19) || 0,
      tva_19: parseFloat(form.tva_19) || 0,
      fodec: parseFloat(form.fodec) || 0,
      timbre: parseFloat(form.timbre) || 0,
      total_ttc: parseFloat(form.total_ttc) || 0,
    };
    await api.scan.addFacture(id, f);
    setForm({ numero: '', date_facture: '', client: '', compte_client: '', total_ht_0: '0', total_ht_19: '0', tva_19: '0', fodec: '0', timbre: '0', total_ttc: '0' });
    await load();
  };

  const handleGenerate = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      const res = await api.scan.generate(id);
      alert(`${res.factures} factures → ${res.ecritures} ecritures generées`);
      await load(true);
      setTab('ecritures');
    } catch (e: any) {
      alert('Erreur: ' + e.message);
    }
    setGenerating(false);
  };

  const handleExportCSV = async (journal?: string) => {
    if (!id) return;
    const csv = await api.scan.exportCSV(id, journal);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `scan_vt_${dossier?.nom || id}.csv`;
    a.click(); URL.revokeObjectURL(url);
    // Auto-cleanup
    if (confirm('Exporter et supprimer les donnees?')) {
      await api.scan.cleanup(id);
      await load(true);
    }
  };

  const handleDeleteFactures = async () => {
    if (!id || !confirm('Supprimer toutes les factures?')) return;
    await api.scan.deleteAllFactures(id);
    await load();
  };

  const handleDeleteEcritures = async (journal?: string) => {
    if (!id || !confirm('Supprimer toutes les ecritures?')) return;
    await api.scan.deleteAllEcritures(id, journal);
    await load(true);
  };

  if (loading) return <div className="text-gray-400 py-10">Chargement...</div>;
  if (!dossier) return <div className="text-red-500 py-10">Dossier non trouve</div>;

  const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: 'factures', label: 'Factures', icon: FileText, count: factures.length },
    { key: 'ecritures', label: 'Ecritures VT', icon: Table2, count: ecritures.length },
    { key: 'export', label: 'Export', icon: Download, count: ecritures.length },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/scanflash')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">{dossier.nom}</h1>
          <span className="text-xs text-gray-500">SCANFLASH</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => load(true)} className="text-sm text-gray-500 hover:text-gray-700">Rafraichir</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key === 'ecritures' && ecritures.length === 0) load(true); }}
            className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={15} />
            {t.label}
            {t.count > 0 && <span className="ml-1 bg-gray-200 text-gray-600 text-xs px-1.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab: Factures */}
      {tab === 'factures' && (
        <div className="space-y-4">
          {/* Upload */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <label className="bg-emerald-600 text-white px-4 py-2 rounded text-sm hover:bg-emerald-700 cursor-pointer">
                <Upload size={15} className="inline mr-1" />
                {uploading ? 'Extraction...' : 'Importer PDF(s)'}
                <input type="file" accept=".pdf" multiple className="hidden" onChange={e => e.target.files && handleUploadPDF(e.target.files)} />
              </label>
              <span className="text-xs text-gray-400">{factures.length} factures importees</span>
              {factures.length > 0 && (
                <button onClick={handleDeleteFactures} className="text-red-400 hover:text-red-600 text-xs ml-auto"><Trash2 size={14} className="inline mr-1" /> Tout supprimer</button>
              )}
            </div>
          </div>

          {/* Client mapping */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Mapping Code Client → Compte 411XXX</h3>
            <div className="flex gap-2 items-end mb-2">
              <input placeholder="Code client (ex: CLT0626-1187)" value={newClientCode} onChange={e => setNewClientCode(e.target.value)} className="flex-1 border rounded px-2 py-1.5 text-sm" />
              <input placeholder="Compte 411XXX" value={newClientAccount} onChange={e => setNewClientAccount(e.target.value)} className="w-32 border rounded px-2 py-1.5 text-sm" />
              <input placeholder="Nom (optionnel)" value={newClientName} onChange={e => setNewClientName(e.target.value)} className="flex-1 border rounded px-2 py-1.5 text-sm" />
              <button onClick={() => {
                if (!newClientCode.trim() || !newClientAccount.trim()) return;
                saveClientMap({ ...clientMap, [newClientCode.trim()]: newClientAccount.trim() });
                setNewClientCode(''); setNewClientAccount(''); setNewClientName('');
              }} className="bg-emerald-500 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-600">+</button>
            </div>
            {Object.keys(clientMap).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(clientMap).map(([code, acct]) => (
                  <span key={code} className="inline-flex items-center gap-1 bg-gray-100 text-xs px-2 py-1 rounded">
                    {code} → {acct}
                    <button onClick={() => { const m = { ...clientMap }; delete m[code]; saveClientMap(m); }} className="text-red-400 hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Manual add */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Ajouter manuellement</h3>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <input placeholder="N° FAC" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} className="border rounded px-2 py-1.5" />
              <input type="date" value={form.date_facture} onChange={e => setForm({...form, date_facture: e.target.value})} className="border rounded px-2 py-1.5" />
              <input placeholder="Client" value={form.client} onChange={e => setForm({...form, client: e.target.value})} className="border rounded px-2 py-1.5" />
              <input placeholder="Compte 411XXX" value={form.compte_client} onChange={e => setForm({...form, compte_client: e.target.value})} className="border rounded px-2 py-1.5" />
              <input placeholder="HT 0%" type="number" step="0.001" value={form.total_ht_0} onChange={e => setForm({...form, total_ht_0: e.target.value})} className="border rounded px-2 py-1.5" />
              <input placeholder="HT 19%" type="number" step="0.001" value={form.total_ht_19} onChange={e => setForm({...form, total_ht_19: e.target.value})} className="border rounded px-2 py-1.5" />
              <input placeholder="TVA 19%" type="number" step="0.001" value={form.tva_19} onChange={e => setForm({...form, tva_19: e.target.value})} className="border rounded px-2 py-1.5" />
              <input placeholder="FODEC" type="number" step="0.001" value={form.fodec} onChange={e => setForm({...form, fodec: e.target.value})} className="border rounded px-2 py-1.5" />
              <input placeholder="Timbre" type="number" step="0.001" value={form.timbre} onChange={e => setForm({...form, timbre: e.target.value})} className="border rounded px-2 py-1.5" />
              <input placeholder="TTC" type="number" step="0.001" value={form.total_ttc} onChange={e => setForm({...form, total_ttc: e.target.value})} className="border rounded px-2 py-1.5" />
              <button onClick={handleAddFacture} className="bg-emerald-500 text-white rounded px-3 py-1.5 hover:bg-emerald-600">+</button>
            </div>
          </div>

          {/* Factures table */}
          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">N°</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Compte</th>
                  <th className="px-3 py-2 text-right">HT 19%</th>
                  <th className="px-3 py-2 text-right">TVA</th>
                  <th className="px-3 py-2 text-right">FODEC</th>
                  <th className="px-3 py-2 text-right">Timbre</th>
                  <th className="px-3 py-2 text-right">TTC</th>
                </tr>
              </thead>
              <tbody>
                {factures.map(f => (
                  <tr key={f.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {f.is_avoir ? <span className="text-red-600 font-bold">AVR</span> : 'FAC'} {f.numero}
                    </td>
                    <td className="px-3 py-1.5 text-xs">{f.date_facture}</td>
                    <td className="px-3 py-1.5 text-xs">{f.client}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{f.code_client}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{f.compte_client}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{(f.total_ht_19 || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{(f.tva_19 || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{(f.fodec || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{(f.timbre || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{(f.total_ttc || 0).toFixed(3)}</td>
                  </tr>
                ))}
                {factures.length === 0 && <tr><td colSpan={10} className="text-center text-gray-400 py-6">Aucune facture</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Generate button */}
          {factures.length > 0 && (
            <div className="flex justify-center">
              <button onClick={handleGenerate} disabled={generating}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                <Zap size={18} />
                {generating ? 'Generation...' : `Generer VT (${factures.length} factures)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Ecritures */}
      {tab === 'ecritures' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => handleExportCSV()} className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-700">
              <Download size={14} className="inline mr-1" /> Export CSV VT
            </button>
            {ecritures.length > 0 && (
              <button onClick={() => handleDeleteEcritures()} className="text-red-400 hover:text-red-600 text-sm border border-red-200 px-3 py-1.5 rounded">
                <Trash2 size={14} className="inline mr-1" /> Supprimer ecritures
              </button>
            )}
          </div>

          {/* Manual add ecriture */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Ajouter une ecriture</h3>
            <div className="grid grid-cols-6 gap-2 text-sm">
              <input type="date" id="ecr-date" className="border rounded px-2 py-1.5" defaultValue={dossier?.mois ? `${dossier.annee}-${String(dossier.mois).padStart(2,'0')}-01` : ''} />
              <input placeholder="N° Piece" id="ecr-piece" className="border rounded px-2 py-1.5" />
              <input placeholder="Compte" id="ecr-compte" className="border rounded px-2 py-1.5" />
              <input placeholder="Libelle" id="ecr-libelle" className="border rounded px-2 py-1.5" />
              <select id="ecr-sens" className="border rounded px-2 py-1.5">
                <option value="D">Debit</option>
                <option value="C">Credit</option>
              </select>
              <input placeholder="Montant" type="number" step="0.001" id="ecr-montant" className="border rounded px-2 py-1.5" />
              <button onClick={async () => {
                const date = (document.getElementById('ecr-date') as HTMLInputElement).value;
                const piece = (document.getElementById('ecr-piece') as HTMLInputElement).value;
                const compte = (document.getElementById('ecr-compte') as HTMLInputElement).value;
                const libelle = (document.getElementById('ecr-libelle') as HTMLInputElement).value;
                const sens = (document.getElementById('ecr-sens') as HTMLSelectElement).value;
                const montant = parseFloat((document.getElementById('ecr-montant') as HTMLInputElement).value) || 0;
                if (!id || !date || !compte || montant <= 0) return alert('Remplir tous les champs');
                await api.scan.addEcriture(id, { date_operation: date, numero_doc: piece, compte, libelle, sens, montant, journal_code: 'VT' });
                (document.getElementById('ecr-montant') as HTMLInputElement).value = '';
                load(true);
              }} className="bg-emerald-500 text-white rounded px-3 py-1.5 hover:bg-emerald-600">+</button>
            </div>
          </div>

          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Journal</th>
                  <th className="px-3 py-2 text-left">N° Piece</th>
                  <th className="px-3 py-2 text-left">Compte</th>
                  <th className="px-3 py-2 text-left">Libelle</th>
                  <th className="px-3 py-2 text-center">D/C</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {ecritures.map(e => (
                  <tr key={e.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-xs">{e.date_operation}</td>
                    <td className="px-3 py-1.5 text-xs font-mono">{e.journal_code}</td>
                    <td className="px-3 py-1.5 text-xs font-mono">{e.numero_doc}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{e.compte}</td>
                    <td className="px-3 py-1.5 text-xs">{e.libelle}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`text-xs font-bold ${e.sens === 'D' ? 'text-blue-600' : 'text-emerald-600'}`}>{e.sens}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{e.sens === 'D' ? (e.montant || 0).toFixed(3) : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{e.sens === 'C' ? (e.montant || 0).toFixed(3) : ''}</td>
                    <td className="px-1">
                      <button onClick={async () => { if (confirm('Supprimer?')) { await api.scan.deleteEcriture(e.id); load(true); } }} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
                {ecritures.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-6">Aucune ecriture</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Export */}
      {tab === 'export' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <h3 className="font-semibold text-gray-700">Export CSV / Axeane</h3>
            <p className="text-sm text-gray-500">Format: N° piece | Date | Journal | Libelle | Compte | Libelle tresorerie | Debit | Credit</p>
            <div className="flex gap-3 items-center">
              <button onClick={() => handleExportCSV()} className="bg-emerald-600 text-white px-4 py-2 rounded text-sm hover:bg-emerald-700">
                <Download size={15} className="inline mr-1" /> Export VT (tous)
              </button>
              <span className="text-sm text-gray-500">{ecritures.length} ecritures a exporter</span>
            </div>
            {ecritures.length > 0 && (
              <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 max-h-48 overflow-auto">
                <table className="w-full">
                  <thead><tr className="text-gray-500"><th className="text-left pr-3">Date</th><th className="text-left pr-3">Piece</th><th className="text-left pr-3">Compte</th><th className="text-right pr-3">D</th><th className="text-right">C</th></tr></thead>
                  <tbody>
                    {ecritures.slice(0, 30).map(e => (
                      <tr key={e.id} className="border-t border-gray-200">
                        <td className="pr-3">{e.date_operation}</td>
                        <td className="pr-3 font-mono">{e.numero_doc}</td>
                        <td className="pr-3 font-mono">{e.compte}</td>
                        <td className="pr-3 text-right font-mono">{e.sens === 'D' ? (e.montant || 0).toFixed(3) : ''}</td>
                        <td className="text-right font-mono">{e.sens === 'C' ? (e.montant || 0).toFixed(3) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ecritures.length > 30 && <div className="text-gray-400 mt-1">... {ecritures.length - 30} lignes de plus</div>}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-700 mb-2">Comptes utilises</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-600 mb-1">Clients (Debit)</h4>
                <ul className="text-xs text-gray-500 space-y-0.5">
                  <li><code>411XXX</code> — Compte client (par tiers)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-600 mb-1">Ventes (Credit)</h4>
                <ul className="text-xs text-gray-500 space-y-0.5">
                  <li><code>707000</code> — Ventes 19%</li>
                  <li><code>707003</code> — Vente suspension TVA</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-600 mb-1">TVA & taxes (Credit)</h4>
                <ul className="text-xs text-gray-500 space-y-0.5">
                  <li><code>436719</code> — TVA collectee 19%</li>
                  <li><code>436780</code> — FODEC</li>
                  <li><code>437600</code> — Timbre fiscal</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
