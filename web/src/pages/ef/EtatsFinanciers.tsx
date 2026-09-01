import { useState, useRef } from 'react';
import { ArrowLeft, Download, Copy, CheckCircle, Upload, FileSpreadsheet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type BalanceLigne = { compte: string; libelle: string; debit: number; credit: number; solde: number };

function parseBalanceCSV(text: string): BalanceLigne[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  const result: BalanceLigne[] = [];
  for (const line of lines) {
    const parts = line.split(/[;,]/).map(s => s.trim().replace(/["\s]/g, '').replace(',', '.'));
    if (parts.length < 2) continue;
    const compte = parts[0].replace(/\D/g, '');
    if (!compte || compte.length < 3 || isNaN(parseInt(compte))) continue;
    const libelle = parts[1] || '';
    const parseNum = (s: string) => {
      if (!s || s === '' || s === '-') return 0;
      return parseFloat(s.replace(/\s/g, '').replace(/,/g, '.')) || 0;
    };
    const debit = parseNum(parts[2] || '0');
    const credit = parseNum(parts[3] || '0');
    const solde = parts[4] ? parseNum(parts[4]) : debit - credit;
    result.push({ compte, libelle, debit, credit, solde });
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
  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const compte = String(row[0] || '').replace(/\D/g, '');
    if (!compte || compte.length < 3 || isNaN(parseInt(compte))) continue;
    const libelle = String(row[1] || '');
    const parseNum = (v: any) => {
      if (v === null || v === undefined || v === '' || v === '-') return 0;
      if (typeof v === 'number') return v;
      return parseFloat(String(v).replace(/\s/g, '').replace(/,/g, '.')) || 0;
    };
    const debit = parseNum(row[2]);
    const credit = parseNum(row[3]);
    const solde = row[4] !== undefined ? parseNum(row[4]) : debit - credit;
    result.push({ compte, libelle, debit, credit, solde });
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
    .reduce((s, l) => s + l.debit, 0);
}

function sumCredit(lignes: BalanceLigne[], prefixes: string[]): number {
  return lignes
    .filter(l => prefixes.some(p => l.compte.startsWith(p)))
    .reduce((s, l) => s + l.credit, 0);
}

type EFType = 'actif' | 'passif' | 'resultat' | 'tab-amt' | 'flux' | 'sig';

const EF_TYPES: { key: EFType; label: string; icon: string; desc: string }[] = [
  { key: 'resultat', label: 'Etat des soldes de gestion', icon: '📊', desc: 'Produits et charges - Resultat net' },
  { key: 'actif', label: 'Bilan (Actif)', icon: '🏢', desc: 'Actifs non courants et courants' },
  { key: 'passif', label: 'Bilan (Passif)', icon: '📋', desc: 'Capitaux propres et passifs' },
  { key: 'tab-amt', label: 'Tableau des Immobilisations', icon: '🏗️', desc: 'VB, acquisitions, cessions, amortissements' },
  { key: 'flux', label: 'Tableau des Flux de Tresorerie', icon: '💧', desc: 'Flux exploitation, investissement, financement' },
  { key: 'sig', label: 'Soldes Intermediaires de Gestion', icon: '📈', desc: 'Marge, EBE, resultat' },
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
  const [balanceN, setBalanceN] = useState<BalanceLigne[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileRefN1 = useRef<HTMLInputElement>(null);

  // ===== IMPORT BALANCE → AUTO-FILL EF =====
  const applyBalance = (lignes: BalanceLigne[]) => {
    setBalanceN(lignes);
    // ACTIF
    setActif({
      immoIncorpBrut: sumSoldeAbs(lignes, ['21']),
      immoIncorpAmort: sumSoldeAbs(lignes, ['281', '291', '2931']),
      immoCorpBrut: sumSoldeAbs(lignes, ['22', '23', '24']),
      immoCorpAmort: sumSoldeAbs(lignes, ['282', '284', '292', '2932', '2938', '294']),
      immoFinancBrut: sumSoldeAbs(lignes, ['25', '26']),
      immoFinancProv: sumSoldeAbs(lignes, ['295', '296', '297']),
      autresActifsNonCourants: sumSoldeAbs(lignes, ['27']),
      stocks: sumSoldeAbs(lignes, ['31', '32', '33', '34', '35', '36', '37']),
      stocksProv: sumSoldeAbs(lignes, ['39']),
      clients: sumSoldeAbs(lignes, ['41']),
      clientsProv: sumSoldeAbs(lignes, ['491']),
      autresActifsCourants: sumSoldeAbs(lignes, ['40', '42', '43', '44', '45', '47', '48'])
        - sumSoldeAbs(lignes, ['491', '495', '496']),
      tresorerie: sumSoldeAbs(lignes, ['53', '54', '51', '52', '55']) - sumSoldeAbs(lignes, ['59']),
    });
    // PASSIF
    setPassif({
      capitalSocial: Math.abs(sumSolde(lignes, ['101'])),
      reserves: Math.abs(sumSolde(lignes, ['111', '112', '117', '118'])),
      resultatsReportes: Math.abs(sumSolde(lignes, ['121', '128'])),
      resultatExercice: Math.abs(sumSolde(lignes, ['131', '135'])),
      emprunts: Math.abs(sumSolde(lignes, ['16'])),
      autresPassifsFinanciers: Math.abs(sumSolde(lignes, ['18'])) - Math.abs(sumSoldeAbs(lignes, ['18'])),
      provisions: Math.abs(sumSolde(lignes, ['15'])),
      fournisseurs: Math.abs(sumSolde(lignes, ['40'])),
      autresPassifsCourants: Math.abs(sumSolde(lignes, ['419', '422', '423', '425', '427', '428', '432', '433', '434', '435', '436', '437', '438', '441', '442', '447', '448', '453', '454', '457', '458', '46', '472', '48'])),
      concoursBancaires: Math.abs(sumSolde(lignes, ['501', '505', '506', '507', '508', '532', '537'])),
    });
    // RESULTAT
    setResultat({
      revenus: sumSolde(lignes, ['70']),
      autresProduitsExploit: sumSolde(lignes, ['72', '731', '732', '733', '734', '738', '781', '79']),
      transfertCharges: 0,
      achatsConsommes: sumSolde(lignes, ['60']),
      chargesPersonnel: sumSolde(lignes, ['64']),
      dotationsAmort: sumSolde(lignes, ['681']),
      autresChargesExploit: sumSolde(lignes, ['606', '61', '62', '63', '66']),
      chargesFinancieres: sumSolde(lignes, ['65', '6865', '6861']),
      produitsPlacements: sumSolde(lignes, ['75', '7866']),
      autresGainsOrdinaires: sumSolde(lignes, ['736', '735', '739']),
      autresPertesOrdinaires: sumSolde(lignes, ['633', '634', '635', '636', '637', '638']),
      impotBenefices: sumSolde(lignes, ['691', '697']),
      elementsExtraordinaires: sumSolde(lignes, ['77', '67']),
    });
    // SIG
    setSig({
      ventesMarchandises: sumSolde(lignes, ['707', '7097']),
      cAchatMarchandises: sumSolde(lignes, ['607', '6037']),
      revenus: sumSolde(lignes, ['701', '702', '703', '704', '705', '706', '708', '709']) - sumSolde(lignes, ['707', '7097']),
      productionStockee: sumSolde(lignes, ['71']),
      achatsConsommes: sumSolde(lignes, ['601', '602', '604', '605', '606', '6031', '6032']),
      subventionExploit: sumSolde(lignes, ['74']),
      autresChargesExternes: sumSolde(lignes, ['606', '61', '62', '631']),
      impotsTaxes: sumSolde(lignes, ['66']),
      chargesPersonnel: sumSolde(lignes, ['64']),
      chargesFinancieres: sumSolde(lignes, ['65', '6865', '6861']),
      produitsPlacements: sumSolde(lignes, ['75', '7866']),
      autresGainsOrdinaires: sumSolde(lignes, ['735', '736', '739', '79']),
      autresPertesOrdinaires: sumSolde(lignes, ['633', '634', '635', '636', '637', '638']),
      transfertRepriseCharges: sumSolde(lignes, ['78']) - sumSolde(lignes, ['68']),
      dotationsAmortProvisions: sumSolde(lignes, ['68']),
      impotBenefices: sumSolde(lignes, ['691', '697']),
    });
    setBalanceCount(lignes.length);
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
    // Auto-fill Flux variations from N vs N-1
    const stocksN = sumSoldeAbs(balanceN, ['31', '32', '33', '34', '35', '36', '37']);
    const stocksN1 = sumSoldeAbs(lignes, ['31', '32', '33', '34', '35', '36', '37']);
    const clientsN = sumSoldeAbs(balanceN, ['41']);
    const clientsN1 = sumSoldeAbs(lignes, ['41']);
    const frsN = sumSoldeAbs(balanceN, ['40']);
    const frsN1 = sumSoldeAbs(lignes, ['40']);
    const autresActifsN = sumSoldeAbs(balanceN, ['42', '43', '44', '45', '47']);
    const autresActifsN1 = sumSoldeAbs(lignes, ['42', '43', '44', '45', '47']);

    // Dotations N-1
    const dotN1 = sumSolde(lignes, ['68']);

    // Resultat N-1
    const prodN1 = sumSolde(lignes, ['70']);
    const chargesN1 = sumSolde(lignes, ['60', '61', '62', '63', '64', '66', '681']);

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
    const immoCorpBrutN = sumSoldeAbs(balanceN, ['22', '23', '24']);
    const immoCorpBrutN1 = sumSoldeAbs(lignes, ['22', '23', '24']);
    const immoCorpAmortN = sumSoldeAbs(balanceN, ['282', '284', '292', '2932', '2938', '294']);
    const immoCorpAmortN1 = sumSoldeAbs(lignes, ['282', '284', '292', '2932', '2938', '294']);

    const immoIncorpBrutN = sumSoldeAbs(balanceN, ['21']);
    const immoIncorpBrutN1 = sumSoldeAbs(lignes, ['21']);
    const immoIncorpAmortN = sumSoldeAbs(balanceN, ['281', '291', '2931']);
    const immoIncorpAmortN1 = sumSoldeAbs(lignes, ['281', '291', '2931']);

    setImmob(prev => prev.map((l, i) => {
      if (i === 0) return { ...l, vbN1: immoIncorpBrutN1, amortN1: immoIncorpAmortN1 }; // incorp
      if (i === 2) return { ...l, vbN1: immoCorpBrutN1, amortN1: immoCorpAmortN1 }; // corp
      return l;
    }));

    setBalanceN1(lignes);
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
  const updateActif = (k: string, v: number) => setActif(prev => ({ ...prev, [k]: v }));

  const actifImmobNet = (actif.immoIncorpBrut - actif.immoIncorpAmort) + (actif.immoCorpBrut - actif.immoCorpAmort) + (actif.immoFinancBrut - actif.immoFinancProv);
  const actifStocksNet = actif.stocks - actif.stocksProv;
  const actifCreancesNet = actif.clients - actif.clientsProv + actif.autresActifsCourants;
  const totalNonCourants = actifImmobNet + actif.autresActifsNonCourants;
  const totalCourants = actifStocksNet + actifCreancesNet + actif.tresorerie;
  const totalActif = totalNonCourants + totalCourants;

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
  const updatePassif = (k: string, v: number) => setPassif(prev => ({ ...prev, [k]: v }));

  const totalCP = passif.capitalSocial + passif.reserves + passif.resultatsReportes + passif.resultatExercice;
  const totalPassifNonCourant = passif.emprunts + passif.autresPassifsFinanciers + passif.provisions;
  const totalPassifCourant = passif.fournisseurs + passif.autresPassifsCourants + passif.concoursBancaires;
  const totalPassif = totalCP + totalPassifNonCourant + totalPassifCourant;

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

  const annexeN1 = anneeN - 1;

  // ===== EXPORT ACTIF XLSX =====
  const exportXLSX = async (sheetName: string, buildRows: () => any[][]) => {
    const XLSXMod = await import('xlsx');
    const XLSX = XLSXMod.default || XLSXMod;
    const rows = buildRows();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 5 }, { wch: 40 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 5 }, { wch: 5 }, { wch: 18 }, { wch: 5 }, { wch: 18 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `EF-${sheetName}-${nomSociete || 'societe'}-${anneeN}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  const buildActifRows = (): any[][] => [
    [nomSociete],
    [`BILANS COMPARES ARRETES AUX 31 Decembre ${anneeN} & 31 Decembre ${annexeN1}`],
    ['(en dinars tunisiens)'],
    [],
    ['ACTIFS', '', '', '', '', '', '', '', totalActif],
    [],
    ['ACTIFS NON COURANTS'],
    [],
    ['', 'Actifs immobilises'],
    ['', '', 'Immobilisations incorporelles', '', '', '', '', '', actif.immoIncorpBrut],
    ['', '', 'Moins : amortissements', '', '', '', '', '', -actif.immoIncorpAmort],
    ['', '', '', '', '', '', '', '', actif.immoIncorpBrut - actif.immoIncorpAmort],
    [],
    ['', '', 'Immobilisations corporelles', '', '', '', '', '', actif.immoCorpBrut],
    ['', '', 'Moins : amortissements', '', '', '', '', '', -actif.immoCorpAmort],
    ['', '', '', '', '', '', '', '', actif.immoCorpBrut - actif.immoCorpAmort],
    [],
    ['', '', 'Immobilisations financieres', '', '', '', '', '', actif.immoFinancBrut],
    ['', '', 'Moins : provisions', '', '', '', '', '', -actif.immoFinancProv],
    ['', '', '', '', '', '', '', '', actif.immoFinancBrut - actif.immoFinancProv],
    [],
    ['', 'Total des actifs immobilises', '', '', '', '', '', '', actifImmobNet],
    [],
    ['', '', 'Autres actifs non courants', '', '', '', '', '', actif.autresActifsNonCourants],
    [],
    ['TOTAL DES ACTIFS NON COURANTS', '', '', '', '', '', '', '', totalNonCourants],
    [],
    ['ACTIFS COURANTS'],
    [],
    ['', '', 'Stocks', '', '', '', '', '', actif.stocks],
    ['', '', 'Moins : provisions', '', '', '', '', '', -actif.stocksProv],
    ['', '', '', '', '', '', '', '', actifStocksNet],
    [],
    ['', '', 'Clients et comptes rattaches', '', '', '', '', '', actif.clients],
    ['', '', 'Moins : provisions', '', '', '', '', '', -actif.clientsProv],
    ['', '', '', '', '', '', '', '', actif.clients - actif.clientsProv],
    [],
    ['', '', 'Autres actifs courants', '', '', '', '', '', actif.autresActifsCourants],
    [],
    ['', 'Total des actifs courants', '', '', '', '', '', '', totalCourants],
    [],
    ['TOTAL GENERAL ACTIF', '', '', '', '', '', '', '', totalActif],
  ];

  const buildPassifRows = (): any[][] => [
    ['', nomSociete],
    [`BILANS COMPARES ARRETES AUX 31 Decembre ${anneeN} & 31 Decembre ${annexeN1}`],
    ['(en dinars tunisiens)'],
    [],
    ['', 'CAPITAUX PROPRES ET PASSIFS', '', '', '', '', totalPassif],
    [],
    ['', 'CAPITAUX PROPRES ET PASSIFS'],
    [],
    ['', '', 'Capitaux propres'],
    ['', '', '', 'Capital social', '', '', passif.capitalSocial],
    ['', '', '', 'Reserves', '', '', passif.reserves],
    ['', '', '', 'Resultats reportes', '', '', passif.resultatsReportes],
    [],
    ['', '', '', 'Total capitaux propres avant resultat', '', '', totalCP - passif.resultatExercice],
    [],
    ['', '', '', "Resultat de l'exercice", '', '', passif.resultatExercice],
    [],
    ['', 'TOTAL CAPITAUX PROPRES', '', '', '', '', totalCP],
    [],
    [],
    ['', 'PASSIFS'],
    [],
    ['', '', 'Passifs non courants'],
    [],
    ['', '', '', 'Emprunts', '', '', passif.emprunts],
    ['', '', '', 'Autres passifs financiers', '', '', passif.autresPassifsFinanciers],
    ['', '', '', 'Provisions', '', '', passif.provisions],
    [],
    ['', '', 'Total passifs non courants', '', '', '', totalPassifNonCourant],
    [],
    ['', '', 'Passifs courants'],
    [],
    ['', '', '', 'Fournisseurs et comptes rattaches', '', '', passif.fournisseurs],
    ['', '', '', 'Autres passifs courants', '', '', passif.autresPassifsCourants],
    ['', '', '', 'Concours bancaires et autres passifs financiers', '', '', passif.concoursBancaires],
    [],
    ['', '', 'Total passifs courants', '', '', '', totalPassifCourant],
    [],
    ['', 'TOTAL GENERAL PASSIF + CP', '', '', '', '', totalPassif],
    [],
    ['CONTROLE:', `Total Actif = ${fmt(totalActif)} | Total CP+Passif = ${fmt(totalPassif)} | Ecart = ${fmt(Math.abs(totalActif - totalPassif))}`],
  ];

  const buildResultatRows = (): any[][] => [
    [nomSociete],
    [`ETAT DE RESULTAT COMPARE ARRETE AUX 31 Decembre ${anneeN} & 31 Decembre ${annexeN1}`],
    ['(en dinars tunisiens)'],
    [],
    ["PRODUITS D'EXPLOITATION"],
    ['', 'Revenus', '', '', '', '', resultat.revenus],
    ['', "Autres produits d'exploitation", '', '', '', '', resultat.autresProduitsExploit],
    ['', 'Transfert de charges', '', '', '', '', resultat.transfertCharges],
    ['', "Total des produits d'exploitation", '', '', '', '', totalProduitsExploit],
    [],
    ["CHARGES D'EXPLOITATION"],
    ['', 'Achats consommes', '', '', '', '', resultat.achatsConsommes],
    ['', 'Charges de personnel', '', '', '', '', resultat.chargesPersonnel],
    ['', 'Dotations aux amortissements et provisions', '', '', '', '', resultat.dotationsAmort],
    ['', "Autres charges d'exploitation", '', '', '', '', resultat.autresChargesExploit],
    ['', "Total des charges d'exploitation", '', '', '', '', totalChargesExploit],
    [],
    ["Resultat d'exploitation", '', '', '', '', '', resultatExploit],
    [],
    ['', 'Charges financieres nettes', '', '', '', '', chargesFinNettes],
    ['', 'Produits des placements', '', '', '', '', resultat.produitsPlacements],
    ['', 'Autres gains ordinaires', '', '', '', '', resultat.autresGainsOrdinaires],
    ['', 'Autres pertes ordinaires', '', '', '', '', -resultat.autresPertesOrdinaires],
    [],
    ['Resultat des activites ordinaires avant impot', '', '', '', '', '', resultatAvantImpot],
    [],
    ['', 'Impot sur les benefices', '', '', '', '', resultat.impotBenefices],
    [],
    ['Resultat des activites ordinaires apres impot', '', '', '', '', '', resultatOrdApresImpot],
    [],
    ['', 'Elements extraordinaires', '', '', '', '', resultat.elementsExtraordinaires],
    [],
    ['RESULTAT NET DE L\'EXERCICE', '', '', '', '', '', resultatNet],
  ];

  const buildTabAmtRows = (): any[][] => [
    [nomSociete],
    [`TABLEAU DE VARIATION DES IMMOBILISATIONS ET DES AMORTISSEMENTS AU 31 DECEMBRE ${anneeN}`],
    ['(En dinars tunisiens)'],
    [],
    ['', '', '', 'Valeurs brutes', '', '', '', '', 'Amortissements', '', '', '', 'VCN'],
    ['', '', '', `31/12/${annexeN1}`, 'Acquisitions', 'Cessions', `31/12/${anneeN}`, '', `31/12/${annexeN1}`, 'Dotation', 'Regul', `31/12/${anneeN}`, `31/12/${anneeN}`],
    [],
    ...immob.map(l => [l.cat, '', '', l.vbN1, l.acq, l.ces, l.vbN + l.acq - l.ces, '', l.amortN1, l.dot, l.reg, l.amortN1 + l.dot - l.reg, (l.vbN + l.acq - l.ces) - (l.amortN1 + l.dot - l.reg)]),
    [],
    ['Total', '', '', totalImobVB_N + immob.reduce((s, l) => s + l.vbN1, 0) / 2, totalImobAcq, totalImobCes, totalImobVB_N, '', immob.reduce((s, l) => s + l.amortN1, 0), totalImobDot, totalImobReg, immob.reduce((s, l) => s + l.amortN1, 0) + totalImobDot - totalImobReg, totalImobVCN],
  ];

  const buildFluxRows = (): any[][] => [
    [nomSociete],
    ['ETAT DES FLUX DE TRESORERIE'],
    [`COMPARES ARRETES AUX 31 Decembre ${anneeN} & 31 Decembre ${annexeN1}`],
    ['(en dinars tunisiens)'],
    [],
    ['Notes', `N (${anneeN})`, `N-1 (${annexeN1})`],
    [],
    ["Flux de tresorerie lies a l'exploitation"],
    ['', 'Resultat net', '', flux.resultatNet],
    ['', 'Ajustements pour :'],
    ['', '', 'Amortissements et provisions', '', flux.dotationsProvisions],
    ['', '', 'Variation des :'],
    ['', '', '', '- Stocks', '', flux.variationStocks],
    ['', '', '', '- Creances', '', flux.variationCreances],
    ['', '', '', '- Autres actifs', '', flux.variationAutresActifs],
    ['', '', '', '- Fournisseurs et autres dettes', '', flux.variationFournisseurs],
    ['', '', 'Plus ou moins values de cession', '', flux.plusMoinsValuesCession],
    ['', '', 'Reprise sur provisions', '', flux.repriseProvisions],
    ["Flux de tresorerie lies a l'exploitation", '', fluxExploit],
    [],
    ["Flux de tresorerie lies aux activites d'investissement"],
    ['', "Acquisitions d'immobilisations", '', flux.acqImmobilisations],
    ['', "Cessions d'immobilisations", '', flux.cessionsImmobilisations],
    ['', 'Prets accordes au Personnel', '', flux.pretsPersonnel],
    ['', "Cessions d'immobilisations financieres", '', flux.cessionsImmobFinancieres],
    ["Flux de tresorerie lies aux activites d'investissement", '', fluxInvest],
    [],
    ['Flux de tresorerie lies aux activites de financement'],
    ['', 'Dividendes et autres distributions', '', flux.dividendes],
    ['', 'Variation situation nette', '', flux.variationSitNet],
    ['', 'Encaissements provenant des emprunts', '', flux.encaissementsEmprunts],
    ['', "Remboursements d'emprunts", '', flux.remboursementsEmprunts],
    ['Flux de tresorerie lies aux activites de financement', '', fluxFinanc],
    [],
    ['VARIATION DE TRESORERIE', '', variationTresorerie],
    [`Tresorerie ${annexeN1}`, '', flux.tresorerieN1],
    [`Tresorerie ${anneeN}`, '', tresorerieN],
  ];

  const buildSigRows = (): any[][] => [
    [nomSociete],
    ['SOLDES INTERMEDIAIRES DE GESTION'],
    [`ARRETES COMPARES AUX 31 Decembre ${anneeN} & 31 Decembre ${annexeN1}`],
    ['(en dinars tunisiens)'],
    [],
    ['', 'Notes', `N (${anneeN})`, `N-1 (${annexeN1})`],
    [],
    ['', 'Ventes de marchandises', '', sig.ventesMarchandises],
    ['', "Cout d'achat des marchandises vendus", '', -sig.cAchatMarchandises],
    [],
    ['MARGE COMMERCIALE', '', margeCommerciale],
    [],
    ['', 'Revenus', '', sig.revenus],
    ['', 'Production stockee', '', sig.productionStockee],
    [],
    ["PRODUCTION DE L'EXERCICE", '', productionExercice],
    [],
    ['', 'Achats consommes', '', -sig.achatsConsommes],
    [],
    ['MARGE BRUTE TOTALE', '', margeBruteTotale],
    [],
    ['ACTIVITE TOTALE', '', margeBruteTotale],
    [],
    ['', 'Marge brute totale', '', margeBruteTotale],
    ['', "Subvention d'exploitation", '', sig.subventionExploit],
    ['', 'Autres charges externes', '', sig.autresChargesExternes],
    [],
    ['VALEUR AJOUTEE BRUTE', '', valeurAjouteeBrute],
    [],
    ['', 'Impots et taxes', '', -sig.impotsTaxes],
    ['', 'Charges de personnel', '', -sig.chargesPersonnel],
    [],
    ["EXCEDENT BRUT D'EXPLOITATION", '', ebe],
    [],
    ['', 'Charges financieres nettes', '', -sig.chargesFinancieres],
    ['', 'Produits des placements', '', sig.produitsPlacements],
    ['', 'Autres gains ordinaires', '', sig.autresGainsOrdinaires],
    ['', 'Autres pertes ordinaires', '', -sig.autresPertesOrdinaires],
    ['', 'Transfert et reprise de charges', '', sig.transfertRepriseCharges],
    ['', 'Dotation aux amortissements et aux provisions', '', -sig.dotationsAmortProvisions],
    [],
    ["RESULTAT D'EXPLOITATION", '', resultatExploitSIG],
    [],
    ['IMPOTS SUR LES BENEFICES', '', -sig.impotBenefices],
    [],
    ['RESULTAT NET DE L\'EXERCICE', '', resultatNetSIG],
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
            <CheckCircle size={14} /> {balanceCount} comptes importés
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
      { label: 'Immobilisations incorporelles (brut)', indent: 1, vals: [actif.immoIncorpBrut, ''] },
      { label: 'Amortissements incorporels', indent: 2, vals: [-actif.immoIncorpAmort, ''] },
      { label: 'Immobilisations corporelles (brut)', indent: 1, vals: [actif.immoCorpBrut, ''] },
      { label: 'Amortissements corporels', indent: 2, vals: [-actif.immoCorpAmort, ''] },
      { label: 'Autres actifs non courants', indent: 1, vals: [actif.autresActifsNonCourants, ''] },
      { label: 'Total Actifs Non Courants', bold: true, vals: [totalNonCourants, ''] },
      { label: 'ACTIFS COURANTS', isSection: true, vals: ['', '', ''] },
      { label: 'Stocks', indent: 1, vals: [actif.stocks, ''] },
      { label: 'Provisions stocks', indent: 2, vals: [-actif.stocksProv, ''] },
      { label: 'Clients et comptes rattaches', indent: 1, vals: [actif.clients, ''] },
      { label: 'Provisions clients', indent: 2, vals: [-actif.clientsProv, ''] },
      { label: 'Autres actifs courants', indent: 1, vals: [actif.autresActifsCourants, ''] },
      { label: 'Tresorerie', indent: 1, vals: [actif.tresorerie, ''] },
      { label: 'Total Actifs Courants', bold: true, vals: [totalCourants, ''] },
      { label: 'TOTAL GENERAL ACTIF', bold: true, vals: [totalActif, ''] },
    ] : [
      { label: 'CAPITAUX PROPRES', isSection: true, vals: ['', '', ''] },
      { label: 'Capital social', indent: 1, vals: [passif.capitalSocial, ''] },
      { label: 'Reserves', indent: 1, vals: [passif.reserves, ''] },
      { label: 'Resultats reportes', indent: 1, vals: [passif.resultatsReportes, ''] },
      { label: "Resultat de l'exercice", indent: 1, vals: [passif.resultatExercice, ''] },
      { label: 'Total Capitaux Propres', bold: true, vals: [totalCP, ''] },
      { label: 'PASSIFS NON COURANTS', isSection: true, vals: ['', '', ''] },
      { label: 'Emprunts', indent: 1, vals: [passif.emprunts, ''] },
      { label: 'Autres passifs financiers', indent: 1, vals: [passif.autresPassifsFinanciers, ''] },
      { label: 'Provisions', indent: 1, vals: [passif.provisions, ''] },
      { label: 'Total Passifs Non Courants', bold: true, vals: [totalPassifNonCourant, ''] },
      { label: 'PASSIFS COURANTS', isSection: true, vals: ['', '', ''] },
      { label: 'Fournisseurs et comptes rattaches', indent: 1, vals: [passif.fournisseurs, ''] },
      { label: 'Autres passifs courants', indent: 1, vals: [passif.autresPassifsCourants, ''] },
      { label: 'Concours bancaires et autres passifs financiers', indent: 1, vals: [passif.concoursBancaires, ''] },
      { label: 'Total Passifs Courants', bold: true, vals: [totalPassifCourant, ''] },
      { label: 'TOTAL GENERAL PASSIF + CP', bold: true, vals: [totalPassif, ''] },
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
        <div className="bg-white border rounded-lg p-3 flex items-center gap-3">
          <input ref={fileRefImmob} type="file" accept=".xls,.xlsx,.csv,.txt" className="hidden" onChange={handleFileImportImmob} />
          <button onClick={() => fileRefImmob.current?.click()}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded text-sm flex items-center gap-2 font-medium">
            <Upload size={14} /> Importer Extract Immobilisations
          </button>
          {immobCount > 0 && (
            <span className="text-xs text-purple-600 flex items-center gap-1">
              <CheckCircle size={14} /> {immobCount} categories importées
            </span>
          )}
          <span className="text-xs text-gray-400 ml-auto">Format: Categorie | VB ouverture | Acquisitions | Cessions | Dotations | Regul | Amort N-1</span>
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
      { label: "Cout d'achat marchandises vendues", indent: 1, vals: [-sig.cAchatMarchandises, ''] },
      { label: 'MARGE COMMERCIALE', bold: true, vals: [margeCommerciale, ''] },
      { label: 'Revenus', indent: 1, vals: [sig.revenus, ''] },
      { label: 'Production stockee', indent: 1, vals: [sig.productionStockee, ''] },
      { label: "PRODUCTION DE L'EXERCICE", bold: true, vals: [productionExercice, ''] },
      { label: 'Achats consommes', indent: 1, vals: [-sig.achatsConsommes, ''] },
      { label: 'MARGE BRUTE TOTALE', bold: true, vals: [margeBruteTotale, ''] },
      { label: 'Subvention exploitation', indent: 1, vals: [sig.subventionExploit, ''] },
      { label: 'Autres charges externes', indent: 1, vals: [sig.autresChargesExternes, ''] },
      { label: 'VALEUR AJOUTEE BRUTE', bold: true, vals: [valeurAjouteeBrute, ''] },
      { label: 'Impots et taxes', indent: 1, vals: [-sig.impotsTaxes, ''] },
      { label: 'Charges de personnel', indent: 1, vals: [-sig.chargesPersonnel, ''] },
      { label: "EXCEDENT BRUT D'EXPLOITATION", bold: true, vals: [ebe, ''] },
      { label: 'Charges financieres nettes', indent: 1, vals: [-sig.chargesFinancieres, ''] },
      { label: 'Produits des placements', indent: 1, vals: [sig.produitsPlacements, ''] },
      { label: 'Autres gains ordinaires', indent: 1, vals: [sig.autresGainsOrdinaires, ''] },
      { label: 'Autres pertes ordinaires', indent: 1, vals: [-sig.autresPertesOrdinaires, ''] },
      { label: 'Transfert et reprise de charges', indent: 1, vals: [sig.transfertRepriseCharges, ''] },
      { label: 'Dotations aux amortissements', indent: 1, vals: [-sig.dotationsAmortProvisions, ''] },
      { label: "RESULTAT D'EXPLOITATION", bold: true, vals: [resultatExploitSIG, ''] },
      { label: 'Impot sur les benefices', indent: 1, vals: [-sig.impotBenefices, ''] },
      { label: 'RESULTAT NET', bold: true, vals: [resultatNetSIG, ''] },
    ];
    return (
      <div className="space-y-4">
        {renderToolbar("Soldes Intermediaires de Gestion", buildSigRows, 'SIG')}
        {renderTable(headers, rows)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => selected ? setSelected(null) : navigate('/')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Etats Financiers</h1>
          <span className="text-xs text-gray-500">Generation automatique des etats financiers</span>
        </div>
      </div>
      {renderInputs()}
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
        </div>
      )}
    </div>
  );
}
