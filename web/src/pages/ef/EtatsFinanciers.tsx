import { useState, useRef } from 'react';
import { ArrowLeft, Download, Copy, CheckCircle, Upload, FileSpreadsheet, BrainCircuit, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

type BalanceLigne = { compte: string; libelle: string; debit: number; credit: number; solde: number };

function parseBalanceCSV(text: string): BalanceLigne[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  const result: BalanceLigne[] = [];
  const parseNum = (s: string) => {
    if (!s || s === '' || s === '-') return 0;
    return parseFloat(s.replace(/["\s]/g, '').replace(',', '.')) || 0;
  };

  // Detect header for column layout
  let debitIdx = -1, creditIdx = -1, soldeIdx = -1, compteIdx = 0, libIdx = 1;
  if (lines.length > 0) {
    const headerParts = lines[0].split(/[;,]/).map(s => s.trim().toUpperCase().replace(/\s/g, ''));
    for (let i = 0; i < headerParts.length; i++) {
      const h = headerParts[i];
      if (h.includes('N°COMPTE') || h.includes('NOCOMPTE') || h === 'COMPTE' || h === 'NCOMPTE' || h === 'NUMERO') compteIdx = i;
      else if (h.includes('LIBELL') || h.includes('LIBILLE') || h === 'LIBELLE') libIdx = i;
      else if (h === 'DEBIT') debitIdx = i;
      else if (h === 'CREDIT') creditIdx = i;
      else if (h === 'SLD' || h === 'SOLDE') soldeIdx = i;
    }
  }
  const hasFixedCols = debitIdx !== -1 || creditIdx !== -1 || soldeIdx !== -1;

  for (let ri = hasFixedCols ? 1 : 0; ri < lines.length; ri++) {
    const line = lines[ri];
    const parts = line.split(/[;,]/).map(s => s.trim());
    if (parts.length < 2) continue;
    let acctIdx = -1;
    for (let i = 0; i < Math.min(parts.length, 4); i++) {
      const cleaned = parts[i].replace(/\D/g, '');
      if (cleaned.length >= 4 && !isNaN(parseInt(cleaned))) { acctIdx = i; break; }
    }
    if (acctIdx === -1) continue;
    const raw = parts[acctIdx].replace(/\D/g, '');
    const compte = raw.length > 6 ? raw.slice(0, 6) : raw;
    const lib = acctIdx + 1 < parts.length ? parts[acctIdx + 1].replace(/"/g, '').trim() : '';

    let debit = 0, credit = 0, solde = 0;
    if (hasFixedCols) {
      debit = debitIdx !== -1 ? parseNum(parts[debitIdx]) : 0;
      credit = creditIdx !== -1 ? parseNum(parts[creditIdx]) : 0;
      solde = soldeIdx !== -1 ? parseNum(parts[soldeIdx]) : (debit - credit);
    } else {
      const numVals: number[] = [];
      for (let i = acctIdx + 2; i < parts.length; i++) {
        if (parts[i] !== '' && parts[i] !== null) numVals.push(parseNum(parts[i]));
      }
      if (numVals.length >= 3) { debit = numVals[0]; credit = numVals[1]; solde = numVals[2]; }
      else if (numVals.length === 2) { debit = numVals[0]; credit = numVals[1]; solde = numVals[0] - numVals[1]; }
      else if (numVals.length === 1) { solde = numVals[0]; }
    }
    result.push({ compte, libelle: lib, debit, credit, solde });
  }
  return result;
}

async function parseBalanceXLSX(data: ArrayBuffer): Promise<BalanceLigne[]> {
  const XLSXMod = await import('xlsx');
  const XLSX = XLSXMod.default || XLSXMod;
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const result: BalanceLigne[] = [];
  const parseNum = (v: any) => {
    if (v === null || v === undefined || v === '' || v === '-') return 0;
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace(/\s/g, '').replace(',', '.')) || 0;
  };

  // Detect column layout from header
  let debitIdx = -1, creditIdx = -1, soldeIdx = -1, compteIdx = 0, libIdx = 1;
  const header = rows[0] || [];
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] || '').toUpperCase().replace(/\s/g, '');
    if (h.includes('N°COMPTE') || h.includes('NOCOMPTE') || h === 'COMPTE') compteIdx = i;
    else if (h.includes('LIBELL') || h.includes('LIBILLE') || h === 'LIBELLE') libIdx = i;
    else if (h === 'DEBIT' || h === 'DEBITSSOLD') debitIdx = i;
    else if (h === 'CREDIT' || h === 'CREDITSSOLD') creditIdx = i;
    else if (h === 'SLD' || h === 'SOLDE' || h === 'SOLDES' || h === 'SLDSOLD') soldeIdx = i;
  }

  // Check if we detected a header with D/C/S columns
  const hasFixedCols = debitIdx !== -1 || creditIdx !== -1 || soldeIdx !== -1;

  for (let ri = hasFixedCols ? 1 : 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || row.length < 2) continue;
    let acctIdx = -1;
    for (let i = 0; i < Math.min(row.length, 4); i++) {
      const cleaned = String(row[i] || '').replace(/\D/g, '');
      if (cleaned.length >= 4 && !isNaN(parseInt(cleaned))) { acctIdx = i; break; }
    }
    if (acctIdx === -1) continue;
    const raw = String(row[acctIdx]).replace(/\D/g, '');
    const compte = raw.length > 6 ? raw.slice(0, 6) : raw;
    const lib = acctIdx + 1 < row.length ? String(row[acctIdx + 1] || '').trim() : '';

    let debit = 0, credit = 0, solde = 0;
    if (hasFixedCols) {
      debit = debitIdx !== -1 ? parseNum(row[debitIdx]) : 0;
      credit = creditIdx !== -1 ? parseNum(row[creditIdx]) : 0;
      solde = soldeIdx !== -1 ? parseNum(row[soldeIdx]) : (debit - credit);
    } else {
      // No header: detect by position
      const numVals: number[] = [];
      for (let i = acctIdx + 2; i < row.length; i++) {
        if (row[i] === null || row[i] === undefined || row[i] === '') continue;
        numVals.push(parseNum(row[i]));
      }
      if (numVals.length >= 3) { debit = numVals[0]; credit = numVals[1]; solde = numVals[2]; }
      else if (numVals.length === 2) { debit = numVals[0]; credit = numVals[1]; solde = numVals[0] - numVals[1]; }
      else if (numVals.length === 1) { solde = numVals[0]; }
    }
    result.push({ compte, libelle: lib, debit, credit, solde });
  }
  return result;
}

function sumSolde(lignes: BalanceLigne[], prefixes: string[], onlyDebit = false, onlyCredit = false): number {
  return lignes
    .filter(l => prefixes.some(p => l.compte.startsWith(p)))
    .reduce((s, l) => {
      if (onlyDebit && l.solde < 0) return s;
      if (onlyCredit && l.solde > 0) return s;
      return s + l.solde;
    }, 0);
}

function sumSoldeAbs(lignes: BalanceLigne[], prefixes: string[]): number {
  return lignes
    .filter(l => prefixes.some(p => l.compte.startsWith(p)))
    .reduce((s, l) => s + Math.abs(l.solde), 0);
}

function sumDebit(lignes: BalanceLigne[], prefixes: string[]): number {
  return lignes
    .filter(l => prefixes.some(p => l.compte.startsWith(p)))
    .reduce((s, l) => s + (l.solde > 0 ? l.solde : 0), 0);
}

function sumCredit(lignes: BalanceLigne[], prefixes: string[]): number {
  return lignes
    .filter(l => prefixes.some(p => l.compte.startsWith(p)))
    .reduce((s, l) => s + (l.solde < 0 ? Math.abs(l.solde) : 0), 0);
}

type EFType = 'actif' | 'passif' | 'resultat' | 'tab-amt' | 'flux' | 'sig' | 'fisc';

const EF_TYPES: { key: EFType; label: string; icon: string; desc: string }[] = [
  { key: 'resultat', label: 'Etat des soldes de gestion', icon: '📊', desc: 'Produits et charges - Resultat net' },
  { key: 'actif', label: 'Bilan (Actif)', icon: '🏢', desc: 'Actifs non courants et courants' },
  { key: 'passif', label: 'Bilan (Passif)', icon: '📋', desc: 'Capitaux propres et passifs' },
  { key: 'tab-amt', label: 'Tableau des Immobilisations', icon: '🏗️', desc: 'VB, acquisitions, cessions, amortissements' },
  { key: 'flux', label: 'Tableau des Flux de Tresorerie', icon: '💧', desc: 'Flux exploitation, investissement, financement' },
  { key: 'sig', label: 'Soldes Intermediaires de Gestion', icon: '📈', desc: 'Marge, EBE, resultat' },
  { key: 'fisc', label: 'Resultat Fiscal', icon: '🏛️', desc: 'Determination du resultat fiscal et IS' },
];

function fmt(n: number): string {
  if (n === 0) return '-';
  return n.toLocaleString('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtCell(n: number): string {
  if (!n && n !== 0) return '';
  if (n === 0) return '0';
  return n.toLocaleString('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

type InputProps = {
  value: number;
  onChange: (v: number) => void;
  className?: string;
};

function NumInput({ value, onChange, className = '' }: InputProps) {
  return (
    <input type="number" step="any" value={value || ''}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={`w-full text-right font-mono text-xs bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none ${className}`} />
  );
}

export default function EtatsFinanciers() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<EFType | null>(null);
  const [copied, setCopied] = useState(false);
  const [nomSociete, setNomSociete] = useState('SCANFLASH');
  const [anneeN, setAnneeN] = useState(2025);
  const [showImport, setShowImport] = useState(false);
  const [balanceCount, setBalanceCount] = useState(0);
  const [balanceN1Count, setBalanceN1Count] = useState(0);
  const [balanceN, setBalanceN] = useState<BalanceLigne[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileRefN1 = useRef<HTMLInputElement>(null);

  // ===== IMPORT BALANCE → AUTO-FILL EF =====
  const applyBalance = (lignes: BalanceLigne[]) => {
    setBalanceN(lignes);
    // ACTIF
    setActif({
      immoIncorpBrut: sumDebit(lignes, ['21']),
      immoIncorpAmort: sumCredit(lignes, ['281', '291', '2931']),
      immoCorpBrut: sumDebit(lignes, ['22', '23', '24']),
      immoCorpAmort: sumCredit(lignes, ['282', '284', '292', '2932', '2938', '294']),
      immoFinancBrut: sumDebit(lignes, ['25', '26']),
      immoFinancProv: sumCredit(lignes, ['295', '296', '297']),
      autresActifsNonCourants: sumDebit(lignes, ['27']),
      stocks: sumDebit(lignes, ['31', '32', '33', '34', '35', '36', '37']),
      stocksProv: sumCredit(lignes, ['39']),
      clients: sumDebit(lignes, ['41']),
      clientsProv: sumCredit(lignes, ['491']),
      autresActifsCourants: sumDebit(lignes, ['42', '43', '44', '45', '47', '48'])
        - sumCredit(lignes, ['491', '495', '496']),
      tresorerie: sumDebit(lignes, ['53', '54', '51', '52', '55']) - sumCredit(lignes, ['59']),
    });
    // PASSIF — compute resultatExercice from income statement (balance may not be closed)
    const autresPassif = sumCredit(lignes, ['101'])
      + sumCredit(lignes, ['111', '112', '117', '118'])
      + sumCredit(lignes, ['121', '128'])
      + sumCredit(lignes, ['16'])
      + sumCredit(lignes, ['18'])
      + sumCredit(lignes, ['15'])
      + sumCredit(lignes, ['40'])
      + sumCredit(lignes, ['419', '422', '423', '425', '427', '428', '432', '433', '434', '435', '436', '437', '438', '441', '442', '447', '448', '453', '454', '457', '458', '46', '472', '48'])
      + sumCredit(lignes, ['501', '505', '506', '507', '508', '532', '537']);
    const totalActifCalc = (sumDebit(lignes, ['21']) - sumCredit(lignes, ['281', '291', '2931']))
      + (sumDebit(lignes, ['22', '23', '24']) - sumCredit(lignes, ['282', '284', '292', '2932', '2938', '294']))
      + (sumDebit(lignes, ['25', '26']) - sumCredit(lignes, ['295', '296', '297']))
      + sumDebit(lignes, ['27'])
      + (sumDebit(lignes, ['31', '32', '33', '34', '35', '36', '37']) - sumCredit(lignes, ['39']))
      + (sumDebit(lignes, ['41']) - sumCredit(lignes, ['491']))
      + (sumDebit(lignes, ['42', '43', '44', '45', '47', '48']) - sumCredit(lignes, ['491', '495', '496']))
      + (sumDebit(lignes, ['53', '54', '51', '52', '55']) - sumCredit(lignes, ['59']));
    const resultatFromIncome = totalActifCalc - autresPassif;
    setPassif({
      capitalSocial: sumCredit(lignes, ['101']),
      reserves: sumCredit(lignes, ['111', '112', '117', '118']),
      resultatsReportes: sumCredit(lignes, ['121', '128']),
      resultatExercice: Math.abs(resultatFromIncome),
      emprunts: sumCredit(lignes, ['16']),
      autresPassifsFinanciers: sumCredit(lignes, ['18']),
      provisions: sumCredit(lignes, ['15']),
      fournisseurs: sumCredit(lignes, ['40']),
      autresPassifsCourants: sumCredit(lignes, ['419', '422', '423', '425', '427', '428', '432', '433', '434', '435', '436', '437', '438', '441', '442', '447', '448', '453', '454', '457', '458', '46', '472', '48']),
      concoursBancaires: sumCredit(lignes, ['501', '505', '506', '507', '508', '532', '537']),
    });
    // RESULTAT — flip sign: products (70x) are credit=negative in balance, but positive in PCG presentation
    const prod = (prefixes: string[]) => -sumSolde(lignes, prefixes); // flip: negative→positive
    const charge = (prefixes: string[]) => Math.abs(sumSolde(lignes, prefixes)); // always positive
    setResultat({
      revenus: prod(['70']),
      autresProduitsExploit: prod(['72', '731', '732', '733', '734', '738', '781', '79']),
      transfertCharges: 0,
      achatsConsommes: charge(['60']),
      chargesPersonnel: charge(['64']),
      dotationsAmort: charge(['681']),
      autresChargesExploit: charge(['606', '61', '62', '63', '66']),
      chargesFinancieres: charge(['65', '6865', '6861']),
      produitsPlacements: prod(['75', '7866']),
      autresGainsOrdinaires: prod(['736', '735', '739']),
      autresPertesOrdinaires: charge(['633', '634', '635', '636', '637', '638']),
      impotBenefices: charge(['691', '697']),
      elementsExtraordinaires: prod(['77', '67']),
    });
    // SIG — same flip
    setSig({
      ventesMarchandises: prod(['707', '7097']),
      cAchatMarchandises: charge(['607', '6037']),
      revenus: prod(['701', '702', '703', '704', '705', '706', '708']),
      productionStockee: prod(['71']),
      achatsConsommes: charge(['601', '602', '604', '605', '606', '6031', '6032']),
      subventionExploit: prod(['74']),
      autresChargesExternes: charge(['606', '61', '62', '631']),
      impotsTaxes: charge(['66']),
      chargesPersonnel: charge(['64']),
      chargesFinancieres: charge(['65', '6865', '6861']),
      produitsPlacements: prod(['75', '7866']),
      autresGainsOrdinaires: prod(['735', '736', '739', '79']),
      autresPertesOrdinaires: charge(['633', '634', '635', '636', '637', '638']),
      transfertRepriseCharges: prod(['78']) - charge(['68']),
      dotationsAmortProvisions: charge(['68']),
      impotBenefices: charge(['691', '697']),
    });
    setBalanceCount(lignes.length);
    // ===== TAB AMT AUTO-FILL from balance =====
    const findAmort = (code: string) => {
      const trySwap = code.slice(0, 2) === '22' ? '28' + code.slice(2) : '';
      const match = trySwap ? lignes.find(l => l.compte === trySwap) : null;
      return match ? Math.abs(match.solde) : 0;
    };
    const immoCorpAccounts = lignes.filter(l => l.compte.startsWith('22') && Math.abs(l.solde) > 0);
    const immoLines: LigneImob[] = [];
    for (const acc of immoCorpAccounts) {
      const name = acc.libelle || acc.compte;
      const amort = findAmort(acc.compte);
      immoLines.push({ cat: name, vbN: Math.abs(acc.solde), acq: 0, ces: 0, dot: amort, reg: 0, vbN1: 0, amortN1: 0 });
    }
    if (immoLines.length > 0) {
      immoLines.push({ cat: 'Immobilisations incorporelles', vbN: sumDebit(lignes, ['21']), acq: 0, ces: 0, dot: sumCredit(lignes, ['281', '291']), reg: 0, vbN1: 0, amortN1: 0 });
      immoLines.push({ cat: 'Immobilisations corporelles (total)', vbN: sumDebit(lignes, ['22', '23', '24']), acq: 0, ces: 0, dot: sumCredit(lignes, ['282', '284', '292']), reg: 0, vbN1: 0, amortN1: 0 });
      immoLines.push({ cat: 'Immobilisations financières', vbN: sumDebit(lignes, ['25', '26']), acq: 0, ces: 0, dot: sumCredit(lignes, ['295', '296', '297']), reg: 0, vbN1: 0, amortN1: 0 });
      setImmob(immoLines);
      setImmobCount(immoLines.length);
    }
    // ===== FLUX AUTO-FILL from N vs N-1 (if N-1 already loaded) =====
    if (balanceN1.length > 0) {
      const stocksNA = sumDebit(lignes, ['31', '32', '33', '34', '35', '36', '37']);
      const stocksN1A = sumDebit(balanceN1, ['31', '32', '33', '34', '35', '36', '37']);
      const clientsNA = sumDebit(lignes, ['41']);
      const clientsN1A = sumDebit(balanceN1, ['41']);
      const frsNA = sumCredit(lignes, ['40']);
      const frsN1A = sumCredit(balanceN1, ['40']);
      const autresActifsNA = sumDebit(lignes, ['42', '43', '44', '45', '47', '48']);
      const autresActifsN1A = sumDebit(balanceN1, ['42', '43', '44', '45', '47', '48']);
      const dotN = sumSolde(lignes, ['68']);
      const prodRes = -sumSolde(lignes, ['70']);
      const chargesRes = Math.abs(sumSolde(lignes, ['60', '61', '62', '63', '64', '66', '681']));
      setFlux(prev => ({
        ...prev,
        variationStocks: stocksNA - stocksN1A,
        variationCreances: clientsNA - clientsN1A,
        variationFournisseurs: frsN1A - frsNA,
        variationAutresActifs: autresActifsN1A - autresActifsNA,
        dotationsProvisions: dotN,
        resultatNet: prodRes - chargesRes,
      }));
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'txt') {
      const text = await file.text();
      const lignes = parseBalanceCSV(text);
      applyBalance(lignes);
    } else if (ext === 'xls' || ext === 'xlsx') {
      const buf = await file.arrayBuffer();
      const lignes = await parseBalanceXLSX(buf);
      applyBalance(lignes);
    }
    e.target.value = '';
  };

  // ===== N-1 BALANCE → FLUX VARIATIONS =====
  const [balanceN1, setBalanceN1] = useState<BalanceLigne[]>([]);

  const applyBalanceN1 = (lignes: BalanceLigne[]) => {
    if (lignes.length === 0) return;

    const hasN = balanceN.length > 0;

    // Auto-fill Flux variations from N vs N-1
    const stocksN = hasN ? sumSoldeAbs(balanceN, ['31', '32', '33', '34', '35', '36', '37']) : actif.stocks;
    const stocksN1 = sumSoldeAbs(lignes, ['31', '32', '33', '34', '35', '36', '37']);
    const clientsN = hasN ? sumSoldeAbs(balanceN, ['41']) : actif.clients;
    const clientsN1 = sumSoldeAbs(lignes, ['41']);
    const frsN = hasN ? sumSoldeAbs(balanceN, ['40']) : passif.fournisseurs;
    const frsN1 = sumSoldeAbs(lignes, ['40']);
    const autresActifsN = hasN ? sumSoldeAbs(balanceN, ['42', '43', '44', '45', '47']) : actif.autresActifsCourants;
    const autresActifsN1 = sumSoldeAbs(lignes, ['42', '43', '44', '45', '47']);

    // Dotations N-1
    const dotN1 = sumSolde(lignes, ['68']);

    // Resultat N-1 — use same sign convention as RESULTAT tab
    const prodN1 = -sumSolde(lignes, ['70']); // flip: credit→positive
    const chargesN1 = Math.abs(sumSolde(lignes, ['60', '61', '62', '63', '64', '66', '681'])); // always positive

    setFlux(prev => ({
      ...prev,
      variationStocks: stocksN - stocksN1,
      variationCreances: clientsN - clientsN1,
      variationFournisseurs: frsN1 - frsN,
      variationAutresActifs: autresActifsN1 - autresActifsN,
      dotationsProvisions: dotN1,
      resultatNet: prodN1 - chargesN1,
    }));

    // Auto-fill Tab AMT from N vs N-1 (immo brut & amort)
    const immoCorpBrutN = hasN ? sumSoldeAbs(balanceN, ['22', '23', '24']) : actif.immoCorpBrut;
    const immoCorpBrutN1 = sumSoldeAbs(lignes, ['22', '23', '24']);
    const immoCorpAmortN = hasN ? sumSoldeAbs(balanceN, ['282', '284', '292', '2932', '2938', '294']) : actif.immoCorpAmort;
    const immoCorpAmortN1 = sumSoldeAbs(lignes, ['282', '284', '292', '2932', '2938', '294']);

    const immoIncorpBrutN = hasN ? sumSoldeAbs(balanceN, ['21']) : actif.immoIncorpBrut;
    const immoIncorpBrutN1 = sumSoldeAbs(lignes, ['21']);
    const immoIncorpAmortN = hasN ? sumSoldeAbs(balanceN, ['281', '291', '2931']) : actif.immoIncorpAmort;
    const immoIncorpAmortN1 = sumSoldeAbs(lignes, ['281', '291', '2931']);

    // Also fill N-1 for individual 22x immo lines
    const findAmortN1 = (immoCode: string) => {
      const trySwap = immoCode.slice(0, 2) === '22' ? '28' + immoCode.slice(2) : '';
      const match = trySwap ? lignes.find(l => l.compte === trySwap) : null;
      return match ? Math.abs(match.solde) : 0;
    };
    setImmob(prev => prev.map((l, i) => {
      // Last 3 lines are summary (immo incorp, corp total, financ)
      if (i === prev.length - 3) return { ...l, vbN1: immoIncorpBrutN1, amortN1: immoIncorpAmortN1 };
      if (i === prev.length - 2) return { ...l, vbN1: immoCorpBrutN1, amortN1: immoCorpAmortN1 };
      if (i === prev.length - 1) {
        const immoFinancBrutN1 = sumSoldeAbs(lignes, ['25', '26']);
        const immoFinancAmortN1 = sumCredit(lignes, ['295', '296', '297']);
        return { ...l, vbN1: immoFinancBrutN1, amortN1: immoFinancAmortN1 };
      }
      // Dynamic individual 22x lines
      const acc = balanceN.find(a => l.cat === (a.libelle || a.compte));
      if (acc && acc.compte.startsWith('22')) {
        return { ...l, vbN1: Math.abs(acc.solde), amortN1: findAmortN1(acc.compte) };
      }
      return l;
    }));

    // Auto-fill Bilan N-1 (actif + passif) from balance
    setActifN1({
      immoIncorpBrut: sumDebit(lignes, ['21']),
      immoIncorpAmort: sumCredit(lignes, ['281', '291', '2931']),
      immoCorpBrut: sumDebit(lignes, ['22', '23', '24']),
      immoCorpAmort: sumCredit(lignes, ['282', '284', '292', '2932', '2938', '294']),
      immoFinancBrut: sumDebit(lignes, ['25', '26']),
      immoFinancProv: sumCredit(lignes, ['295', '296', '297']),
      autresActifsNonCourants: sumDebit(lignes, ['27']),
      stocks: sumDebit(lignes, ['31', '32', '33', '34', '35', '36', '37']),
      stocksProv: sumCredit(lignes, ['39']),
      clients: sumDebit(lignes, ['41']),
      clientsProv: sumCredit(lignes, ['491']),
      autresActifsCourants: sumDebit(lignes, ['42', '43', '44', '45', '47', '48'])
        - sumCredit(lignes, ['491', '495', '496']),
      tresorerie: sumDebit(lignes, ['53', '54', '51', '52', '55']) - sumCredit(lignes, ['59']),
    });

    const autresPassifN1 = sumCredit(lignes, ['101'])
      + sumCredit(lignes, ['111', '112', '117', '118'])
      + sumCredit(lignes, ['121', '128'])
      + sumCredit(lignes, ['16'])
      + sumCredit(lignes, ['18'])
      + sumCredit(lignes, ['15'])
      + sumCredit(lignes, ['40'])
      + sumCredit(lignes, ['419', '422', '423', '425', '427', '428', '432', '433', '434', '435', '436', '437', '438', '441', '442', '447', '448', '453', '454', '457', '458', '46', '472', '48'])
      + sumCredit(lignes, ['501', '505', '506', '507', '508', '532', '537']);
    const totalActifN1Calc = (sumDebit(lignes, ['21']) - sumCredit(lignes, ['281', '291', '2931']))
      + (sumDebit(lignes, ['22', '23', '24']) - sumCredit(lignes, ['282', '284', '292', '2932', '2938', '294']))
      + (sumDebit(lignes, ['25', '26']) - sumCredit(lignes, ['295', '296', '297']))
      + sumDebit(lignes, ['27'])
      + (sumDebit(lignes, ['31', '32', '33', '34', '35', '36', '37']) - sumCredit(lignes, ['39']))
      + (sumDebit(lignes, ['41']) - sumCredit(lignes, ['491']))
      + (sumDebit(lignes, ['42', '43', '44', '45', '47', '48']) - sumCredit(lignes, ['491', '495', '496']))
      + (sumDebit(lignes, ['53', '54', '51', '52', '55']) - sumCredit(lignes, ['59']));
    setPassifN1({
      capitalSocial: sumCredit(lignes, ['101']),
      reserves: sumCredit(lignes, ['111', '112', '117', '118']),
      resultatsReportes: sumCredit(lignes, ['121', '128']),
      resultatExercice: Math.abs(totalActifN1Calc - autresPassifN1),
      emprunts: sumCredit(lignes, ['16']),
      autresPassifsFinanciers: sumCredit(lignes, ['18']),
      provisions: sumCredit(lignes, ['15']),
      fournisseurs: sumCredit(lignes, ['40']),
      autresPassifsCourants: sumCredit(lignes, ['419', '422', '423', '425', '427', '428', '432', '433', '434', '435', '436', '437', '438', '441', '442', '447', '448', '453', '454', '457', '458', '46', '472', '48']),
      concoursBancaires: sumCredit(lignes, ['501', '505', '506', '507', '508', '532', '537']),
    });

    setBalanceN1(lignes);
    setBalanceN1Count(lignes.length);
  };

  const handleFileImportN1 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    let lignes: BalanceLigne[] = [];
    if (ext === 'csv' || ext === 'txt') {
      const text = await file.text();
      lignes = parseBalanceCSV(text);
    } else if (ext === 'xls' || ext === 'xlsx') {
      const buf = await file.arrayBuffer();
      lignes = await parseBalanceXLSX(buf);
    }
    applyBalanceN1(lignes);
    e.target.value = '';
  };

  // ===== IMPORT IMMOBILISATIONS → TAB AMT =====
  const [immobCount, setImmobCount] = useState(0);
  const fileRefImmob = useRef<HTMLInputElement>(null);

  const parseImmobRows = (rows: any[]): { cat: string; vbN: number; acq: number; ces: number; dot: number; reg: number; vbN1: number; amortN1: number }[] => {
    const results: { cat: string; vbN: number; acq: number; ces: number; dot: number; reg: number; vbN1: number; amortN1: number }[] = [];
    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const cat = String(row[0] || '').trim();
      if (!cat || cat.length < 3) continue;
      const parseNum = (v: any) => {
        if (v === null || v === undefined || v === '' || v === '-') return 0;
        if (typeof v === 'number') return v;
        return parseFloat(String(v).replace(/\s/g, '').replace(/,/g, '.')) || 0;
      };
      results.push({
        cat,
        vbN1: parseNum(row[1]),
        acq: parseNum(row[2]),
        ces: parseNum(row[3]),
        dot: parseNum(row[4]),
        reg: parseNum(row[5]),
        vbN: 0,
        amortN1: parseNum(row[6]),
      });
      // Calculate VB N from N-1 + Acq - Ces
      const last = results[results.length - 1];
      last.vbN = last.vbN1 + last.acq - last.ces;
    }
    return results;
  };

  const handleFileImportImmob = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    let rows: any[][] = [];
    if (ext === 'csv' || ext === 'txt') {
      const text = await file.text();
      rows = text.trim().split('\n').map(l => l.split(/[;,]/).map(s => s.trim()));
    } else if (ext === 'xls' || ext === 'xlsx') {
      const XLSXMod = await import('xlsx');
      const XLSX = XLSXMod.default || XLSXMod;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    }
    const parsed = parseImmobRows(rows);
    if (parsed.length > 0) {
      setImmob(parsed);
      setImmobCount(parsed.length);
    }
    e.target.value = '';
  };

  // ===== ACTIF =====
  const [actif, setActif] = useState({
    immoIncorpBrut: 0, immoIncorpAmort: 0,
    immoCorpBrut: 0, immoCorpAmort: 0,
    immoFinancBrut: 0, immoFinancProv: 0,
    autresActifsNonCourants: 0,
    stocks: 0, stocksProv: 0,
    clients: 0, clientsProv: 0,
    autresActifsCourants: 0,
    tresorerie: 0,
  });
  const [actifN1, setActifN1] = useState({
    immoIncorpBrut: 0, immoIncorpAmort: 0,
    immoCorpBrut: 0, immoCorpAmort: 0,
    immoFinancBrut: 0, immoFinancProv: 0,
    autresActifsNonCourants: 0,
    stocks: 0, stocksProv: 0,
    clients: 0, clientsProv: 0,
    autresActifsCourants: 0,
    tresorerie: 0,
  });
  const updateActif = (k: string, v: number) => setActif(prev => ({ ...prev, [k]: v }));

  const actifImmobNet = (actif.immoIncorpBrut - actif.immoIncorpAmort) + (actif.immoCorpBrut - actif.immoCorpAmort) + (actif.immoFinancBrut - actif.immoFinancProv);
  const actifStocksNet = actif.stocks - actif.stocksProv;
  const actifCreancesNet = actif.clients - actif.clientsProv + actif.autresActifsCourants;
  const totalNonCourants = actifImmobNet + actif.autresActifsNonCourants;
  const totalCourants = actifStocksNet + actifCreancesNet + actif.tresorerie;
  const totalActif = totalNonCourants + totalCourants;

  const actifImmobNetN1 = (actifN1.immoIncorpBrut - actifN1.immoIncorpAmort) + (actifN1.immoCorpBrut - actifN1.immoCorpAmort) + (actifN1.immoFinancBrut - actifN1.immoFinancProv);
  const actifStocksNetN1 = actifN1.stocks - actifN1.stocksProv;
  const actifCreancesNetN1 = actifN1.clients - actifN1.clientsProv + actifN1.autresActifsCourants;
  const totalNonCourantsN1 = actifImmobNetN1 + actifN1.autresActifsNonCourants;
  const totalCourantsN1 = actifStocksNetN1 + actifCreancesNetN1 + actifN1.tresorerie;
  const totalActifN1 = totalNonCourantsN1 + totalCourantsN1;

  // ===== PASSIF =====
  const [passif, setPassif] = useState({
    capitalSocial: 0,
    reserves: 0,
    resultatsReportes: 0,
    resultatExercice: 0,
    emprunts: 0,
    autresPassifsFinanciers: 0,
    provisions: 0,
    fournisseurs: 0,
    autresPassifsCourants: 0,
    concoursBancaires: 0,
  });
  const [passifN1, setPassifN1] = useState({
    capitalSocial: 0,
    reserves: 0,
    resultatsReportes: 0,
    resultatExercice: 0,
    emprunts: 0,
    autresPassifsFinanciers: 0,
    provisions: 0,
    fournisseurs: 0,
    autresPassifsCourants: 0,
    concoursBancaires: 0,
  });
  const updatePassif = (k: string, v: number) => setPassif(prev => ({ ...prev, [k]: v }));

  const totalCP = passif.capitalSocial + passif.reserves + passif.resultatsReportes + passif.resultatExercice;
  const totalPassifNonCourant = passif.emprunts + passif.autresPassifsFinanciers + passif.provisions;
  const totalPassifCourant = passif.fournisseurs + passif.autresPassifsCourants + passif.concoursBancaires;
  const totalPassif = totalCP + totalPassifNonCourant + totalPassifCourant;

  const totalCPN1 = passifN1.capitalSocial + passifN1.reserves + passifN1.resultatsReportes + passifN1.resultatExercice;
  const totalPassifNonCourantN1 = passifN1.emprunts + passifN1.autresPassifsFinanciers + passifN1.provisions;
  const totalPassifCourantN1 = passifN1.fournisseurs + passifN1.autresPassifsCourants + passifN1.concoursBancaires;
  const totalPassifN1 = totalCPN1 + totalPassifNonCourantN1 + totalPassifCourantN1;

  // ===== RESULTAT =====
  const [resultat, setResultat] = useState({
    revenus: 0, autresProduitsExploit: 0, transfertCharges: 0,
    achatsConsommes: 0, chargesPersonnel: 0, dotationsAmort: 0, autresChargesExploit: 0,
    chargesFinancieres: 0, produitsPlacements: 0,
    autresGainsOrdinaires: 0, autresPertesOrdinaires: 0,
    impotBenefices: 0,
    elementsExtraordinaires: 0,
  });
  const updateResultat = (k: string, v: number) => setResultat(prev => ({ ...prev, [k]: v }));

  const totalProduitsExploit = resultat.revenus + resultat.autresProduitsExploit + resultat.transfertCharges;
  const totalChargesExploit = resultat.achatsConsommes + resultat.chargesPersonnel + resultat.dotationsAmort + resultat.autresChargesExploit;
  const resultatExploit = totalProduitsExploit - totalChargesExploit;
  const chargesFinNettes = resultat.chargesFinancieres - resultat.produitsPlacements;
  const resultatAvantImpot = resultatExploit - chargesFinNettes + resultat.autresGainsOrdinaires - resultat.autresPertesOrdinaires;
  const resultatOrdApresImpot = resultatAvantImpot - resultat.impotBenefices;
  const resultatNet = resultatOrdApresImpot + resultat.elementsExtraordinaires;

  // ===== TAB AMT =====
  type LigneImob = { cat: string; vbN: number; acq: number; ces: number; dot: number; reg: number; vbN1: number; amortN1: number };
  const [immob, setImmob] = useState<LigneImob[]>([
    { cat: 'Immobilisations incorporelles', vbN: 0, acq: 0, ces: 0, dot: 0, reg: 0, vbN1: 0, amortN1: 0 },
    { cat: 'Logiciels', vbN: 0, acq: 0, ces: 0, dot: 0, reg: 0, vbN1: 0, amortN1: 0 },
    { cat: 'Immobilisations corporelles', vbN: 0, acq: 0, ces: 0, dot: 0, reg: 0, vbN1: 0, amortN1: 0 },
    { cat: 'Materiel Informatique', vbN: 0, acq: 0, ces: 0, dot: 0, reg: 0, vbN1: 0, amortN1: 0 },
    { cat: 'Equipement de bureau', vbN: 0, acq: 0, ces: 0, dot: 0, reg: 0, vbN1: 0, amortN1: 0 },
    { cat: 'Installations generales', vbN: 0, acq: 0, ces: 0, dot: 0, reg: 0, vbN1: 0, amortN1: 0 },
    { cat: 'Materiel industriel', vbN: 0, acq: 0, ces: 0, dot: 0, reg: 0, vbN1: 0, amortN1: 0 },
    { cat: 'Materiel de transport', vbN: 0, acq: 0, ces: 0, dot: 0, reg: 0, vbN1: 0, amortN1: 0 },
  ]);
  const updateImmob = (i: number, k: keyof LigneImob, v: number) => {
    setImmob(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  };
  const totalImobVB_N = immob.reduce((s, l) => s + l.vbN, 0);
  const totalImobAcq = immob.reduce((s, l) => s + l.acq, 0);
  const totalImobCes = immob.reduce((s, l) => s + l.ces, 0);
  const totalImobDot = immob.reduce((s, l) => s + l.dot, 0);
  const totalImobReg = immob.reduce((s, l) => s + l.reg, 0);
  const totalImobVCN = totalImobVB_N + totalImobAcq - totalImobCes - totalImobDot - totalImobReg;

  // ===== FLUX =====
  const [flux, setFlux] = useState({
    resultatNet: 0,
    dotationsProvisions: 0,
    variationStocks: 0,
    variationCreances: 0,
    variationAutresActifs: 0,
    variationFournisseurs: 0,
    plusMoinsValuesCession: 0,
    repriseProvisions: 0,
    acqImmobilisations: 0,
    cessionsImmobilisations: 0,
    pretsPersonnel: 0,
    cessionsImmobFinancieres: 0,
    dividendes: 0,
    variationSitNet: 0,
    encaissementsEmprunts: 0,
    remboursementsEmprunts: 0,
    tresorerieN1: 0,
  });
  const updateFlux = (k: string, v: number) => setFlux(prev => ({ ...prev, [k]: v }));

  const fluxExploit = flux.resultatNet + flux.dotationsProvisions + flux.variationStocks + flux.variationCreances + flux.variationAutresActifs + flux.variationFournisseurs + flux.plusMoinsValuesCession + flux.repriseProvisions;
  const fluxInvest = flux.acqImmobilisations + flux.cessionsImmobilisations + flux.pretsPersonnel + flux.cessionsImmobFinancieres;
  const fluxFinanc = flux.dividendes + flux.variationSitNet + flux.encaissementsEmprunts + flux.remboursementsEmprunts;
  const variationTresorerie = fluxExploit + fluxInvest + fluxFinanc;
  const tresorerieN = flux.tresorerieN1 + variationTresorerie;

  // ===== SIG =====
  const [sig, setSig] = useState({
    ventesMarchandises: 0, cAchatMarchandises: 0,
    revenus: 0, productionStockee: 0,
    achatsConsommes: 0,
    subventionExploit: 0, autresChargesExternes: 0,
    impotsTaxes: 0, chargesPersonnel: 0,
    chargesFinancieres: 0, produitsPlacements: 0,
    autresGainsOrdinaires: 0, autresPertesOrdinaires: 0,
    transfertRepriseCharges: 0, dotationsAmortProvisions: 0,
    impotBenefices: 0,
  });
  const updateSig = (k: string, v: number) => setSig(prev => ({ ...prev, [k]: v }));

  const margeCommerciale = sig.ventesMarchandises - sig.cAchatMarchandises;
  const productionExercice = sig.revenus + sig.productionStockee;
  const margeBruteTotale = margeCommerciale + productionExercice - sig.achatsConsommes;
  const valeurAjouteeBrute = margeBruteTotale + sig.subventionExploit + sig.autresChargesExternes;
  const ebe = valeurAjouteeBrute - sig.impotsTaxes - sig.chargesPersonnel;
  const resultatExploitSIG = ebe - sig.chargesFinancieres + sig.produitsPlacements + sig.autresGainsOrdinaires - sig.autresPertesOrdinaires + sig.transfertRepriseCharges - sig.dotationsAmortProvisions;
  const resultatAvantImpotSIG = resultatExploitSIG;
  const resultatNetSIG = resultatAvantImpotSIG - sig.impotBenefices;

  // ===== FISC (Resultat Fiscal) =====
  const [fisc, setFisc] = useState({
    resultatComptable: 0,
    reintegrations: {
      impotsResultat: 0, css: 0, timbresVoyage: 0, penalitesRetard: 0,
      provisionsRetraite: 0, chargesNonDeductibles: 0, pertesExceptionnelles: 0,
      facturesNonConformes: 0, provisionsConges: 0, repriseGainChange: 0,
      pertesChangeReeval: 0,
    },
    deductions: { reprisePerteChange: 0, gainChangeReeval: 0 },
    resultatFiscal: 0, resultatImposable: 0,
    impotSocietes: 0, acompteProvisionnel: 0, reportImpot2024: 0,
    retenueSourceClients: 0, reportIS: 0, css2025: 0,
    reportCSS2024: 0, reportCSS2025: 0,
  });
  const updateFisc = (k: string, v: number) => setFisc(prev => ({ ...prev, [k]: v }));
  const updateFiscReintegrations = (k: string, v: number) => setFisc(prev => ({ ...prev, reintegrations: { ...prev.reintegrations, [k]: v } }));
  const updateFiscDeductions = (k: string, v: number) => setFisc(prev => ({ ...prev, deductions: { ...prev.deductions, [k]: v } }));
  const totalReintegrations = Object.values(fisc.reintegrations).reduce((s, v) => s + v, 0);
  const totalDeductions = Object.values(fisc.deductions).reduce((s, v) => s + v, 0);
  const resultatFiscalCalc = fisc.resultatComptable + totalReintegrations - totalDeductions;

  const annexeN1 = anneeN - 1;

  // ===== AI VERIFICATION =====
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const handleVerifyAI = async () => {
    setAiLoading(true);
    setShowAiPanel(true);
    setAiResult(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const result = await api.ef.verify({
        actif, passif, resultat, sig, flux, immob, nomSociete, anneeN
      }, controller.signal);
      clearTimeout(timeout);
      setAiResult(result);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setAiResult({ ok: false, summary: 'Timeout - l\'IA prend trop de temps. Réessayez.', errors: [], suggestions: [] });
      } else {
        setAiResult({ ok: false, summary: 'Erreur: ' + e.message, errors: [], suggestions: [] });
      }
    } finally {
      setAiLoading(false);
    }
  };

  // ===== EXPORT ACTIF XLSX =====
  const exportXLSX = async (_sheetName: string, buildRows: () => any[][]) => {
    const { buildEFExcel } = await import('./efTemplate');
    const buffer = await buildEFExcel({
      nomSociete, anneeN, annexeN1,
      immoIncorpBrutN: actif.immoIncorpBrut, immoIncorpBrutN1: actifN1.immoIncorpBrut,
      immoIncorpAmortN: actif.immoIncorpAmort, immoIncorpAmortN1: actifN1.immoIncorpAmort,
      immoCorpBrutN: actif.immoCorpBrut, immoCorpBrutN1: actifN1.immoCorpBrut,
      immoCorpAmortN: actif.immoCorpAmort, immoCorpAmortN1: actifN1.immoCorpAmort,
      immoFinancBrutN: actif.immoFinancBrut, immoFinancBrutN1: actifN1.immoFinancBrut,
      immoFinancProvN: actif.immoFinancProv, immoFinancProvN1: actifN1.immoFinancProv,
      autresActifsNonCourantsN: actif.autresActifsNonCourants, autresActifsNonCourantsN1: actifN1.autresActifsNonCourants,
      stocksN: actif.stocks, stocksN1: actifN1.stocks,
      stocksProvN: actif.stocksProv, stocksProvN1: actifN1.stocksProv,
      clientsN: actif.clients, clientsN1: actifN1.clients,
      clientsProvN: actif.clientsProv, clientsProvN1: actifN1.clientsProv,
      autresActifsCourantsN: actif.autresActifsCourants, autresActifsCourantsN1: actifN1.autresActifsCourants,
      tresorerieN: actif.tresorerie, tresorerieN1: actifN1.tresorerie,
      capitalSocialN: passif.capitalSocial, capitalSocialN1: passifN1.capitalSocial,
      reservesN: passif.reserves, reservesN1: passifN1.reserves,
      resultatsReportesN: passif.resultatsReportes, resultatsReportesN1: passifN1.resultatsReportes,
      resultatExerciceN: passif.resultatExercice, resultatExerciceN1: passifN1.resultatExercice,
      empruntsN: passif.emprunts, empruntsN1: passifN1.emprunts,
      autresPassifsFinanciersN: passif.autresPassifsFinanciers, autresPassifsFinanciersN1: passifN1.autresPassifsFinanciers,
      provisionsN: passif.provisions, provisionsN1: passifN1.provisions,
      fournisseursN: passif.fournisseurs, fournisseursN1: passifN1.fournisseurs,
      autresPassifsCourantsN: passif.autresPassifsCourants, autresPassifsCourantsN1: passifN1.autresPassifsCourants,
      concoursBancairesN: passif.concoursBancaires, concoursBancairesN1: passifN1.concoursBancaires,
      revenusN: resultat.revenus, revenusN1: 0,
      achatsConsommesN: resultat.achatsConsommes, achatsConsommesN1: 0,
      chargesPersonnelN: resultat.chargesPersonnel, chargesPersonnelN1: 0,
      dotationsAmortN: resultat.dotationsAmort, dotationsAmortN1: 0,
      autresChargesExploitN: resultat.autresChargesExploit, autresChargesExploitN1: 0,
      chargesFinancieresN: chargesFinNettes, chargesFinancieresN1: 0,
      impotBeneficesN: resultat.impotBenefices, impotBeneficesN1: 0,
      ventesMarchandisesN: sig.ventesMarchandises, ventesMarchandisesN1: 0,
      cAchatMarchandisesN: sig.cAchatMarchandises, cAchatMarchandisesN1: 0,
      autresChargesExternesN: sig.autresChargesExternes, autresChargesExternesN1: 0,
      impotsTaxesN: sig.impotsTaxes, impotsTaxesN1: 0,
      dotationsProvisionsN: flux.dotationsProvisions, dotationsProvisionsN1: 0,
      variationStocksN: flux.variationStocks, variationStocksN1: 0,
      variationCreancesN: flux.variationCreances, variationCreancesN1: 0,
      variationAutresActifsN: flux.variationAutresActifs, variationAutresActifsN1: 0,
      variationFournisseursN: flux.variationFournisseurs, variationFournisseursN1: 0,
      acqImmobilisationsN: flux.acqImmobilisations, acqImmobilisationsN1: 0,
      immob,
    });
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `EF-${_sheetName}-${nomSociete || 'societe'}-${anneeN}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportAllEF = async () => {
    const { buildEFExcel } = await import('./efTemplate');
    const buffer = await buildEFExcel({
      nomSociete, anneeN, annexeN1,
      immoIncorpBrutN: actif.immoIncorpBrut, immoIncorpBrutN1: actifN1.immoIncorpBrut,
      immoIncorpAmortN: actif.immoIncorpAmort, immoIncorpAmortN1: actifN1.immoIncorpAmort,
      immoCorpBrutN: actif.immoCorpBrut, immoCorpBrutN1: actifN1.immoCorpBrut,
      immoCorpAmortN: actif.immoCorpAmort, immoCorpAmortN1: actifN1.immoCorpAmort,
      immoFinancBrutN: actif.immoFinancBrut, immoFinancBrutN1: actifN1.immoFinancBrut,
      immoFinancProvN: actif.immoFinancProv, immoFinancProvN1: actifN1.immoFinancProv,
      autresActifsNonCourantsN: actif.autresActifsNonCourants, autresActifsNonCourantsN1: actifN1.autresActifsNonCourants,
      stocksN: actif.stocks, stocksN1: actifN1.stocks,
      stocksProvN: actif.stocksProv, stocksProvN1: actifN1.stocksProv,
      clientsN: actif.clients, clientsN1: actifN1.clients,
      clientsProvN: actif.clientsProv, clientsProvN1: actifN1.clientsProv,
      autresActifsCourantsN: actif.autresActifsCourants, autresActifsCourantsN1: actifN1.autresActifsCourants,
      tresorerieN: actif.tresorerie, tresorerieN1: actifN1.tresorerie,
      capitalSocialN: passif.capitalSocial, capitalSocialN1: passifN1.capitalSocial,
      reservesN: passif.reserves, reservesN1: passifN1.reserves,
      resultatsReportesN: passif.resultatsReportes, resultatsReportesN1: passifN1.resultatsReportes,
      resultatExerciceN: passif.resultatExercice, resultatExerciceN1: passifN1.resultatExercice,
      empruntsN: passif.emprunts, empruntsN1: passifN1.emprunts,
      autresPassifsFinanciersN: passif.autresPassifsFinanciers, autresPassifsFinanciersN1: passifN1.autresPassifsFinanciers,
      provisionsN: passif.provisions, provisionsN1: passifN1.provisions,
      fournisseursN: passif.fournisseurs, fournisseursN1: passifN1.fournisseurs,
      autresPassifsCourantsN: passif.autresPassifsCourants, autresPassifsCourantsN1: passifN1.autresPassifsCourants,
      concoursBancairesN: passif.concoursBancaires, concoursBancairesN1: passifN1.concoursBancaires,
      revenusN: resultat.revenus, revenusN1: 0,
      achatsConsommesN: resultat.achatsConsommes, achatsConsommesN1: 0,
      chargesPersonnelN: resultat.chargesPersonnel, chargesPersonnelN1: 0,
      dotationsAmortN: resultat.dotationsAmort, dotationsAmortN1: 0,
      autresChargesExploitN: resultat.autresChargesExploit, autresChargesExploitN1: 0,
      chargesFinancieresN: chargesFinNettes, chargesFinancieresN1: 0,
      impotBeneficesN: resultat.impotBenefices, impotBeneficesN1: 0,
      ventesMarchandisesN: sig.ventesMarchandises, ventesMarchandisesN1: 0,
      cAchatMarchandisesN: sig.cAchatMarchandises, cAchatMarchandisesN1: 0,
      autresChargesExternesN: sig.autresChargesExternes, autresChargesExternesN1: 0,
      impotsTaxesN: sig.impotsTaxes, impotsTaxesN1: 0,
      dotationsProvisionsN: flux.dotationsProvisions, dotationsProvisionsN1: 0,
      variationStocksN: flux.variationStocks, variationStocksN1: 0,
      variationCreancesN: flux.variationCreances, variationCreancesN1: 0,
      variationAutresActifsN: flux.variationAutresActifs, variationAutresActifsN1: 0,
      variationFournisseursN: flux.variationFournisseurs, variationFournisseursN1: 0,
      acqImmobilisationsN: flux.acqImmobilisations, acqImmobilisationsN1: 0,
      immob,
    });
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `EF-${nomSociete || 'societe'}-${anneeN}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  const buildActifRows = (): any[][] => [
    ['', '', '', nomSociete],
    [],
    ['', '', '', `BILANS COMPARES ARRETES AUX 31 Dec ${anneeN} & 31 Dec ${annexeN1}`],
    [],
    ['', '', '', '(en dinars tunisiens)'],
    [],
    [],
    [null, null, null, 'ACTIFS', 'Notes', null, null, null, totalActif, null, null, totalActifN1, totalActif - totalActifN1],
    [],
    ['', '', '', 'ACTIFS NON COURANTS'],
    [],
    [null, null, null, null, 'Actifs immobilises'],
    [],
    ['A1', null, null, null, 'Immobilisations incorporelles', null, null, null, actif.immoIncorpBrut, null, null, actifN1.immoIncorpBrut, actif.immoIncorpBrut - actifN1.immoIncorpBrut],
    ['A2', null, null, null, 'Moins : amortissements', null, null, null, -actif.immoIncorpAmort, null, null, -actifN1.immoIncorpAmort],
    [null, null, null, null, null, null, null, null, actif.immoIncorpBrut - actif.immoIncorpAmort, null, null, actifN1.immoIncorpBrut - actifN1.immoIncorpAmort],
    ['A3', null, null, null, 'Immobilisations corporelles', null, null, null, actif.immoCorpBrut, null, null, actifN1.immoCorpBrut, actif.immoCorpBrut - actifN1.immoCorpBrut],
    ['A4', null, null, null, 'Moins : amortissements', null, null, null, -actif.immoCorpAmort, null, null, -actifN1.immoCorpAmort],
    [null, null, null, null, null, null, null, null, actif.immoCorpBrut - actif.immoCorpAmort, null, null, actifN1.immoCorpBrut - actifN1.immoCorpAmort],
    [null, null, null, null, 'Immobilisations encours'],
    [null, null, null, null, null, null, null, null, 0, null, null, 0],
    ['A5', null, null, null, 'Immobilisations financieres', null, null, null, actif.immoFinancBrut, null, null, actifN1.immoFinancBrut, actif.immoFinancBrut - actifN1.immoFinancBrut],
    ['A6', null, null, null, 'Moins : provisions', null, null, null, -actif.immoFinancProv, null, null, -actifN1.immoFinancProv],
    [null, null, null, null, null, null, null, null, actif.immoFinancBrut - actif.immoFinancProv, null, null, actifN1.immoFinancBrut - actifN1.immoFinancProv],
    [],
    [null, null, null, null, 'Total des actifs immobilises', null, null, null, actifImmobNet, null, null, actifImmobNetN1, actifImmobNet - actifImmobNetN1],
    [],
    ['A7', null, null, null, 'Autres actifs non courants', null, null, null, actif.autresActifsNonCourants, null, null, actifN1.autresActifsNonCourants],
    [],
    ['', '', '', 'TOTAL DES ACTIFS NON COURANTS', null, null, null, null, totalNonCourants, null, null, totalNonCourantsN1, totalNonCourants - totalNonCourantsN1],
    [],
    ['', '', '', 'ACTIFS COURANTS'],
    [],
    ['A8', null, null, null, 'Stocks', null, null, null, actif.stocks, null, null, actifN1.stocks, actif.stocks - actifN1.stocks],
    ['A9', null, null, null, 'Moins : provisions', null, null, null, -actif.stocksProv, null, null, -actifN1.stocksProv],
    [null, null, null, null, null, null, null, null, actifStocksNet, null, null, actifStocksNetN1],
    [],
    ['A10', null, null, null, 'Clients et comptes rattaches', null, null, null, actif.clients, null, null, actifN1.clients, actif.clients - actifN1.clients],
    ['A11', null, null, null, 'Moins : provisions', null, null, null, -actif.clientsProv, null, null, -actifN1.clientsProv],
    [null, null, null, null, null, null, null, null, actif.clients - actif.clientsProv, null, null, actifN1.clients - actifN1.clientsProv],
    [],
    ['A12', null, null, null, 'Autres actifs courants', null, null, null, actif.autresActifsCourants, null, null, actifN1.autresActifsCourants, actif.autresActifsCourants - actifN1.autresActifsCourants],
    [],
    [null, null, null, null, 'Total des actifs courants', null, null, null, totalCourants, null, null, totalCourantsN1, totalCourants - totalCourantsN1],
    [],
    ['', '', '', 'TOTAL GENERAL ACTIF', null, null, null, null, totalActif, null, null, totalActifN1, totalActif - totalActifN1],
    [],
    ['CONTROLE:', `Total Actif = ${fmt(totalActif)} | Total CP+Passif = ${fmt(totalPassif)} | Ecart = ${fmt(Math.abs(totalActif - totalPassif))}`],
  ];

  const buildPassifRows = (): any[][] => [
    ['', nomSociete],
    [],
    ['', `BILANS COMPARES ARRETES AUX 31 Dec ${anneeN} & 31 Dec ${annexeN1}`],
    [],
    ['', '(en dinars tunisiens)'],
    [],
    [],
    [null, 'CAPITAUX PROPRES ET PASSIFS', null, null, 'Notes', null, null, totalPassif, null, totalPassifN1, totalPassif - totalPassifN1],
    [],
    ['', 'CAPITAUX PROPRES ET PASSIFS'],
    [],
    [null, null, 'Capitaux propres'],
    [],
    ['P1', null, null, 'Capital social', null, null, null, passif.capitalSocial, null, passifN1.capitalSocial, passif.capitalSocial - passifN1.capitalSocial],
    ['P2', null, null, 'Reserves', null, null, null, passif.reserves, null, passifN1.reserves, passif.reserves - passifN1.reserves],
    ['P3', null, null, 'Resultats reportes', null, null, null, passif.resultatsReportes, null, passifN1.resultatsReportes, passif.resultatsReportes - passifN1.resultatsReportes],
    [null, null, null, null, null, null, null, 0, null, 0],
    [null, null, null, 'Total capitaux propres avant resultat', null, null, null, totalCP - passif.resultatExercice, null, totalCPN1 - passifN1.resultatExercice],
    [],
    [null, null, null, "Resultat de l'exercice", null, null, null, passif.resultatExercice, null, passifN1.resultatExercice, passif.resultatExercice - passifN1.resultatExercice],
    [],
    ['', 'TOTAL CAPITAUX PROPRES', null, null, '4.1', null, null, totalCP, null, totalCPN1, totalCP - totalCPN1],
    [],
    [],
    ['', 'PASSIFS'],
    [],
    [null, null, 'Passifs non courants'],
    [],
    ['P4', null, null, 'Emprunts', null, null, null, passif.emprunts, null, passifN1.emprunts, passif.emprunts - passifN1.emprunts],
    ['P5', null, null, 'Autres passifs financiers', null, null, null, passif.autresPassifsFinanciers, null, passifN1.autresPassifsFinanciers],
    ['P6', null, null, 'Provisions', null, null, null, passif.provisions, null, passifN1.provisions],
    [null, null, null, null, null, null, null, 0, null, 0],
    [null, null, 'Total passifs non courants', null, null, null, null, totalPassifNonCourant, null, totalPassifNonCourantN1, totalPassifNonCourant - totalPassifNonCourantN1],
    [null, null, 'Passifs courants', null, null, null, null, 0, null, 0],
    [],
    [null, null, null, 'Fournisseurs et comptes rattaches', null, null, null, passif.fournisseurs, null, passifN1.fournisseurs, passif.fournisseurs - passifN1.fournisseurs],
    [null, null, null, 'Autres passifs courants', null, null, null, passif.autresPassifsCourants, null, passifN1.autresPassifsCourants, passif.autresPassifsCourants - passifN1.autresPassifsCourants],
    [null, null, null, 'Concours bancaires et autres passifs financiers', null, null, null, passif.concoursBancaires, null, passifN1.concoursBancaires, passif.concoursBancaires - passifN1.concoursBancaires],
    [],
    [null, null, 'Total passifs courants', null, null, null, null, totalPassifCourant, null, totalPassifCourantN1, totalPassifCourant - totalPassifCourantN1],
    [],
    ['', 'TOTAL GENERAL PASSIF + CP', null, null, null, null, null, totalPassif, null, totalPassifN1, totalPassif - totalPassifN1],
    [],
    ['CONTROLE:', `Total Actif = ${fmt(totalActif)} | Total CP+Passif = ${fmt(totalPassif)} | Ecart = ${fmt(Math.abs(totalActif - totalPassif))}`],
  ];

  const buildResultatRows = (): any[][] => [
    [null, nomSociete],
    [],
    [null, `ETATS DE RESULTATS COMPARES ARRETES AUX 31 Dec ${anneeN} & 31 Dec ${annexeN1}`],
    [],
    [null, '(en dinars tunisiens)'],
    [],
    [],
    [null, null, null, null, 'Notes', null, null, totalActif, null, totalActifN1],
    [],
    ['', "PRODUITS D'EXPLOITATION"],
    [null, null, null, null, null, null, null, 0, 0],
    ['R1', null, null, 'Revenus', '5.1', null, null, resultat.revenus],
    ['R2', null, null, "Autres produits d'exploitation"],
    ['R3', null, null, 'Production immobilisee', null, null, null, 0, 0],
    [null, null, null, 'Transfert de charges'],
    [null, null, "Total des produits d'exploitation", null, null, null, null, totalProduitsExploit],
    [null, null, null, null, null, null, null, 0, 0],
    [null, "CHARGES D'EXPLOITATION", null, null, null, null, null, 0, 0],
    [null, null, null, null, null, null, null, 0, 0],
    [null, null, null, "Cout d'achat des marchandises vendues", '5.2', null, null, resultat.achatsConsommes, null, null, null, null, 'MARGE'],
    ['R5', null, null, 'Charges de personnel', null, null, null, resultat.chargesPersonnel],
    ['R6', null, null, 'Dotations aux amortissements et provisions', '5.3', null, null, resultat.dotationsAmort],
    ['R7', null, null, "Autres charges d'exploitation", '5.4', null, null, resultat.autresChargesExploit],
    [null, null, "Total des charges d'exploitation", null, null, null, null, totalChargesExploit],
    [],
    [],
    [null, "Resultat d'exploitation", null, null, null, null, null, resultatExploit],
    [null, null, null, null, null, null, null, 0, 0],
    ['R8', null, null, 'Charges financieres nettes', null, null, null, chargesFinNettes],
    ['R9', null, null, 'Produits des placements', null, null, null, 0],
    ['R10', null, null, 'Autres gains ordinaires'],
    ['R11', null, null, 'Autres pertes ordinaires'],
    [null, null, null, null, null, null, null, 0, 0],
    [null, 'Resultat des activites ordinaires avant impot', null, null, null, null, null, resultatAvantImpot],
    [],
    [null, 'Impot sur les benefices', null, null, null, null, null, resultat.impotBenefices],
    [null, 'Acompte provisionnel'],
    [null, "report d impot", null, null, null, null, null, 0],
    [null, 'Retenue a la source / clients', null, null, null, null, null, 0],
    [null, null, null, null, null, null, null, 0],
    [null, "IS due au titre de l'exercice", null, null, null, null, null, resultat.impotBenefices],
    [],
    [null, 'Resultat des activites ordinaires apres impot', null, null, null, null, null, resultatOrdApresImpot],
    [],
    [null, 'Elements extraordinaires'],
    [null, null, null, 'Produits extraordinaires', null, null, null, 0],
    [null, null, null, 'Charges extraordinaires', null, null, null, 0],
    [null, null, null, null, null, null, null, 0],
    [null, 'Resultat des activites extraordinaires apres impot'],
    [],
    [null, 'Resultat net des activites ordinaires et extraordinaires'],
    [],
    [null, null, 'Charges a reporter'],
    [null, null, 'Produits a reporter'],
    [null, null, null, null, null, null, null, 0],
    [],
    ['R12', null, 'RESULTAT NET DE L\'EXERCICE', null, null, null, null, resultatNet],
  ];

  const buildTabAmtRows = (): any[][] => {
    const totalImobVB_N1v = immob.reduce((s, l) => s + l.vbN1, 0);
    const totalImobAmortN1v = immob.reduce((s, l) => s + l.amortN1, 0);
    const totalImobAmortNv = immob.reduce((s, l) => s + l.amortN1 + l.dot - l.reg, 0);
    return [
      ['ANIMAL CITY'],
      [],
      [`TABLEAU DE VARIATION DES IMMOBILISATIONS ET DES AMORTISSEMENTS AUX 31 Decembre ${anneeN}`],
      [],
      ['(En dinars tunisiens)'],
      [],
      [],
      [null, null, null, 'Valeurs brutes', null, null, null, null, 'Amortissements', null, null, null, 'VCN'],
      [null, null, null, `31/12/${annexeN1}`, 'Acquisitions', 'Reclassement', `31/12/${anneeN}`, null, `31/12/${annexeN1}`, 'Dotation', 'Regul', `31/12/${anneeN}`, `31/12/${anneeN}`],
      [],
      ['Immobilisations Incorporelles', null, null, 0, 0, 0, 0, null, 0, 0, 0, 0, 0],
      [],
      ['Fonds Commercial', null, null, 0, 0, 0, 0, null, 0, 0, 0, 0, 0],
      [],
      ['Immobilisations corporelles', null, null, actifN1.immoCorpBrut, totalImobAcq, totalImobCes, actif.immoCorpBrut, null, actifN1.immoCorpAmort, totalImobDot, totalImobReg, actif.immoCorpAmort, actif.immoCorpBrut - actif.immoCorpAmort],
      [],
      ...immob.filter(l => l.vbN > 0 || l.vbN1 > 0 || l.acq > 0 || l.dot > 0).map(l => [l.cat, null, null, l.vbN1, l.acq, l.ces, l.vbN + l.acq - l.ces, null, l.amortN1, l.dot, l.reg, l.amortN1 + l.dot - l.reg, (l.vbN + l.acq - l.ces) - (l.amortN1 + l.dot - l.reg)]),
      [],
      ['Immobilisations financieres', null, null, actifN1.immoFinancBrut, 0, 0, actif.immoFinancBrut, null, actifN1.immoFinancProv, 0, 0, actif.immoFinancProv, actif.immoFinancBrut - actif.immoFinancProv],
      [],
      [null, null, null, totalImobVB_N1v, totalImobAcq, totalImobCes, totalImobVB_N, null, totalImobAmortN1v, totalImobDot, totalImobReg, totalImobAmortNv, totalImobVCN],
    ];
  };

  const buildFluxRows = (): any[][] => [
    ['ANIMAL CITY'],
    [],
    [`ETATS DES FLUX DE TRESORERIE COMPARES ARRETES AUX 31 Dec ${anneeN} & 31 Dec ${annexeN1}`],
    [],
    ['(en dinars tunisiens)'],
    [],
    [],
    [null, null, null, null, null, 'Notes', null, totalActif, null, totalActifN1],
    [],
    [null, "Flux de tresorerie lies a l'exploitation"],
    [],
    [null, null, 'Resultat net', null, null, null, null, flux.resultatNet],
    [null, null, 'Ajustements pour :', null, null, null, null, 0],
    ['R1', null, null, 'Amortissements et provisions', null, null, null, flux.dotationsProvisions],
    [null, null, null, 'Variation des :', null, null, null, 0, 0, 0],
    ['R2', null, null, null, '- Stocks', null, null, flux.variationStocks],
    ['R3', null, null, null, '- Creances', null, null, flux.variationCreances],
    ['R4', null, null, null, '- Autres actifs', null, null, flux.variationAutresActifs],
    ['R5', null, null, null, '- Fournisseurs et autres dettes', null, null, flux.variationFournisseurs],
    ['R6', null, null, 'Plus ou moins values de cession'],
    ['R7', null, null, 'Reprise sur provision', null, null, null, 0],
    [null, null, null, null, null, null, null, 0],
    [null, "Flux de tresorerie lies a l'exploitation", null, null, null, null, null, fluxExploit],
    [],
    [null, "Flux de tresorerie lies aux activites d'investissement"],
    [],
    ['R8', null, null, "Acquisitions d'immobilisations", null, null, null, flux.acqImmobilisations],
    ['R9', null, null, "Cessions d'immobilisations", null, null, null, flux.cessionsImmobilisations],
    ['R10', null, null, "Cession de titres de placements", null, null, null, 0],
    ['R11', null, null, 'Autres Immo Financieres'],
    [null, null, null, null, null, null, null, 0],
    [null, "Flux de tresorerie lies aux activites d'investissement", null, null, null, null, null, fluxInvest],
    [],
    ['Flux de tresorerie lies aux activites de financement'],
    [],
    ['R12', null, null, 'Dividendes et autres distributions', null, null, null, flux.dividendes],
    ['R13', null, null, 'Variation situation nette', null, null, null, flux.variationSitNet],
    ['R14', null, null, 'Encaissements provenant des emprunts', null, null, null, flux.encaissementsEmprunts],
    ['R15', null, null, "Remboursements d'emprunts", null, null, null, flux.remboursementsEmprunts],
    [],
    ['Flux de tresorerie lies aux activites de financement', null, null, null, null, null, null, fluxFinanc],
    [],
    ['VARIATION DE TRESORERIE', null, null, null, null, null, null, variationTresorerie],
    [`Tresorerie ${annexeN1}`, null, null, null, null, null, null, flux.tresorerieN1],
    [`Tresorerie ${anneeN}`, null, null, null, null, null, null, tresorerieN],
  ];

  const buildSigRows = (): any[][] => [
    ['ANIMAL CITY'],
    [],
    [`SOLDES INTERMEDIAIRES DE GESTION COMPARES ARRETES AUX 31 Dec ${anneeN} & 31 Dec ${annexeN1}`],
    [],
    ['(en dinars tunisiens)'],
    [],
    [null, null, null, 'Notes', null, totalActif, null, totalActifN1],
    [],
    [null, 'Ventes de marchandises', null, null, null, sig.ventesMarchandises],
    [null, "Cout d'achat des Mses Vendues"],
    [],
    ['MARGE COMMERCIALE', null, null, null, null, margeCommerciale],
    [],
    [null, 'Revenus et autres produits d\'exploitation'],
    [null, 'Production stockee'],
    [null, 'Production immobilisee'],
    [null, 'Transfert de charges'],
    ["PRODUCTION DE L'EXERCICE"],
    [],
    [null, "Cout d'achat des marchandises vendues", null, null, null, -sig.cAchatMarchandises],
    [],
    [],
    ['MARGE BRUTE TOTALE', null, null, null, null, margeBruteTotale],
    [],
    ['ACTIVITE TOTALE', null, null, null, null, margeBruteTotale],
    [],
    [null, 'Marge brute totale', null, null, null, margeBruteTotale],
    [null, "Achats d'approvisionnements consommes"],
    [null, 'Autres charges externes', null, null, null, -sig.autresChargesExternes],
    [],
    ['VALEUR AJOUTEE BRUTE', null, null, null, null, valeurAjouteeBrute],
    [],
    [null, 'Impots et taxes', null, null, null, -sig.impotsTaxes],
    [null, 'Charges de personnel', null, null, null, -sig.chargesPersonnel],
    [],
    ["EXCEDENT BRUT D'EXPLOITATION", null, null, null, null, ebe],
    [],
    [null, 'Charges financieres nettes', null, null, null, -sig.chargesFinancieres],
    [null, 'Produits des placements', null, null, null, sig.produitsPlacements],
    [null, 'Autres gains ordinaires', null, null, null, sig.autresGainsOrdinaires],
    [null, 'Autres pertes ordinaires', null, null, null, -sig.autresPertesOrdinaires],
    [null, 'Transfert et reprise de charges', null, null, null, sig.transfertRepriseCharges],
    [null, 'Dotation aux amortissements et aux provisions', null, null, null, -sig.dotationsAmortProvisions],
    [],
    ["RESULTAT D'EXPLOITATION", null, null, null, null, resultatExploitSIG],
    [],
    ['IMPOTS SUR LES BENEFICES', null, null, null, null, sig.impotBenefices],
    [],
    ['RESULTAT NET DE L\'EXERCICE', null, null, null, null, resultatNetSIG],
  ];

  const copyTable = (rows: any[][]) => {
    const text = rows.map(r => r.join('\t')).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ===== RENDER =====
  const renderInputs = () => (
    <div className="bg-white rounded-lg border p-4 flex gap-4 items-end flex-wrap">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Societe</label>
        <input type="text" value={nomSociete} onChange={e => setNomSociete(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-60" />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Exercice N</label>
        <input type="number" value={anneeN} onChange={e => setAnneeN(parseInt(e.target.value) || 2025)}
          className="border rounded px-3 py-1.5 text-sm w-24" />
      </div>
      <div className="text-xs text-gray-400 pb-1">N-1 = {annexeN1}</div>
      <div className="ml-auto flex gap-2">
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv,.txt" className="hidden" onChange={handleFileImport} />
        <button onClick={() => fileRef.current?.click()}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm flex items-center gap-2 font-medium">
          <FileSpreadsheet size={16} /> Importer Balance N
        </button>
        <input ref={fileRefN1} type="file" accept=".xls,.xlsx,.csv,.txt" className="hidden" onChange={handleFileImportN1} />
        <button onClick={() => fileRefN1.current?.click()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm flex items-center gap-2 font-medium">
          <FileSpreadsheet size={16} /> Importer Balance N-1
        </button>
        {balanceCount > 0 && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle size={14} /> N: {balanceCount} comptes
          </span>
        )}
        {balanceN1Count > 0 && (
          <span className="text-xs text-blue-600 flex items-center gap-1">
            <CheckCircle size={14} /> N-1: {balanceN1Count} comptes
          </span>
        )}
      </div>
    </div>
  );

  const renderToolbar = (title: string, buildRows: () => any[][], sheetName: string) => (
    <div className="bg-red-700 text-white rounded-lg p-4 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-red-100">Exercice clos le 31/12/{anneeN}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { copyTable(buildRows()); }} className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded text-sm flex items-center gap-1">
          {copied ? <CheckCircle size={14} /> : <Copy size={14} />} {copied ? 'Copie!' : 'Copier'}
        </button>
        <button onClick={() => exportXLSX(sheetName, buildRows)} className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded text-sm flex items-center gap-1">
          <Download size={14} /> Telecharger
        </button>
      </div>
    </div>
  );

  const renderTable = (headers: string[], rows: { label: string; indent?: number; bold?: boolean; vals: (number | string)[]; isSection?: boolean }[], totals?: { label: string; vals: number[] }) => (
    <div className="bg-white rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-blue-700 text-white">
            {headers.map((h, i) => <th key={i} className={`px-3 py-2 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`${r.isSection ? 'bg-blue-50 font-bold' : r.bold ? 'bg-gray-50 font-bold' : 'hover:bg-gray-50'} border-t border-gray-100`}>
              <td className={`px-3 py-1.5 ${r.indent ? `pl-${r.indent * 4}` : ''}`}>{r.label}</td>
              {r.vals.map((v, j) => (
                <td key={j} className="px-3 py-1.5 text-right font-mono text-xs">
                  {typeof v === 'number' ? fmtCell(v) : v}
                </td>
              ))}
            </tr>
          ))}
          {totals && (
            <tr className="bg-blue-100 font-bold border-t-2 border-blue-300">
              <td className="px-3 py-2">{totals.label}</td>
              {totals.vals.map((v, j) => (
                <td key={j} className="px-3 py-2 text-right font-mono">{fmtCell(v)}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  // ===== ESG =====
  const renderESG = () => {
    const headers = ['Code', 'Libelle', `N (${anneeN})`, `N-1 (${annexeN1})`, '% N', '% N-1'];
    const prodRows = [
      { label: "PRODUITS D'EXPLOITATION", isSection: true, vals: [] },
      { label: 'Revenus', indent: 1, vals: [resultat.revenus, ''] },
      { label: "Autres produits d'exploitation", indent: 1, vals: [resultat.autresProduitsExploit, ''] },
      { label: 'Transfert de charges', indent: 1, vals: [resultat.transfertCharges, ''] },
    ];
    const chgRows = [
      { label: "CHARGES D'EXPLOITATION", isSection: true, vals: [] },
      { label: 'Achats consommes', indent: 1, vals: [resultat.achatsConsommes, ''] },
      { label: 'Charges de personnel', indent: 1, vals: [resultat.chargesPersonnel, ''] },
      { label: 'Dotations aux amortissements', indent: 1, vals: [resultat.dotationsAmort, ''] },
      { label: "Autres charges d'exploitation", indent: 1, vals: [resultat.autresChargesExploit, ''] },
    ];
    return (
      <div className="space-y-4">
        {renderToolbar("Etat des soldes de gestion", buildResultatRows, 'ESG')}
        {/* Two-column layout matching screenshot */}
        <div className="grid grid-cols-2 gap-0 bg-white rounded-lg border overflow-hidden">
          {/* PRODUITS */}
          <div className="border-r">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-700 text-white"><th className="px-3 py-2 text-left" colSpan={2}>PRODUITS</th><th className="px-3 py-2 text-center" colSpan={2}>Exercice</th><th className="px-3 py-2 text-center" colSpan={2}>Exercice</th></tr>
                <tr className="bg-blue-600 text-white text-xs">
                  <th className="px-3 py-1 text-left w-10">Code</th><th className="px-3 py-1 text-left">Libelle</th>
                  <th className="px-3 py-1 text-right w-24">N ({anneeN})</th><th className="px-3 py-1 text-right w-24">N-1 ({annexeN1})</th>
                  <th className="px-3 py-1 text-right w-14">%</th><th className="px-3 py-1 text-right w-14">%</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-blue-50 font-bold"><td className="px-3 py-1.5" colSpan={2}>PRODUITS D'EXPLOITATION</td><td className="px-3 py-1.5 text-right font-mono">{fmtCell(totalProduitsExploit)}</td><td className="px-3 py-1.5 text-right font-mono">-</td><td></td><td></td></tr>
                {[
                  { code: '', label: 'Revenus', n: resultat.revenus, n1: 0 },
                  { code: '', label: "Autres produits d'exploitation", n: resultat.autresProduitsExploit, n1: 0 },
                  { code: '', label: 'Transfert de charges', n: resultat.transfertCharges, n1: 0 },
                ].map((p, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{p.code}</td>
                    <td className="px-3 py-1.5">{p.label}</td>
                    <td className="px-3 py-1.5 text-right"><NumInput value={p.n} onChange={v => {}} /></td>
                    <td className="px-3 py-1.5 text-right"><NumInput value={p.n1} onChange={v => {}} /></td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-500">{p.n && totalProdN ? ((p.n / totalProdN) * 100).toFixed(1) + '%' : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-500"></td>
                  </tr>
                ))}
                <tr className="bg-blue-50 font-bold border-t-2 border-blue-300">
                  <td className="px-3 py-2" colSpan={2}>Total Produits</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(totalProdN)}</td>
                  <td className="px-3 py-2 text-right font-mono">-</td><td className="px-3 py-2 text-right">100%</td><td></td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* CHARGES */}
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-700 text-white"><th className="px-3 py-2 text-left" colSpan={2}>CHARGES</th><th className="px-3 py-2 text-center" colSpan={2}>Exercice</th><th className="px-3 py-2 text-center" colSpan={2}>Exercice</th></tr>
                <tr className="bg-blue-600 text-white text-xs">
                  <th className="px-3 py-1 text-left w-10">Code</th><th className="px-3 py-1 text-left">Libelle</th>
                  <th className="px-3 py-1 text-right w-24">N ({anneeN})</th><th className="px-3 py-1 text-right w-24">N-1 ({annexeN1})</th>
                  <th className="px-3 py-1 text-right w-14">%</th><th className="px-3 py-1 text-right w-14">%</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { code: '', label: 'Achats consommes', n: resultat.achatsConsommes },
                  { code: '', label: 'Charges de personnel', n: resultat.chargesPersonnel },
                  { code: '', label: 'Dotations aux amortissements', n: resultat.dotationsAmort },
                  { code: '', label: "Autres charges d'exploitation", n: resultat.autresChargesExploit },
                ].map((c, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-xs text-blue-600">{c.code}</td>
                    <td className="px-3 py-1.5">{c.label}</td>
                    <td className="px-3 py-1.5 text-right"><NumInput value={c.n} onChange={v => {}} /></td>
                    <td className="px-3 py-1.5 text-right"><NumInput value={0} onChange={v => {}} /></td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-500">{c.n && totalChargesN ? ((c.n / totalChargesN) * 100).toFixed(1) + '%' : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-500"></td>
                  </tr>
                ))}
                <tr className="bg-blue-50 font-bold border-t-2 border-blue-300">
                  <td className="px-3 py-2" colSpan={2}>Total Charges</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(totalChargesN)}</td>
                  <td className="px-3 py-2 text-right font-mono">-</td><td className="px-3 py-2 text-right">100%</td><td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        {/* RESULTAT NET */}
        <div className={`rounded-lg p-4 flex items-center justify-between ${resultatNet >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <span className="font-bold text-gray-700">RESULTAT NET DE L'EXERCICE</span>
          <div className="flex gap-8">
            <div className="text-right"><div className="text-xs text-gray-500">N ({anneeN})</div><div className={`font-bold font-mono text-lg ${resultatNet >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(resultatNet)}</div></div>
          </div>
        </div>
      </div>
    );
  };

  // Helper refs for ESG calc
  const totalProdN = totalProduitsExploit;
  const totalChargesN = totalChargesExploit;

  // ===== BILAN =====
  const renderBilan = (type: 'actif' | 'passif') => {
    const isActif = type === 'actif';
    const otherTotal = isActif ? totalPassif : totalActif;
    const ecart = Math.abs((isActif ? totalActif : totalPassif) - otherTotal);
    const headers = ['Compte', 'Libelle', `N (${anneeN})`, `N-1 (${annexeN1})`];
    const rows = isActif ? [
      { label: 'ACTIFS NON COURANTS', isSection: true, vals: ['', '', ''] },
      { label: 'Immobilisations incorporelles (brut)', indent: 1, vals: [actif.immoIncorpBrut, actifN1.immoIncorpBrut] },
      { label: 'Amortissements incorporels', indent: 2, vals: [-actif.immoIncorpAmort, -actifN1.immoIncorpAmort] },
      { label: 'Immobilisations corporelles (brut)', indent: 1, vals: [actif.immoCorpBrut, actifN1.immoCorpBrut] },
      { label: 'Amortissements corporels', indent: 2, vals: [-actif.immoCorpAmort, -actifN1.immoCorpAmort] },
      { label: 'Autres actifs non courants', indent: 1, vals: [actif.autresActifsNonCourants, actifN1.autresActifsNonCourants] },
      { label: 'Total Actifs Non Courants', bold: true, vals: [totalNonCourants, totalNonCourantsN1] },
      { label: 'ACTIFS COURANTS', isSection: true, vals: ['', '', ''] },
      { label: 'Stocks', indent: 1, vals: [actif.stocks, actifN1.stocks] },
      { label: 'Provisions stocks', indent: 2, vals: [-actif.stocksProv, -actifN1.stocksProv] },
      { label: 'Clients et comptes rattaches', indent: 1, vals: [actif.clients, actifN1.clients] },
      { label: 'Provisions clients', indent: 2, vals: [-actif.clientsProv, -actifN1.clientsProv] },
      { label: 'Autres actifs courants', indent: 1, vals: [actif.autresActifsCourants, actifN1.autresActifsCourants] },
      { label: 'Tresorerie', indent: 1, vals: [actif.tresorerie, actifN1.tresorerie] },
      { label: 'Total Actifs Courants', bold: true, vals: [totalCourants, totalCourantsN1] },
      { label: 'TOTAL GENERAL ACTIF', bold: true, vals: [totalActif, totalActifN1] },
    ] : [
      { label: 'CAPITAUX PROPRES', isSection: true, vals: ['', '', ''] },
      { label: 'Capital social', indent: 1, vals: [passif.capitalSocial, passifN1.capitalSocial] },
      { label: 'Reserves', indent: 1, vals: [passif.reserves, passifN1.reserves] },
      { label: 'Resultats reportes', indent: 1, vals: [passif.resultatsReportes, passifN1.resultatsReportes] },
      { label: "Resultat de l'exercice", indent: 1, vals: [passif.resultatExercice, passifN1.resultatExercice] },
      { label: 'Total Capitaux Propres', bold: true, vals: [totalCP, totalCPN1] },
      { label: 'PASSIFS NON COURANTS', isSection: true, vals: ['', '', ''] },
      { label: 'Emprunts', indent: 1, vals: [passif.emprunts, passifN1.emprunts] },
      { label: 'Autres passifs financiers', indent: 1, vals: [passif.autresPassifsFinanciers, passifN1.autresPassifsFinanciers] },
      { label: 'Provisions', indent: 1, vals: [passif.provisions, passifN1.provisions] },
      { label: 'Total Passifs Non Courants', bold: true, vals: [totalPassifNonCourant, totalPassifNonCourantN1] },
      { label: 'PASSIFS COURANTS', isSection: true, vals: ['', '', ''] },
      { label: 'Fournisseurs et comptes rattaches', indent: 1, vals: [passif.fournisseurs, passifN1.fournisseurs] },
      { label: 'Autres passifs courants', indent: 1, vals: [passif.autresPassifsCourants, passifN1.autresPassifsCourants] },
      { label: 'Concours bancaires et autres passifs financiers', indent: 1, vals: [passif.concoursBancaires, passifN1.concoursBancaires] },
      { label: 'Total Passifs Courants', bold: true, vals: [totalPassifCourant, totalPassifCourantN1] },
      { label: 'TOTAL GENERAL PASSIF + CP', bold: true, vals: [totalPassif, totalPassifN1] },
    ];
    return (
      <div className="space-y-4">
        {renderToolbar(`Bilan (${type.toUpperCase()})`, isActif ? buildActifRows : buildPassifRows, `Bilan_${type}`)}
        {renderTable(headers, rows)}
        <div className={`rounded-lg p-4 flex items-center justify-between ${ecart < 1 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <span className="font-bold text-gray-700">{isActif ? 'TOTAL ACTIF' : 'TOTAL CP + PASSIF'}</span>
          <div className="flex gap-8 items-center">
            <div className="text-right"><div className="text-xs text-gray-500">N</div><div className="font-bold font-mono text-lg">{fmt(isActif ? totalActif : totalPassif)}</div></div>
            <div className="text-right"><div className="text-xs text-gray-500">Ecart</div><div className={`font-bold font-mono text-lg ${ecart < 1 ? 'text-green-700' : 'text-red-700'}`}>{ecart < 1 ? 'Equilibre' : fmt(ecart)}</div></div>
          </div>
        </div>
      </div>
    );
  };

  // ===== TAB AMT =====
  const renderTabAmt = () => {
    const headers = ['Categorie', 'VB Ouverture', 'Acquisitions', 'Cessions', 'Dotations', 'Regul', 'VCN Fin'];
    const rows = immob.map(l => ({
      label: l.cat,
      vals: [l.vbN1, l.acq, l.ces, l.dot, l.reg, (l.vbN + l.acq - l.ces) - (l.amortN1 + l.dot - l.reg)],
    }));
    return (
      <div className="space-y-4">
        {renderToolbar("Tableau des Immobilisations", buildTabAmtRows, 'TAB_AMT')}
        <div className="bg-white border rounded-lg p-3 flex flex-wrap items-center gap-3">
          <input ref={fileRefImmob} type="file" accept=".xls,.xlsx,.csv,.txt" className="hidden" onChange={handleFileImportImmob} />
          <button onClick={() => fileRefImmob.current?.click()}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded text-sm flex items-center gap-2 font-medium">
            <Upload size={14} /> Importer Excel
          </button>
          <button onClick={() => {
            if (balanceN.length === 0) return;
            const findAmort = (code: string) => {
              const trySwap = code.slice(0, 2) === '22' ? '28' + code.slice(2) : '';
              const match = trySwap ? balanceN.find(l => l.compte === trySwap) : null;
              return match ? Math.abs(match.solde) : 0;
            };
            const immoCorpAccounts = balanceN.filter(l => l.compte.startsWith('22') && Math.abs(l.solde) > 0);
            const newImmob: LigneImob[] = [];
            for (const acc of immoCorpAccounts) {
              const name = acc.libelle || acc.compte;
              const amort = findAmort(acc.compte);
              newImmob.push({ cat: name, vbN: Math.abs(acc.solde), acq: 0, ces: 0, dot: amort, reg: 0, vbN1: 0, amortN1: 0 });
            }
            if (newImmob.length > 0) {
              newImmob.push({ cat: 'Immobilisations incorporelles', vbN: sumDebit(balanceN, ['21']), acq: 0, ces: 0, dot: sumCredit(balanceN, ['281', '291']), reg: 0, vbN1: 0, amortN1: 0 });
              newImmob.push({ cat: 'Immobilisations corporelles (total)', vbN: sumDebit(balanceN, ['22', '23', '24']), acq: 0, ces: 0, dot: sumCredit(balanceN, ['282', '284', '292']), reg: 0, vbN1: 0, amortN1: 0 });
              newImmob.push({ cat: 'Immobilisations financières', vbN: sumDebit(balanceN, ['25', '26']), acq: 0, ces: 0, dot: sumCredit(balanceN, ['295', '296', '297']), reg: 0, vbN1: 0, amortN1: 0 });
              setImmob(newImmob);
              setImmobCount(newImmob.length);
            }
          }} disabled={balanceN.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white px-4 py-1.5 rounded text-sm flex items-center gap-2 font-medium">
            <RefreshCw size={14} />
            Regénérer depuis la balance
          </button>
          {immobCount > 0 && (
            <span className="text-xs text-purple-600 flex items-center gap-1">
              <CheckCircle size={14} /> {immobCount} lignes
            </span>
          )}
          {balanceN.length === 0 && (
            <span className="text-xs text-amber-600">⚠ Importez d'abord la Balance N</span>
          )}
        </div>
        {renderTable(headers, rows, { label: 'Total', vals: [immob.reduce((s, l) => s + l.vbN1, 0), totalImobAcq, totalImobCes, totalImobDot, totalImobReg, totalImobVCN] })}
      </div>
    );
  };

  // ===== FLUX =====
  const renderFlux = () => {
    const headers = ['Libelle', `N (${anneeN})`, `N-1 (${annexeN1})`];
    const rows = [
      { label: "Flux de tresorerie lies a l'exploitation", isSection: true, vals: [fluxExploit, ''] },
      { label: 'Resultat net', indent: 1, vals: [flux.resultatNet, ''] },
      { label: 'Dotations aux amortissements', indent: 1, vals: [flux.dotationsProvisions, ''] },
      { label: 'Variation des stocks', indent: 2, vals: [flux.variationStocks, ''] },
      { label: 'Variation des creances', indent: 2, vals: [flux.variationCreances, ''] },
      { label: 'Variation autres actifs', indent: 2, vals: [flux.variationAutresActifs, ''] },
      { label: 'Variation fournisseurs', indent: 2, vals: [flux.variationFournisseurs, ''] },
      { label: 'Plus/moins values de cession', indent: 1, vals: [flux.plusMoinsValuesCession, ''] },
      { label: 'Reprise sur provisions', indent: 1, vals: [flux.repriseProvisions, ''] },
      { label: "Flux de tresorerie lies aux activites d'investissement", isSection: true, vals: [fluxInvest, ''] },
      { label: "Acquisitions d'immobilisations", indent: 1, vals: [flux.acqImmobilisations, ''] },
      { label: "Cessions d'immobilisations", indent: 1, vals: [flux.cessionsImmobilisations, ''] },
      { label: 'Prets accordes au Personnel', indent: 1, vals: [flux.pretsPersonnel, ''] },
      { label: 'Flux de tresorerie lies aux activites de financement', isSection: true, vals: [fluxFinanc, ''] },
      { label: 'Dividendes', indent: 1, vals: [flux.dividendes, ''] },
      { label: 'Variation situation nette', indent: 1, vals: [flux.variationSitNet, ''] },
      { label: 'Encaissements emprunts', indent: 1, vals: [flux.encaissementsEmprunts, ''] },
      { label: "Remboursements d'emprunts", indent: 1, vals: [flux.remboursementsEmprunts, ''] },
      { label: 'VARIATION DE TRESORERIE', bold: true, vals: [variationTresorerie, ''] },
      { label: `Tresorerie ${annexeN1}`, indent: 1, vals: [flux.tresorerieN1, ''] },
      { label: `Tresorerie ${anneeN}`, bold: true, vals: [tresorerieN, ''] },
    ];
    return (
      <div className="space-y-4">
        {renderToolbar("Tableau des Flux de Tresorerie", buildFluxRows, 'FLUX')}
        {renderTable(headers, rows)}
      </div>
    );
  };

  // ===== SIG =====
  const renderSIG = () => {
    const headers = ['Libelle', `N (${anneeN})`, `N-1 (${annexeN1})`];
    const rows = [
      { label: "PRODUITS D'EXPLOITATION", isSection: true, vals: [totalProduitsExploit, ''] },
      { label: 'Ventes de marchandises', indent: 1, vals: [sig.ventesMarchandises, ''] },
      { label: "Cout d'achat marchandises vendues", indent: 1, vals: [sig.cAchatMarchandises, ''] },
      { label: 'MARGE COMMERCIALE', bold: true, vals: [margeCommerciale, ''] },
      { label: 'Revenus', indent: 1, vals: [sig.revenus, ''] },
      { label: 'Production stockee', indent: 1, vals: [sig.productionStockee, ''] },
      { label: "PRODUCTION DE L'EXERCICE", bold: true, vals: [productionExercice, ''] },
      { label: 'Achats consommes', indent: 1, vals: [sig.achatsConsommes, ''] },
      { label: 'MARGE BRUTE TOTALE', bold: true, vals: [margeBruteTotale, ''] },
      { label: 'Subvention exploitation', indent: 1, vals: [sig.subventionExploit, ''] },
      { label: 'Autres charges externes', indent: 1, vals: [sig.autresChargesExternes, ''] },
      { label: 'VALEUR AJOUTEE BRUTE', bold: true, vals: [valeurAjouteeBrute, ''] },
      { label: 'Impots et taxes', indent: 1, vals: [sig.impotsTaxes, ''] },
      { label: 'Charges de personnel', indent: 1, vals: [sig.chargesPersonnel, ''] },
      { label: "EXCEDENT BRUT D'EXPLOITATION", bold: true, vals: [ebe, ''] },
      { label: 'Charges financieres nettes', indent: 1, vals: [sig.chargesFinancieres, ''] },
      { label: 'Produits des placements', indent: 1, vals: [sig.produitsPlacements, ''] },
      { label: 'Autres gains ordinaires', indent: 1, vals: [sig.autresGainsOrdinaires, ''] },
      { label: 'Autres pertes ordinaires', indent: 1, vals: [sig.autresPertesOrdinaires, ''] },
      { label: 'Transfert et reprise de charges', indent: 1, vals: [sig.transfertRepriseCharges, ''] },
      { label: 'Dotations aux amortissements', indent: 1, vals: [sig.dotationsAmortProvisions, ''] },
      { label: "RESULTAT D'EXPLOITATION", bold: true, vals: [resultatExploitSIG, ''] },
      { label: 'Impot sur les benefices', indent: 1, vals: [sig.impotBenefices, ''] },
      { label: 'RESULTAT NET', bold: true, vals: [resultatNetSIG, ''] },
    ];
    return (
      <div className="space-y-4">
        {renderToolbar("Soldes Intermediaires de Gestion", buildSigRows, 'SIG')}
        {renderTable(headers, rows)}
      </div>
    );
  };

  // ===== FISC RENDER =====
  const buildFiscRows = (): any[][] => {
    const r = fisc.reintegrations;
    const d = fisc.deductions;
    const IS = fisc.impotSocietes;
    return [
      [' '],
      [],
      [`TABLEAU DE DETERMINATION DU RESULTAT FISCAL ${anneeN}`],
      [],
      [],
      [],
      [],
      [null, 'Resultat comptable ', null, null, null, fisc.resultatComptable],
      [],
      [null, 'Reintegrations:', null, null, null, totalReintegrations],
      [],
      [null, null, 'Impots sur le resultat', null, null, r.impotsResultat],
      [null, null, 'Css ', null, null, r.css],
      [null, null, 'Timbres de voyage'],
      [null, null, 'Penalites de retard', null, null, r.penalitesRetard],
      [null, null, 'Dotations aux provision sur indemnites de mise a la retraite', null, null, r.provisionsRetraite],
      [null, null, 'Charges non deductibles'],
      [null, null, 'pertes exceptionnelles'],
      [null, null, 'factures non en bonne et due forme'],
      [null, null, 'Dotations aux provisions pour conges payes', null, null, r.provisionsConges],
      [null, null, 'Dotations aux resorption des charges'],
      [null, null, 'Reprise gain de change sur reevaluation', null, null, r.repriseGainChange],
      [null, null, 'Pertes de change sur reevaluations '],
      [null, null, null, null, null, 0],
      [null, 'Deductions:', null, null, null, totalDeductions],
      [null, null, 'Reprise de la perte de change sur reevaluation', null, null, d.reprisePerteChange],
      [null, null, 'Gain de change sur reevaluation '],
      [],
      [null, 'Resultat fiscal ', null, null, null, resultatFiscalCalc],
      [null, 'Resultat imposable', null, null, null, resultatFiscalCalc],
      [],
      [null, `Impot sur les societes ${anneeN}`, null, null, null, IS],
      [null, 'Acompte provisionnel', null, null, null, fisc.acompteProvisionnel],
      [null, 'report d impot', null, null, null, fisc.reportImpot2024],
      [null, 'Retenue a la source / clients', null, null, null, fisc.retenueSourceClients],
      [null, null, null, null, null, 0],
      [null, null, null, null, null, 0],
      [null, null, null, null, null, 0],
      [null, null, null, null, null, 0],
      [null, `IS due au titre de l'exercice`, null, null, null, IS],
    ];
  };
  const renderFisc = () => {
    const r = fisc.reintegrations;
    const d = fisc.deductions;
    const headers = ['Libelle', '', '', '', '', `N (${anneeN})`];
    const rows = [
      { label: 'Resultat comptable', vals: [fisc.resultatComptable] },
      { label: 'REINTEGRATIONS', isSection: true, vals: [totalReintegrations] },
      { label: 'Impots sur le resultat', indent: 1, vals: [r.impotsResultat] },
      { label: 'CSS', indent: 1, vals: [r.css] },
      { label: 'Timbres de voyage', indent: 1, vals: [r.timbresVoyage] },
      { label: 'Penalites de retard', indent: 1, vals: [r.penalitesRetard] },
      { label: 'Dotations provisions retraite', indent: 1, vals: [r.provisionsRetraite] },
      { label: 'Charges non deductibles', indent: 1, vals: [r.chargesNonDeductibles] },
      { label: 'Pertes exceptionnelles', indent: 1, vals: [r.pertesExceptionnelles] },
      { label: 'Factures non conformes', indent: 1, vals: [r.facturesNonConformes] },
      { label: 'Dotations provisions conges', indent: 1, vals: [r.provisionsConges] },
      { label: 'Reprise gain de change reeval', indent: 1, vals: [r.repriseGainChange] },
      { label: 'Pertes de change reeval', indent: 1, vals: [r.pertesChangeReeval] },
      { label: 'DEDUCTIONS', isSection: true, vals: [totalDeductions] },
      { label: 'Reprise perte de change reeval', indent: 1, vals: [d.reprisePerteChange] },
      { label: 'Gain de change reeval', indent: 1, vals: [d.gainChangeReeval] },
      { label: 'RESULTAT FISCAL', bold: true, vals: [resultatFiscalCalc] },
      { label: 'Resultat imposable', bold: true, vals: [resultatFiscalCalc] },
      { label: 'IS ' + anneeN, isSection: true, vals: [fisc.impotSocietes] },
      { label: 'Acompte provisionnel', indent: 1, vals: [fisc.acompteProvisionnel] },
      { label: 'Report impot ' + (anneeN - 1), indent: 1, vals: [fisc.reportImpot2024] },
      { label: 'Retenue source / clients', indent: 1, vals: [fisc.retenueSourceClients] },
      { label: 'Reports IS', indent: 1, vals: [fisc.reportIS] },
      { label: 'CSS ' + anneeN, indent: 1, vals: [fisc.css2025] },
      { label: 'Report CSS ' + (anneeN - 1), indent: 1, vals: [fisc.reportCSS2024] },
      { label: 'Report CSS ' + anneeN, indent: 1, vals: [fisc.reportCSS2025] },
    ];
    return (
      <div className="space-y-4">
        {renderToolbar("Resultat Fiscal", buildFiscRows, 'RESULTAT_FISCAL')}
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Resultat comptable</label>
              <input type="number" step="0.001" value={fisc.resultatComptable}
                onChange={e => updateFisc('resultatComptable', parseFloat(e.target.value) || 0)}
                className="w-full border rounded px-2 py-1 text-sm" />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">Reintegrations</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['impotsResultat', 'Impots resultat'], ['css', 'CSS'], ['timbresVoyage', 'Timbres voyage'],
                ['penalitesRetard', 'Penalites retard'], ['provisionsRetraite', 'Provisions retraite'],
                ['chargesNonDeductibles', 'Charges non deductibles'], ['pertesExceptionnelles', 'Pertes exceptionnelles'],
                ['facturesNonConformes', 'Factures non conformes'], ['provisionsConges', 'Provisions conges'],
                ['repriseGainChange', 'Reprise gain change'], ['pertesChangeReeval', 'Pertes change reeval'],
              ].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-gray-500">{label}</label>
                  <input type="number" step="0.001" value={(r as any)[k]}
                    onChange={e => updateFiscReintegrations(k, parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1 text-sm" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">Deductions</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['reprisePerteChange', 'Reprise perte change'], ['gainChangeReeval', 'Gain change reeval'],
              ].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-gray-500">{label}</label>
                  <input type="number" step="0.001" value={(d as any)[k]}
                    onChange={e => updateFiscDeductions(k, parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1 text-sm" />
                </div>
              ))}
            </div>
          </div>
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-gray-600 mb-2">Impot sur les societes</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['impotSocietes', 'IS ' + anneeN], ['acompteProvisionnel', 'Acompte provisionnel'],
                ['reportImpot2024', 'Report impot ' + (anneeN - 1)], ['retenueSourceClients', 'Retenue source clients'],
                ['reportIS', 'Reports IS'], ['css2025', 'CSS ' + anneeN],
                ['reportCSS2024', 'Report CSS ' + (anneeN - 1)], ['reportCSS2025', 'Report CSS ' + anneeN],
              ].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-gray-500">{label}</label>
                  <input type="number" step="0.001" value={(fisc as any)[k]}
                    onChange={e => updateFisc(k, parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1 text-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
        {renderTable(headers.filter((_, i) => i > 0), rows)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => selected ? setSelected(null) : navigate('/')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Etats Financiers</h1>
            <span className="text-xs text-gray-500">Generation automatique des etats financiers</span>
          </div>
        </div>
        <button onClick={exportAllEF}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
          <Download size={16} /> Exporter tout (XLSX)
        </button>
      </div>
      {renderInputs()}
      {/* AI Verification Button */}
      {!selected && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrainCircuit className="text-purple-600" size={24} />
              <div>
                <h3 className="font-semibold text-gray-800">Vérification IA des États Financiers</h3>
                <p className="text-xs text-gray-500">Analyse complète: bilan, résultat, SIG, cohérence PCG tunisien</p>
              </div>
            </div>
            <button
              onClick={handleVerifyAI}
              disabled={aiLoading}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {aiLoading ? (
                <><span className="animate-spin">⏳</span> Analyse en cours...</>
              ) : (
                <><BrainCircuit size={16} /> Vérifier avec IA</>
              )}
            </button>
          </div>
        </div>
      )}
      {/* AI Results Panel */}
      {showAiPanel && (
        <div className="bg-white border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <BrainCircuit size={18} className="text-purple-600" />
              Résultat Vérification IA
            </h3>
            <button onClick={() => setShowAiPanel(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕ Fermer</button>
          </div>
          {aiLoading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-pulse text-2xl mb-2">🧠</div>
              <div>Analyse en cours...</div>
            </div>
          ) : aiResult ? (
            <div className="space-y-3">
              {/* Status */}
              <div className={`rounded-lg p-3 flex items-center gap-2 ${aiResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {aiResult.ok ? <CheckCircle className="text-green-600" size={18} /> : <span className="text-red-600">⚠️</span>}
                <span className="font-medium">{aiResult.ok ? 'Vérification terminée' : 'Erreurs détectées'}</span>
              </div>
              {/* Summary */}
              {aiResult.summary && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-1">Résumé</div>
                  <div className="text-sm text-gray-600">{aiResult.summary}</div>
                </div>
              )}
              {/* Errors */}
              {aiResult.errors?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-red-700">Erreurs / Alertes</div>
                  {aiResult.errors.map((err: any, i: number) => (
                    <div key={i} className={`text-sm p-2 rounded ${err.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
                      <span className="font-mono text-xs">{err.field}</span>: {err.message}
                    </div>
                  ))}
                </div>
              )}
              {/* Suggestions */}
              {aiResult.suggestions?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-blue-700">Suggestions</div>
                  {aiResult.suggestions.map((s: string, i: number) => (
                    <div key={i} className="text-sm p-2 bg-blue-50 text-blue-700 rounded">💡 {s}</div>
                  ))}
                </div>
              )}
              {/* Raw response fallback */}
              {!aiResult.errors?.length && !aiResult.suggestions?.length && aiResult.response && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">{aiResult.response}</div>
              )}
            </div>
          ) : null}
        </div>
      )}
      {!selected ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {EF_TYPES.map(t => (
            <button key={t.key} onClick={() => setSelected(t.key)} className="bg-white border rounded-lg p-5 text-left hover:shadow-md transition-all group">
              <div className="text-3xl mb-2">{t.icon}</div>
              <div className="font-semibold text-gray-800 group-hover:text-blue-600">{t.label}</div>
              <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
            </button>
          ))}
        </div>
      ) : (
        <div>
          {selected === 'resultat' && renderESG()}
          {selected === 'actif' && renderBilan('actif')}
          {selected === 'passif' && renderBilan('passif')}
          {selected === 'tab-amt' && renderTabAmt()}
          {selected === 'flux' && renderFlux()}
          {selected === 'sig' && renderSIG()}
          {selected === 'fisc' && renderFisc()}
        </div>
      )}
    </div>
  );
}
