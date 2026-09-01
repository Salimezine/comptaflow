import ExcelJS from 'exceljs';

export interface EFValues {
  nomSociete: string;
  anneeN: number;
  annexeN1: number;
  // ACTIF
  immoIncorpBrutN: number; immoIncorpBrutN1: number;
  immoIncorpAmortN: number; immoIncorpAmortN1: number;
  immoCorpBrutN: number; immoCorpBrutN1: number;
  immoCorpAmortN: number; immoCorpAmortN1: number;
  immoFinancBrutN: number; immoFinancBrutN1: number;
  immoFinancProvN: number; immoFinancProvN1: number;
  autresActifsNonCourantsN: number; autresActifsNonCourantsN1: number;
  stocksN: number; stocksN1: number;
  stocksProvN: number; stocksProvN1: number;
  clientsN: number; clientsN1: number;
  clientsProvN: number; clientsProvN1: number;
  autresActifsCourantsN: number; autresActifsCourantsN1: number;
  tresorerieN: number; tresorerieN1: number;
  // PASSIF
  capitalSocialN: number; capitalSocialN1: number;
  reservesN: number; reservesN1: number;
  resultatsReportesN: number; resultatsReportesN1: number;
  resultatExerciceN: number; resultatExerciceN1: number;
  empruntsN: number; empruntsN1: number;
  autresPassifsFinanciersN: number; autresPassifsFinanciersN1: number;
  provisionsN: number; provisionsN1: number;
  fournisseursN: number; fournisseursN1: number;
  autresPassifsCourantsN: number; autresPassifsCourantsN1: number;
  concoursBancairesN: number; concoursBancairesN1: number;
  // RESULTAT
  revenusN: number; revenusN1: number;
  achatsConsommesN: number; achatsConsommesN1: number;
  chargesPersonnelN: number; chargesPersonnelN1: number;
  dotationsAmortN: number; dotationsAmortN1: number;
  autresChargesExploitN: number; autresChargesExploitN1: number;
  chargesFinancieresN: number; chargesFinancieresN1: number;
  impotBeneficesN: number; impotBeneficesN1: number;
  // SIG
  ventesMarchandisesN: number; ventesMarchandisesN1: number;
  cAchatMarchandisesN: number; cAchatMarchandisesN1: number;
  autresChargesExternesN: number; autresChargesExternesN1: number;
  impotsTaxesN: number; impotsTaxesN1: number;
  // FLUX
  dotationsProvisionsN: number; dotationsProvisionsN1: number;
  variationStocksN: number; variationStocksN1: number;
  variationCreancesN: number; variationCreancesN1: number;
  variationAutresActifsN: number; variationAutresActifsN1: number;
  variationFournisseursN: number; variationFournisseursN1: number;
  acqImmobilisationsN: number; acqImmobilisationsN1: number;
  // TAB AMT
  immob: { cat: string; vbN: number; acq: number; ces: number; dot: number; reg: number; vbN1: number; amortN1: number }[];
}

// Cell reference for the template EF-31-12-2025.xlsx
// ACTIF: cols G=6, I=8, K=10, M=12 (0-indexed)
// PASSIF: cols F=5, G=6, H=7, J=9, K=10
// RESULTAT: cols G=6, J=9, L=11
// SIG: cols F=5, G=6, J=9
// FLUX MA: cols G=6, H=7, K=10
// TAB AMT: cols D=3, G=6, I=8, J=9, L=11, M=12

function w(ws: ExcelJS.Worksheet, r: number, c: number, val: number) {
  ws.getRow(r + 1).getCell(c + 1).value = val;
}

function wStr(ws: ExcelJS.Worksheet, r: number, c: number, val: string) {
  ws.getRow(r + 1).getCell(c + 1).value = val;
}

export async function buildEFExcel(vals: EFValues): Promise<ArrayBuffer> {
  const resp = await fetch('/ef-template.xlsx');
  const buf = await resp.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const wsA = wb.getWorksheet('ACTIF')!;
  const wsP = wb.getWorksheet('PASSIF')!;
  const wsR = wb.getWorksheet('RESULTAT')!;
  const wsS = wb.getWorksheet('SIG')!;
  const wsF = wb.getWorksheet('FLUX MA')!;
  const wsT = wb.getWorksheet('TAB AMT')!;

  // ===== Update headers with societe name & years =====
  // Row 0 (Excel row 1): societe name in A1 for each sheet
  wStr(wsA, 0, 0, vals.nomSociete);
  wStr(wsP, 0, 0, vals.nomSociete);
  wStr(wsR, 0, 0, vals.nomSociete);
  wStr(wsS, 0, 0, vals.nomSociete);
  wStr(wsF, 0, 0, vals.nomSociete);
  wStr(wsT, 0, 0, vals.nomSociete);

  // Year headers
  const yearN = vals.anneeN;
  const yearN1 = vals.annexeN1;

  // ACTIF: G5=anneeN, K5=anneeN1 (0-indexed: row4, col6/col10)
  w(wsA, 4, 6, yearN); w(wsA, 4, 10, yearN1);
  // PASSIF: F5=anneeN, K5=anneeN1 (row4, col5/col10)
  w(wsP, 4, 5, yearN); w(wsP, 4, 10, yearN1);
  // RESULTAT: G5=anneeN, J5=anneeN1 (row4, col6/col9)
  w(wsR, 4, 6, yearN); w(wsR, 4, 9, yearN1);
  // SIG: F6=anneeN, J6=anneeN1 (row5, col5/col9)
  w(wsS, 5, 5, yearN); w(wsS, 5, 9, yearN1);
  // FLUX: G6=anneeN, H6=anneeN1 (row5, col6/col7)
  w(wsF, 5, 6, yearN); w(wsF, 5, 7, yearN1);
  // TAB AMT: D6=anneeN1, I6=anneeN1 (row5, col3/col8)
  w(wsT, 5, 3, yearN1); w(wsT, 5, 8, yearN1);

  // ===== ACTIF =====
  // Immobilisations incorporelles: I11=brut N (row10, col8)
  w(wsA, 10, 8, vals.immoIncorpBrutN);
  // Amort incorp: G13=N, K13=N1 (row12, col6/col10)
  w(wsA, 12, 6, vals.immoIncorpAmortN);
  w(wsA, 12, 10, vals.immoIncorpAmortN1);

  // Immobilisations corporelles: no brut row in reference (directly in G17/K17 for amort)
  // G17=amort corp N, K17=N1 (row16, col6/col10)
  w(wsA, 16, 6, vals.immoCorpAmortN);
  w(wsA, 16, 10, vals.immoCorpAmortN1);

  // Immobilisations financieres: I19=brut N (row18, col8)
  w(wsA, 18, 8, vals.immoFinancBrutN);
  // Provisions financ: G21=N, K21=N1 (row20, col6/col10)
  w(wsA, 20, 6, vals.immoFinancProvN);
  w(wsA, 20, 10, vals.immoFinancProvN1);

  // Total immo: G23=N, K23=N1
  const totalImmoN = (vals.immoIncorpBrutN - vals.immoIncorpAmortN)
    + (vals.immoCorpBrutN - vals.immoCorpAmortN)
    + (vals.immoFinancBrutN - vals.immoFinancProvN);
  const totalImmoN1 = (vals.immoIncorpBrutN1 - vals.immoIncorpAmortN1)
    + (vals.immoCorpBrutN1 - vals.immoCorpAmortN1)
    + (vals.immoFinancBrutN1 - vals.immoFinancProvN1);
  w(wsA, 22, 6, totalImmoN);
  w(wsA, 22, 10, totalImmoN1);

  // Total actifs non courants: G27=N, K27=N1
  const totalNCN = totalImmoN + vals.autresActifsNonCourantsN;
  const totalNCN1 = totalImmoN1 + vals.autresActifsNonCourantsN1;
  w(wsA, 26, 6, totalNCN);
  w(wsA, 26, 10, totalNCN1);

  // Stocks: M31=N brut, M32=prov
  w(wsA, 30, 12, vals.stocksN);
  w(wsA, 31, 12, vals.stocksProvN);
  // Stocks net: G33=N, K33=N1
  w(wsA, 32, 6, vals.stocksN - vals.stocksProvN);
  w(wsA, 32, 10, vals.stocksN1 - vals.stocksProvN1);

  // Clients prov: G37=N, K37=N1
  w(wsA, 36, 6, vals.clientsProvN);
  w(wsA, 36, 10, vals.clientsProvN1);

  // Total actifs courants: G45=N, K45=N1
  const totalCourN = (vals.stocksN - vals.stocksProvN)
    + (vals.clientsN - vals.clientsProvN)
    + vals.autresActifsCourantsN + vals.tresorerieN;
  const totalCourN1 = (vals.stocksN1 - vals.stocksProvN1)
    + (vals.clientsN1 - vals.clientsProvN1)
    + vals.autresActifsCourantsN1 + vals.tresorerieN1;
  w(wsA, 44, 6, totalCourN);
  w(wsA, 44, 10, totalCourN1);

  // Total actifs: G47=N, K47=N1
  w(wsA, 46, 6, totalNCN + totalCourN);
  w(wsA, 46, 10, totalNCN1 + totalCourN1);

  // ===== PASSIF =====
  const totalCPN = vals.capitalSocialN + vals.reservesN + vals.resultatsReportesN + vals.resultatExerciceN;
  const totalCPN1 = vals.capitalSocialN1 + vals.reservesN1 + vals.resultatsReportesN1 + vals.resultatExerciceN1;

  // Total capitaux propres: F15=N, K15=N1
  w(wsP, 14, 5, vals.capitalSocialN + vals.reservesN + vals.resultatsReportesN);
  w(wsP, 14, 10, vals.capitalSocialN1 + vals.reservesN1 + vals.resultatsReportesN1);

  // Total capitaux propres: F19=N, K19=N1
  w(wsP, 18, 5, totalCPN);
  w(wsP, 18, 10, totalCPN1);

  // Total passifs non courants: F30=N, K30=N1
  const totalPNCN = vals.empruntsN + vals.autresPassifsFinanciersN + vals.provisionsN;
  const totalPNCN1 = vals.empruntsN1 + vals.autresPassifsFinanciersN1 + vals.provisionsN1;
  w(wsP, 29, 5, totalPNCN);
  w(wsP, 29, 10, totalPNCN1);

  // Total passifs courants: F38=N, K38=N1
  const totalPCN = vals.fournisseursN + vals.autresPassifsCourantsN + vals.concoursBancairesN;
  const totalPCN1 = vals.fournisseursN1 + vals.autresPassifsCourantsN1 + vals.concoursBancairesN1;
  w(wsP, 37, 5, totalPCN);
  w(wsP, 37, 10, totalPCN1);

  // Total passifs: F41=N, K41=N1
  w(wsP, 40, 5, totalPNCN + totalPCN);
  w(wsP, 40, 10, totalPNCN1 + totalPCN1);

  // Total CP+Passifs: F44=N, K44=N1
  w(wsP, 43, 5, totalCPN + totalPNCN + totalPCN);
  w(wsP, 43, 10, totalCPN1 + totalPNCN1 + totalPCN1);

  // ===== RESULTAT =====
  // Total produits: G13=N, J13=N1
  const totalProdN = vals.revenusN + vals.achatsConsommesN;
  const totalProdN1 = vals.revenusN1 + vals.achatsConsommesN1;
  w(wsR, 12, 6, totalProdN);
  w(wsR, 12, 9, totalProdN1);

  // Total charges: G23=N, J23=N1
  const totalChargesN = vals.achatsConsommesN + vals.chargesPersonnelN + vals.dotationsAmortN + vals.autresChargesExploitN;
  const totalChargesN1 = vals.achatsConsommesN1 + vals.chargesPersonnelN1 + vals.dotationsAmortN1 + vals.autresChargesExploitN1;
  w(wsR, 22, 6, totalChargesN);
  w(wsR, 22, 9, totalChargesN1);

  // Resultat exploitation: G26=N, J26=N1
  const resExploitN = totalProdN - totalChargesN;
  const resExploitN1 = totalProdN1 - totalChargesN1;
  w(wsR, 25, 6, resExploitN);
  w(wsR, 25, 9, resExploitN1);

  // Resultat avant impot: G33=N, J33=N1
  const resAvantImpN = resExploitN - vals.chargesFinancieresN;
  const resAvantImpN1 = resExploitN1 - vals.chargesFinancieresN1;
  w(wsR, 32, 6, resAvantImpN);
  w(wsR, 32, 9, resAvantImpN1);

  // Resultat apres impot: G37=N, J37=N1
  const resApresImpN = resAvantImpN - vals.impotBeneficesN;
  const resApresImpN1 = resAvantImpN1 - vals.impotBeneficesN1;
  w(wsR, 36, 6, resApresImpN);
  w(wsR, 36, 9, resApresImpN1);

  // Resultat net: G41=N, J41=N1
  w(wsR, 40, 6, resApresImpN);
  w(wsR, 40, 9, resApresImpN1);

  // ===== SIG =====
  const margeCommN = vals.ventesMarchandisesN - vals.cAchatMarchandisesN;
  const margeCommN1 = vals.ventesMarchandisesN1 - vals.cAchatMarchandisesN1;

  // Marge commerciale: F11=N, J11=N1
  w(wsS, 10, 5, margeCommN);
  w(wsS, 10, 9, margeCommN1);

  // Production: F16=N, J16=N1
  w(wsS, 15, 5, vals.revenusN);
  w(wsS, 15, 9, vals.revenusN1);

  // Marge brute totale: F20=N, J20=N1 (marge comm + production - achats)
  const margeBruteN = margeCommN + vals.revenusN - vals.achatsConsommesN;
  const margeBruteN1 = margeCommN1 + vals.revenusN1 - vals.achatsConsommesN1;
  w(wsS, 19, 5, margeBruteN);
  w(wsS, 19, 9, margeBruteN1);

  // Activite totale: F22=N, J22=N1
  w(wsS, 21, 5, margeBruteN);
  w(wsS, 21, 9, margeBruteN1);

  // Marge brute totale (detail): F24=N, J24=N1
  w(wsS, 23, 5, margeBruteN);
  w(wsS, 23, 9, margeBruteN1);

  // Charges externes: F26=N, J26=N1
  w(wsS, 25, 5, -vals.autresChargesExternesN);
  w(wsS, 25, 9, -vals.autresChargesExternesN1);

  // VAJ: F28=N, J28=N1
  const vajN = margeBruteN - vals.autresChargesExternesN;
  const vajN1 = margeBruteN1 - vals.autresChargesExternesN1;
  w(wsS, 27, 5, vajN);
  w(wsS, 27, 9, vajN1);

  // Impots et taxes: F30=N, J30=N1
  w(wsS, 29, 5, -vals.impotsTaxesN);
  w(wsS, 29, 9, -vals.impotsTaxesN1);

  // Charges personnel: F31=N, J31=N1
  w(wsS, 30, 5, -vals.chargesPersonnelN);
  w(wsS, 30, 9, -vals.chargesPersonnelN1);

  // EBE: F33=N, J33=N1
  const ebeN = vajN - vals.impotsTaxesN - vals.chargesPersonnelN;
  const ebeN1 = vajN1 - vals.impotsTaxesN1 - vals.chargesPersonnelN1;
  w(wsS, 32, 5, ebeN);
  w(wsS, 32, 9, ebeN1);

  // Charges financieres: F35=N, J35=N1
  w(wsS, 34, 5, -vals.chargesFinancieresN);
  w(wsS, 34, 9, -vals.chargesFinancieresN1);

  // Resultat activites ordinaires: F43=N, J43=N1
  const resOrdN = ebeN - vals.chargesFinancieresN;
  const resOrdN1 = ebeN1 - vals.chargesFinancieresN1;
  w(wsS, 42, 5, resOrdN);
  w(wsS, 42, 9, resOrdN1);

  // Resultat net: F48=N, J48=N1
  w(wsS, 47, 5, resOrdN - vals.impotBeneficesN);
  w(wsS, 47, 9, resOrdN1 - vals.impotBeneficesN1);

  // ===== FLUX MA =====
  // Resultat net: G10=N, H10=N1
  w(wsF, 9, 6, vals.variationStocksN !== undefined ? (resApresImpN) : 0);
  w(wsF, 9, 7, resApresImpN1);

  // Dotations: G12=N, H12=N1
  w(wsF, 11, 6, vals.dotationsProvisionsN);
  w(wsF, 11, 7, vals.dotationsProvisionsN1);

  // Variation stocks: G14=N, H14=N1
  w(wsF, 13, 6, vals.variationStocksN);
  w(wsF, 13, 7, vals.variationStocksN1);

  // Variation creances: G15=N, H15=N1
  w(wsF, 14, 6, vals.variationCreancesN);
  w(wsF, 14, 7, vals.variationCreancesN1);

  // Variation autres actifs: G16=N, H16=N1
  w(wsF, 15, 6, vals.variationAutresActifsN);
  w(wsF, 15, 7, vals.variationAutresActifsN1);

  // Variation fournisseurs: G17=N, H17=N1
  w(wsF, 16, 6, vals.variationFournisseursN);
  w(wsF, 16, 7, vals.variationFournisseursN1);

  // Flux exploit total: G21=N, H21=N1
  const fluxExploitN = resApresImpN + vals.dotationsProvisionsN + vals.variationStocksN + vals.variationCreancesN + vals.variationAutresActifsN + vals.variationFournisseursN;
  const fluxExploitN1 = resApresImpN1 + vals.dotationsProvisionsN1 + vals.variationStocksN1 + vals.variationCreancesN1 + vals.variationAutresActifsN1 + vals.variationFournisseursN1;
  w(wsF, 20, 6, fluxExploitN);
  w(wsF, 20, 7, fluxExploitN1);

  // Acquisitions immo: G25=N, H25=N1
  w(wsF, 24, 6, -vals.acqImmobilisationsN);
  w(wsF, 24, 7, -vals.acqImmobilisationsN1);

  // Flux invest total: G30=N, H30=N1
  w(wsF, 29, 6, -vals.acqImmobilisationsN);
  w(wsF, 29, 7, -vals.acqImmobilisationsN1);

  // Variation tresorerie: G44=N, H44=N1
  const fluxFinancN = 0;
  const fluxFinancN1 = 0;
  const varTresorN = fluxExploitN - vals.acqImmobilisationsN;
  const varTresorN1 = fluxExploitN1 - vals.acqImmobilisationsN1;
  w(wsF, 43, 6, varTresorN);
  w(wsF, 43, 7, varTresorN1);

  // Tresorerie debut: G46=N, H46=N1
  w(wsF, 45, 6, vals.tresorerieN1);
  w(wsF, 45, 7, vals.tresorerieN1);

  // Tresorerie fin: G47=N, H47=N1
  w(wsF, 46, 6, vals.tresorerieN);
  w(wsF, 46, 7, vals.tresorerieN1);

  // ===== TAB AMT =====
  // Row 6: D6=N1, I6=N1 (header years)
  w(wsT, 5, 3, yearN1); w(wsT, 5, 8, yearN1);

  // Immobilisations incorporelles (row 8): D8, G8, I8, L8
  if (vals.immob.length >= 1) {
    const inc = vals.immob[vals.immob.length - 3]; // summary incorp
    w(wsT, 7, 3, inc?.vbN1 || 0);
    w(wsT, 7, 6, (inc?.vbN || 0) + (inc?.acq || 0) - (inc?.ces || 0));
    w(wsT, 7, 8, inc?.amortN1 || 0);
    w(wsT, 7, 11, (inc?.amortN1 || 0) + (inc?.dot || 0) - (inc?.reg || 0));
  }

  // Immobilisations corporelles total (row 12): D12, E12, G12, I12, J12, L12, M12
  if (vals.immob.length >= 2) {
    const corp = vals.immob[vals.immob.length - 2];
    w(wsT, 11, 3, corp?.vbN1 || 0);
    w(wsT, 11, 4, corp?.acq || 0);
    w(wsT, 11, 6, (corp?.vbN || 0) + (corp?.acq || 0) - (corp?.ces || 0));
    w(wsT, 11, 8, corp?.amortN1 || 0);
    w(wsT, 11, 9, corp?.dot || 0);
    w(wsT, 11, 11, (corp?.amortN1 || 0) + (corp?.dot || 0) - (corp?.reg || 0));
    w(wsT, 11, 12, ((corp?.vbN || 0) + (corp?.acq || 0) - (corp?.ces || 0)) - ((corp?.amortN1 || 0) + (corp?.dot || 0) - (corp?.reg || 0)));
  }

  // Individual 22x lines (rows 14, 16, 18, 20, 22)
  const immoRows = [13, 15, 17, 19, 21]; // 0-indexed rows for individual lines
  const immoLines = vals.immob.filter((_, i) => i < vals.immob.length - 3);
  for (let i = 0; i < Math.min(immoLines.length, immoRows.length); i++) {
    const l = immoLines[i];
    const r = immoRows[i];
    w(wsT, r, 3, l.vbN1);
    w(wsT, r, 4, l.acq);
    w(wsT, r, 6, l.vbN + l.acq - l.ces);
    w(wsT, r, 8, l.amortN1);
    w(wsT, r, 9, l.dot);
    w(wsT, r, 11, l.amortN1 + l.dot - l.reg);
    w(wsT, r, 12, (l.vbN + l.acq - l.ces) - (l.amortN1 + l.dot - l.reg));
  }

  // Totals row (row 25): D25, E25, G25, I25, J25, L25, M25
  const totalVbN1 = vals.immob.reduce((s, l) => s + l.vbN1, 0);
  const totalAcq = vals.immob.reduce((s, l) => s + l.acq, 0);
  const totalCes = vals.immob.reduce((s, l) => s + l.ces, 0);
  const totalDot = vals.immob.reduce((s, l) => s + l.dot, 0);
  const totalReg = vals.immob.reduce((s, l) => s + l.reg, 0);
  const totalVbN = vals.immob.reduce((s, l) => s + l.vbN, 0);
  const totalAmortN1 = vals.immob.reduce((s, l) => s + l.amortN1, 0);
  const totalAmortN = totalAmortN1 + totalDot - totalReg;
  w(wsT, 24, 3, totalVbN1);
  w(wsT, 24, 4, totalAcq);
  w(wsT, 24, 6, totalVbN + totalAcq - totalCes);
  w(wsT, 24, 8, totalAmortN1);
  w(wsT, 24, 9, totalDot);
  w(wsT, 24, 11, totalAmortN);
  w(wsT, 24, 12, (totalVbN + totalAcq - totalCes) - totalAmortN);

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
