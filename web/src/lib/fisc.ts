// FISC DMI parser - client-side version of server-fisc.js

interface DMIItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

interface DMIData {
  mois: number;
  annee: number;
  retenue_salaires: number;
  css: number;
  retenue_loyers: number;
  retenue_marches: number;
  tfp_du: number;
  foprolos_du: number;
  timbre_fiscal: number;
  tcl_du: number;
  total_general: number;
  tva_collectee: number;
  tva_deductible: number;
  tva_report_precedent: number;
  tva_resultat: number;
  tva_signe: string;
}

const FISC_ACCOUNTS = ['457100','432100','432101','432300','432400','437300','437200','437500','437400','436510','436660','436670','436710','661100','661200','661300'];

function parseNumber(s: string): number {
  if (!s) return 0;
  let cleaned = s.replace(/ /g, '').replace(/٫/g, '.');
  if (!cleaned.includes('.') && !cleaned.includes('٫')) {
    const arabicDecimal = cleaned.indexOf('٫');
    if (arabicDecimal >= 0) {
      cleaned = cleaned.replace('٫', '.');
    }
  }
  if (!/[\d.,]/.test(cleaned)) return 0;
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function getNumbersByPage(items: DMIItem[]): Record<number, DMIItem[]> {
  const byPage: Record<number, DMIItem[]> = {};
  for (const item of items) {
    if (!/\d/.test(item.str)) continue;
    if (!byPage[item.page]) byPage[item.page] = [];
    byPage[item.page].push(item);
  }
  return byPage;
}

function findAmountsForAccount(items: DMIItem[], account: string, page?: number): number[] {
  const results: number[] = [];
  const searchItems = page ? items.filter(i => i.page === page) : items;

  for (let i = 0; i < searchItems.length; i++) {
    const item = searchItems[i];
    if (item.str.includes(account)) {
      const nearbyNumbers: DMIItem[] = [];
      for (let j = i + 1; j < Math.min(i + 5, searchItems.length); j++) {
        const next = searchItems[j];
        if (next.page !== item.page) break;
        if (Math.abs(next.y - item.y) > 5) break;
        if (/\d/.test(next.str) && next.str !== account) {
          nearbyNumbers.push(next);
        }
      }
      for (const numItem of nearbyNumbers) {
        const val = parseNumber(numItem.str);
        if (val > 0.001) results.push(val);
      }
    }
  }
  return results;
}

export function parseDMIItems(items: DMIItem[]): DMIData {
  const byPage = getNumbersByPage(items);
  const allPages = Object.keys(byPage).map(Number).sort((a, b) => a - b);

  const result: DMIData = {
    mois: 0, annee: 0,
    retenue_salaires: 0, css: 0, retenue_loyers: 0, retenue_marches: 0,
    tfp_du: 0, foprolos_du: 0, timbre_fiscal: 0, tcl_du: 0,
    total_general: 0, tva_collectee: 0, tva_deductible: 0,
    tva_report_precedent: 0, tva_resultat: 0, tva_signe: 'ب'
  };

  // Page 1: Date + main amounts
  const p1 = byPage[1] || [];
  for (const item of p1) {
    const dateMatch = item.str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dateMatch) {
      result.mois = parseInt(dateMatch[2]);
      result.annee = parseInt(dateMatch[3]);
    }
  }

  // Page 1 amounts (500-2000 range for retenue_salaires)
  const p1Nums = p1.filter(i => /\d/.test(i.str) && i.str.length < 30)
    .map(i => ({ val: parseNumber(i.str), y: i.y }))
    .filter(n => n.val > 0);

  const retenueCandidates = p1Nums.filter(n => n.val >= 500 && n.val <= 2000);
  if (retenueCandidates.length > 0) {
    result.retenue_salaires = retenueCandidates.reduce((max, n) => n.val > max.val ? n : max, retenueCandidates[0]).val;
  }

  // CSS
  const cssCandidates = p1Nums.filter(n => n.val > 10 && n.val < 200 && n.val !== result.retenue_salaires);
  if (cssCandidates.length > 0) {
    result.css = cssCandidates[0].val;
  }

  // Page 1 - other withholdings
  const p1Text = p1.map(i => i.str).join(' ');
  const loyerMatch = p1Text.match(/LOYERS?\s+([\d\s.,]+)/i);
  if (loyerMatch) result.retenue_loyers = parseNumber(loyerMatch[1]);

  const marcheMatch = p1Text.match(/MARCH[EÉ]S?\s+([\d\s.,]+)/i);
  if (marcheMatch) result.retenue_marches = parseNumber(marcheMatch[1]);

  // Pages 2-4: TFP, FOPROLOS, TCL
  for (let p = 2; p <= 4; p++) {
    const pageItems = byPage[p] || [];
    const pageText = pageItems.map(i => i.str).join(' ');
    const pageNums = pageItems.filter(i => /\d/.test(i.str)).map(i => parseNumber(i.str)).filter(n => n > 0);

    if (/TFP/i.test(pageText) && result.tfp_du === 0) {
      const tfpNums = pageNums.filter(n => n > 1 && n < 5000);
      if (tfpNums.length > 0) result.tfp_du = tfpNums[0];
    }
    if (/FOPROLOS/i.test(pageText) && result.foprolos_du === 0) {
      const foNums = pageNums.filter(n => n > 1 && n < 5000);
      if (foNums.length > 0) result.foprolos_du = foNums[0];
    }
    if (/TCL/i.test(pageText) && result.tcl_du === 0) {
      const tclNums = pageNums.filter(n => n > 1 && n < 5000);
      if (tclNums.length > 0) result.tcl_du = tclNums[0];
    }
  }

  // Timbre fiscal from page 2
  const p2 = byPage[2] || [];
  for (const item of p2) {
    if (/TIMBRE/i.test(item.str)) {
      for (let j = 0; j < 3; j++) {
        const next = p2.find(n => n !== item && Math.abs(n.y - item.y) < 5 && /\d/.test(n.str));
        if (next) { result.timbre_fiscal = parseNumber(next.str); break; }
      }
    }
  }

  // Page 6: total_general + TVA
  const p6 = byPage[6] || [];
  const p6Nums = p6.filter(i => /\d/.test(i.str) && i.str.length < 30)
    .map(i => ({ val: parseNumber(i.str), y: i.y, str: i.str }))
    .filter(n => n.val > 0);

  // total_general = largest value on page 6
  const generalCandidates = p6Nums.filter(n => n.val > 100);
  if (generalCandidates.length > 0) {
    result.total_general = generalCandidates.reduce((max, n) => n.val > max.val ? n : max, generalCandidates[0]).val;
  }

  // tva_resultat = smallest value > 5 on page 6 (or from page 5)
  const tvaCandidates = p6Nums.filter(n => n.val > 5 && n.val < result.total_general * 0.8);
  if (tvaCandidates.length > 0) {
    result.tva_resultat = tvaCandidates.reduce((min, n) => n.val < min.val ? n : min, tvaCandidates[0]).val;
  }

  // tva_signe
  const p6Text = p6.map(i => i.str).join(' ');
  if (/ف/.test(p6Text)) result.tva_signe = 'ف';
  else if (/ب/.test(p6Text)) result.tva_signe = 'ب';

  // Page 5: tva_collectee (max of lowest-Y group)
  const p5 = byPage[5] || [];
  const p5Nums = p5.filter(i => /\d/.test(i.str) && i.str.length < 30)
    .map(i => ({ val: parseNumber(i.str), y: i.y }))
    .filter(n => n.val > 100);

  if (p5Nums.length > 0) {
    const minY = Math.min(...p5Nums.map(n => n.y));
    const lowestGroup = p5Nums.filter(n => Math.abs(n.y - minY) < 10);
    result.tva_collectee = lowestGroup.reduce((max, n) => n.val > max.val ? n : max, lowestGroup[0]).val;
  }

  // tva_deductible from page 6
  const deductibleCandidates = p6Nums.filter(n => n.val > 100 && n.val < result.total_general && n.val !== result.tva_resultat);
  if (deductibleCandidates.length > 0) {
    result.tva_deductible = deductibleCandidates.reduce((min, n) => n.val < min.val ? n : min, deductibleCandidates[0]).val;
  }

  // tva_report_precedent
  const reportCandidates = p6Nums.filter(n => n.val > 0 && n.val < result.total_general && n.val !== result.tva_resultat && n.val !== result.tva_deductible);
  if (reportCandidates.length > 0) {
    result.tva_report_precedent = reportCandidates[0].val;
  }

  return result;
}

export function validateFISC(dmi: DMIData): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!dmi.mois || !dmi.annee) errors.push('Mois/annee manquants');
  if (dmi.total_general <= 0) errors.push('total_general invalide');

  // Check Piece A balance
  const creditsA = (dmi.retenue_salaires || 0) + (dmi.css || 0) + (dmi.retenue_loyers || 0) + (dmi.retenue_marches || 0) + (dmi.tfp_du || 0) + (dmi.foprolos_du || 0) + (dmi.timbre_fiscal || 0) + (dmi.tcl_du || 0) + (dmi.tva_resultat || 0);
  const diffA = Math.abs(dmi.total_general - creditsA);
  if (diffA > 0.1) errors.push(`Piece A desequilibre: D=${dmi.total_general} C=${creditsA} diff=${diffA}`);

  // Check Piece B
  if (dmi.tfp_du > 0) {
    // 661100 D should = 437300 C = tfp_du
  }

  // Check Piece E balance
  if (dmi.tva_collectee > 0) {
    const eCred = (dmi.tva_deductible || 0) + (dmi.tva_report_precedent || 0) + (dmi.tva_signe === 'ب' ? (dmi.tva_resultat || 0) : 0);
    const eDeb = (dmi.tva_signe === 'ف' ? (dmi.tva_resultat || 0) : 0) + (dmi.tva_collectee || 0);
    const diffE = Math.abs(eDeb - eCred);
    if (diffE > 0.1) errors.push(`Piece E desequilibre: diff=${diffE}`);
  }

  return { ok: errors.length === 0, errors };
}
