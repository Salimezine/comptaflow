import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, Download, CheckCircle, FileSpreadsheet, Calculator, Users, ShieldCheck, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { parseFichePersonnel, Employee, PointageData } from '../../lib/baudParser';
import { calculateSalary, SalaryResult } from '../../lib/baudCalculator';
import * as XLSX from 'xlsx';

type Tab = 'navette' | 'employees' | 'controle' | 'calcul' | 'export';

export default function BaudDossierPage() {
  const { id } = useParams<{ id: string }>();
  const [dossier, setDossier] = useState<any>(null);
  const [lignes, setLignes] = useState<any[]>([]);
  const [exports, setExports] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('navette');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  // Parsed data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pointage, setPointage] = useState<PointageData[]>([]);
  const [salaryResults, setSalaryResults] = useState<Map<string, SalaryResult>>(new Map());

  const load = async () => {
    if (!id) return;
    try {
      const d = await api.baud.getDossier(id);
      setDossier(d);
      if (d.societe_id) {
        const l = await api.baud.getLignes(id);
        setLignes(l);
        const e = await api.baud.getExports(id);
        setExports(e);
      }

      // Load parsed data from extraction_json
      if (d.extraction_json) {
        try {
          const ej = JSON.parse(d.extraction_json);
          if (ej.employees) setEmployees(ej.employees);
          if (ej.pointage) setPointage(ej.pointage);
        } catch {}
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

      // Intelligent parsing
      const parsed = parseFichePersonnel(wb, file.name);
      setEmployees(parsed.employees);
      setPointage(parsed.pointage);

      // Store parsed data in extraction_json
      const extractionJson = {
        employees: parsed.employees,
        pointage: parsed.pointage,
        mois: parsed.mois,
        annee: parsed.annee,
        source_file: parsed.source_file,
      };

      // Send to backend
      const lignesData = parsed.employees.map((emp, i) => ({
        source_feuille: 'DP',
        source_ligne: i + 5,
        champs: [emp.matricule, emp.nom, emp.prenom, emp.cin, emp.date_naissance,
                 emp.situation_fam, String(emp.nombre_enfants), emp.fonction,
                 emp.type_contrat, emp.numero_cnss, emp.rib_ou_ccp,
                 String(emp.salaire_brut), String(emp.nouveau_salaire_brut)],
      }));

      await api.baud.upload(dossier.id, file.name, lignesData);

      // Store parsed employees via extraction_json update
      const BASE = import.meta.env.VITE_API_URL || 'https://eurex-api.ezzinesalim21.workers.dev/api';
      await fetch(`${BASE}/baud/dossiers/${dossier.id}/parsed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extractionJson),
      }).catch(() => {});

      setMsg(`${parsed.employees.length} salaries extraits, ${parsed.pointage.length} pointages`);
      await load();
    } catch (e: any) { setMsg('Erreur: ' + e.message); }
    setUploading(false);
  };

  const calculateAll = () => {
    const results = new Map<string, SalaryResult>();
    for (const emp of employees) {
      // Find pointage data for this employee
      const ptg = pointage.find(p => p.matricule === emp.matricule || p.nom === emp.nom);
      const absencesStr = ptg?.absences || '';
      const absences = parseInt(absencesStr) || 0;
      const avances = ptg?.avances || 0;

      // Use nouveau_salaire_brut if available, otherwise salaire_brut
      let brut = emp.nouveau_salaire_brut > 0 ? emp.nouveau_salaire_brut : emp.salaire_brut;

      // Prorata if absences (22 working days/month)
      if (absences > 0) {
        brut = Math.round(brut * (22 - absences) / 22 * 1000) / 1000;
      }

      const result = calculateSalary({
        salaire_brut: brut,
        situation_fam: emp.situation_fam,
        nombre_enfants: emp.nombre_enfants,
        absences_jours: absences,
        avances,
      });

      results.set(emp.matricule, result);
    }
    setSalaryResults(results);
    setTab('calcul');
    setMsg(`${results.size} salaries calcules`);
  };

  const generateSageExport = async () => {
    if (!dossier || salaryResults.size === 0) { setMsg('Calculez d\'abord les salaires'); return; }
    setGenerating(true); setMsg('');
    try {
      // Build XLSX for Sage Paie 100 import
      const salRows: any[][] = [['Matricule', 'Nom', 'Prenom', 'Civilité', 'Date de naissance', 'Date d\'embauche', 'Poste', 'Type de contrat', 'Situation familiale', 'Nombre enfants', 'CNSS', 'RIB', 'Salaire base']];
      const varRows: any[][] = [['Matricule', 'Rubrique ou Constante', 'Zone', 'Valeur']];

      for (const emp of employees) {
        const result = salaryResults.get(emp.matricule);
        if (!result) continue;

        // Employee row
        salRows.push([
          emp.matricule, emp.nom, emp.prenom, '',
          emp.date_naissance, emp.date_recrutement, emp.fonction, emp.type_contrat,
          emp.situation_fam, emp.nombre_enfants, emp.numero_cnss, emp.rib_ou_ccp,
          result.salaire_brut,
        ]);

        // Variables rows
        varRows.push([emp.matricule, 'SBASE', '1', result.salaire_brut]);
        if (result.cnss_salariale > 0) varRows.push([emp.matricule, 'CSSAL', '3', result.cnss_salariale]);
        if (result.irpp > 0) varRows.push([emp.matricule, 'IRPP', '3', result.irpp]);
        if (result.css_salariale > 0) varRows.push([emp.matricule, 'CSS', '3', result.css_salariale]);

        // Pointage data
        const ptg = pointage.find(p => p.matricule === emp.matricule || p.nom === emp.nom);
        if (ptg) {
          if (ptg.avances > 0) varRows.push([emp.matricule, 'AVANCE', '3', ptg.avances]);
          if (ptg.absences) {
            const absJours = parseInt(ptg.absences) || 0;
            if (absJours > 0) varRows.push([emp.matricule, 'ABSENCE', '0', absJours]);
          }
          if (ptg.conges_payes) {
            const cpJours = parseInt(ptg.conges_payes) || 0;
            if (cpJours > 0) varRows.push([emp.matricule, 'CP', '0', cpJours]);
          }
          if (ptg.heures_supplementaires) {
            const hs = parseFloat(ptg.heures_supplementaires) || 0;
            if (hs > 0) varRows.push([emp.matricule, 'HSUP', '0', hs]);
          }
        }
      }

      // Generate and download XLSX directly
      const moisStr = String(dossier.mois).padStart(2, '0');
      const annStr = String(dossier.annee).slice(-2);

      const salWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(salWb, XLSX.utils.aoa_to_sheet(salRows), 'Salariés');
      const salB64 = XLSX.write(salWb, { type: 'base64', bookType: 'xlsx' });

      const varWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(varWb, XLSX.utils.aoa_to_sheet(varRows), 'Variables');
      const varB64 = XLSX.write(varWb, { type: 'base64', bookType: 'xlsx' });

      // Download both files
      const downloadB64 = (b64: string, filename: string) => {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      };

      downloadB64(salB64, `ImportSalaries_${moisStr}-${annStr}.xlsx`);
      setTimeout(() => downloadB64(varB64, `ImportVariables_${moisStr}-${annStr}.xlsx`), 500);

      setMsg(`${salRows.length - 1} salaries + ${varRows.length - 1} variables exportes`);
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

  const handleVerifyAI = async () => {
    if (!dossier || employees.length === 0) return;
    setVerifying(true); setVerifyResult(null);
    try {
      const salaryObj: Record<string, SalaryResult> = {};
      salaryResults.forEach((v, k) => { salaryObj[k] = v; });

      const BASE = import.meta.env.VITE_API_URL || 'https://eurex-api.ezzinesalim21.workers.dev/api';
      const res = await fetch(`${BASE}/baud/dossiers/${dossier.id}/verify-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees, pointage, salaryResults: salaryObj }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch (e: any) { setVerifyResult({ verdict: 'ERREUR', error: e.message }); }
    setVerifying(false);
  };

  if (!dossier) return <div className="mt-8 text-gray-400 text-sm">Chargement...</div>;

  const tabs = [
    { key: 'navette', label: 'Import', icon: Upload },
    { key: 'employees', label: `Salaries (${employees.length})`, icon: Users },
    { key: 'controle', label: `Controle IA`, icon: ShieldCheck },
    { key: 'calcul', label: `Calcul (${salaryResults.size})`, icon: Calculator },
    { key: 'export', label: `Export Sage (${exports.length})`, icon: FileSpreadsheet },
  ] as const;

  const totalBrut = Array.from(salaryResults.values()).reduce((s, r) => s + r.salaire_brut, 0);
  const totalNet = Array.from(salaryResults.values()).reduce((s, r) => s + r.net_a_payer, 0);
  const totalCNSS = Array.from(salaryResults.values()).reduce((s, r) => s + r.cnss_salariale, 0);
  const totalIRPP = Array.from(salaryResults.values()).reduce((s, r) => s + r.irpp, 0);

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

      {/* TAB: IMPORT */}
      {tab === 'navette' && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          {dossier.fichier_navette_nom && (
            <p className="text-sm text-green-600">Fichier: {dossier.fichier_navette_nom}</p>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Fichier "Liste du personnel" (.xls/.xlsx)</label>
              <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full text-sm mt-1" />
            </div>
            <button onClick={uploadFile} disabled={!file || uploading}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
              <Upload size={14} />{uploading ? 'Analyse...' : 'Parser + Extraire'}
            </button>
          </div>
          <p className="text-xs text-gray-400">Extraction intelligente: detecte automatiquement les colonnes DP + Pointage</p>
        </div>
      )}

      {/* TAB: EMPLOYEES */}
      {tab === 'employees' && (
        <div className="space-y-4">
          {employees.length > 0 ? (
            <>
              <div className="flex gap-2">
                <button onClick={calculateAll}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center gap-1">
                  <Calculator size={14} />Calculer les salaires
                </button>
                <span className="text-xs text-gray-400 self-center">{employees.length} salaries</span>
              </div>
              <div className="bg-white border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                    <th className="p-2">Mat</th><th className="p-2">Nom</th><th className="p-2">Prenom</th>
                    <th className="p-2">CIN</th><th className="p-2">SF</th><th className="p-2">NE</th>
                    <th className="p-2">Fonction</th><th className="p-2">Contrat</th>
                    <th className="p-2 text-right">Brut</th><th className="p-2 text-right">Nouv Brut</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {employees.map((emp) => (
                      <tr key={emp.matricule} className="hover:bg-gray-50">
                        <td className="p-2 font-mono text-xs">{emp.matricule}</td>
                        <td className="p-2 text-xs">{emp.nom}</td>
                        <td className="p-2 text-xs">{emp.prenom}</td>
                        <td className="p-2 text-xs">{emp.cin}</td>
                        <td className="p-2 text-xs">{emp.situation_fam}</td>
                        <td className="p-2 text-xs text-center">{emp.nombre_enfants}</td>
                        <td className="p-2 text-xs">{emp.fonction}</td>
                        <td className="p-2 text-xs">{emp.type_contrat}</td>
                        <td className="p-2 text-right font-mono text-xs">{emp.salaire_brut.toFixed(3)}</td>
                        <td className="p-2 text-right font-mono text-xs">{emp.nouveau_salaire_brut > 0 ? emp.nouveau_salaire_brut.toFixed(3) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">Aucun salary. Uploadez d'abord un fichier "Liste du personnel".</p>
          )}
        </div>
      )}

      {/* TAB: CONTROLE IA */}
      {tab === 'controle' && (
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <ShieldCheck size={20} className="text-blue-600" />
              <div>
                <h3 className="font-medium text-sm">Verification IA</h3>
                <p className="text-xs text-gray-400">Verifie les calculs, detecte les anomalies et les salaries manquants</p>
              </div>
              <button onClick={handleVerifyAI} disabled={verifying || employees.length === 0}
                className="ml-auto px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                <ShieldCheck size={14} />{verifying ? 'Verification...' : 'Verifier avec IA'}
              </button>
            </div>
          </div>

          {verifyResult && !verifyResult.error && (
            <div className={`rounded-lg border p-4 ${verifyResult.verdict === 'OK' ? 'bg-green-50 border-green-200' : verifyResult.verdict === 'ATTENTION' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {verifyResult.verdict === 'OK' ? <CheckCircle size={18} className="text-green-600" /> : <AlertTriangle size={18} className={verifyResult.verdict === 'ATTENTION' ? 'text-amber-600' : 'text-red-600'} />}
                <span className={`font-semibold ${verifyResult.verdict === 'OK' ? 'text-green-700' : verifyResult.verdict === 'ATTENTION' ? 'text-amber-700' : 'text-red-700'}`}>
                  {verifyResult.verdict}
                </span>
              </div>

              {verifyResult.checks?.length > 0 && (
                <div className="space-y-1 mb-3">
                  {verifyResult.checks.map((c: any, i: number) => (
                    <div key={i} className={`flex items-start gap-2 text-xs ${c.status === 'error' ? 'text-red-600' : c.status === 'warning' ? 'text-amber-600' : 'text-green-600'}`}>
                      <span>{c.status === 'ok' ? '✓' : c.status === 'warning' ? '⚠' : '✗'}</span>
                      <span><strong>{c.name}:</strong> {c.detail}</span>
                    </div>
                  ))}
                </div>
              )}

              {verifyResult.missing?.length > 0 && (
                <div className="text-xs text-red-600 mb-2">
                  <strong>Salaries manquants:</strong> {verifyResult.missing.join(', ')}
                </div>
              )}

              {verifyResult.changes?.length > 0 && (
                <div className="text-xs text-amber-600 mb-2">
                  <strong>Modifications:</strong>
                  <ul className="list-disc list-inside">{verifyResult.changes.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}

              {verifyResult.anomalies?.length > 0 && (
                <div className="text-xs text-red-600 mb-2">
                  <strong>Anomalies:</strong>
                  <ul className="list-disc list-inside">{verifyResult.anomalies.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {verifyResult?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{verifyResult.error}</div>
          )}

          {employees.length > 0 && salaryResults.size === 0 && (
            <p className="text-sm text-amber-600">Calculez d'abord les salaries (onglet Salaries) avant de verifier.</p>
          )}
        </div>
      )}

      {/* TAB: CALCUL */}
      {tab === 'calcul' && (
        <div className="space-y-4">
          {salaryResults.size > 0 ? (
            <>
              {/* Resume */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <div className="text-xs text-blue-600">Total Brut</div>
                  <div className="text-lg font-bold text-blue-800">{totalBrut.toFixed(3)}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <div className="text-xs text-red-600">CNSS + IRPP</div>
                  <div className="text-lg font-bold text-red-800">{(totalCNSS + totalIRPP).toFixed(3)}</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <div className="text-xs text-green-600">Total Net</div>
                  <div className="text-lg font-bold text-green-800">{totalNet.toFixed(3)}</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                  <div className="text-xs text-purple-600">Salaries</div>
                  <div className="text-lg font-bold text-purple-800">{salaryResults.size}</div>
                </div>
              </div>

              <div className="bg-white border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                    <th className="p-2">Mat</th><th className="p-2">Nom</th>
                    <th className="p-2 text-right">Brut</th>
                    <th className="p-2 text-right">CNSS</th>
                    <th className="p-2 text-right">IRPP</th>
                    <th className="p-2 text-right">CSS</th>
                    <th className="p-2 text-right">Net</th>
                    <th className="p-2 text-right">Net a payer</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {employees.map(emp => {
                      const r = salaryResults.get(emp.matricule);
                      if (!r) return null;
                      return (
                        <tr key={emp.matricule} className="hover:bg-gray-50">
                          <td className="p-2 font-mono text-xs">{emp.matricule}</td>
                          <td className="p-2 text-xs">{emp.nom} {emp.prenom}</td>
                          <td className="p-2 text-right font-mono text-xs">{r.salaire_brut.toFixed(3)}</td>
                          <td className="p-2 text-right font-mono text-xs text-red-600">{r.cnss_salariale.toFixed(3)}</td>
                          <td className="p-2 text-right font-mono text-xs text-red-600">{r.irpp.toFixed(3)}</td>
                          <td className="p-2 text-right font-mono text-xs text-red-600">{r.css_salariale.toFixed(3)}</td>
                          <td className="p-2 text-right font-mono text-xs">{r.salaire_net.toFixed(3)}</td>
                          <td className="p-2 text-right font-mono text-xs font-bold text-green-700">{r.net_a_payer.toFixed(3)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">Aucun calcul. Allez dans "Salaries" et cliquez "Calculer les salaires".</p>
          )}
        </div>
      )}

      {/* TAB: EXPORT */}
      {tab === 'export' && (
        <div className="space-y-4">
          <button onClick={generateSageExport} disabled={generating || salaryResults.size === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50">
            {generating ? 'Generation...' : 'Generer fichiers Sage Paie 100'}
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
