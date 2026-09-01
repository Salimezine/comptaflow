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

const headerFont = { name: 'Calibri', bold: true, size: 12, color: { argb: 'FF000000' } };
const titleFont = { name: 'Calibri', bold: true, size: 18, color: { argb: 'FF000000' } };
const subtitleFont = { name: 'Calibri', bold: true, size: 14, color: { argb: 'FF000000' } };
const labelFont = { name: 'Calibri', size: 11 };
const labelBoldFont = { name: 'Calibri', bold: true, size: 11 };
const dateHeaderFont = { name: 'Calibri', bold: true, size: 11 };
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin' };
const topBorder: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF1F4E79' } };
const bottomDoubleBorder: Partial<ExcelJS.Border> = { style: 'double', color: { argb: 'FF1F4E79' } };
const numFmt = '#,##0';

function setMerge(ws: ExcelJS.Worksheet, range: string) {
  ws.mergeCells(range);
}

function setCell(ws: ExcelJS.Worksheet, addr: string, val: any, font?: any, fmt?: string, alignment?: any, fill?: any, border?: any) {
  const cell = ws.getCell(addr);
  cell.value = val;
  const f = font ? { ...font } : undefined;
  if (f) delete (f as any).alignment;
  if (f) cell.font = f;
  if (font?.alignment) cell.alignment = font.alignment;
  if (alignment) cell.alignment = alignment;
  if (fmt) cell.numFmt = fmt;
  if (fill) cell.fill = fill;
  if (border) cell.border = border;
  return cell;
}

export async function buildEFExcel(vals: EFValues): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EUREX';
  wb.created = new Date();

  // ============ ACTIF ============
  const wsA = wb.addWorksheet('ACTIF', { properties: { defaultColWidth: 12 } });
  wsA.columns = [
    { width: 5 }, { width: 3 }, { width: 40 }, { width: 8 },
    { width: 8 }, { width: 8 }, { width: 15 },
    { width: 8 }, { width: 8 }, { width: 15 }, { width: 14 }, { width: 14 }
  ];

  // Title row 2 merged C2:K2
  setMerge(wsA, 'C2:K2');
  for (let c = 3; c <= 11; c++) setCell(wsA, `${String.fromCharCode(64+c)}2`, vals.nomSociete, { ...titleFont });
  setCell(wsA, 'C2', vals.nomSociete, titleFont, undefined, { horizontal: 'center' });

  // Subtitle row 4 merged C4:K4
  setMerge(wsA, 'C4:K4');
  setCell(wsA, 'C4', `BILANS COMPARES ARRETES AUX 31 Dec ${vals.anneeN} & 31 Dec ${vals.annexeN1}`, { ...subtitleFont, alignment: { horizontal: 'center' } });

  // Currency row 6 merged C6:K6
  setMerge(wsA, 'C6:K6');
  setCell(wsA, 'C6', '(En dinars tunisiens)', { ...subtitleFont, alignment: { horizontal: 'center' } });

  // Header row 9
  setCell(wsA, 'E9', 'ACTIFS', labelBoldFont);
  setCell(wsA, 'F9', 'Notes', { ...labelBoldFont, alignment: { horizontal: 'center' } });
  setCell(wsA, 'I9', new Date(vals.anneeN, 11, 31), { ...dateHeaderFont, alignment: { horizontal: 'right' } }, 'dd/mm/yyyy');
  setCell(wsA, 'L9', new Date(vals.annexeN1, 11, 31), { ...dateHeaderFont, alignment: { horizontal: 'right' } }, 'dd/mm/yyyy');

  // ACTIFS NON COURANTS
  setCell(wsA, 'C11', 'ACTIFS NON COURANTS', labelBoldFont);

  // Actifs immobilisés
  setCell(wsA, 'D13', 'Actifs immobilis\u00e9s', labelBoldFont);

  // A1 - Immobilisations incorporelles
  setCell(wsA, 'A15', 'A1', labelFont);
  setCell(wsA, 'E15', 'Immobilisations incorporelles', labelFont);
  setCell(wsA, 'I15', vals.immoIncorpBrutN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L15', vals.immoIncorpBrutN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'M15', vals.immoIncorpBrutN - vals.immoIncorpBrutN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A2 - Amortissements
  setCell(wsA, 'A16', 'A2', labelFont);
  setCell(wsA, 'E16', 'Moins : amortissements', labelFont);
  setCell(wsA, 'I16', -vals.immoIncorpAmortN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L16', -vals.immoIncorpAmortN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // Net
  setCell(wsA, 'I17', vals.immoIncorpBrutN - vals.immoIncorpAmortN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L17', vals.immoIncorpBrutN1 - vals.immoIncorpAmortN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A3 - Immobilisations corporelles
  setCell(wsA, 'A19', 'A3', labelFont);
  setCell(wsA, 'E19', 'Immobilisations corporelles', labelFont);
  setCell(wsA, 'I19', vals.immoCorpBrutN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L19', vals.immoCorpBrutN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'M19', vals.immoCorpBrutN - vals.immoCorpBrutN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A4 - Amortissements corporelles
  setCell(wsA, 'A20', 'A4', labelFont);
  setCell(wsA, 'E20', 'Moins : amortissements', labelFont);
  setCell(wsA, 'I20', -vals.immoCorpAmortN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L20', -vals.immoCorpAmortN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'M20', vals.immoCorpAmortN - vals.immoCorpAmortN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // Net corp
  setCell(wsA, 'I21', vals.immoCorpBrutN - vals.immoCorpAmortN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L21', vals.immoCorpBrutN1 - vals.immoCorpAmortN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'M21', (vals.immoCorpBrutN - vals.immoCorpAmortN) - (vals.immoCorpBrutN1 - vals.immoCorpAmortN1), { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // Immobilisations encours
  setCell(wsA, 'E23', 'Immobilisations encours', labelFont);
  setCell(wsA, 'I23', 0, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L23', 0, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A5 - Immobilisations financieres
  setCell(wsA, 'A25', 'A5', labelFont);
  setCell(wsA, 'E25', 'Immobilisations financi\u00e8res', labelFont);
  setCell(wsA, 'I25', vals.immoFinancBrutN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L25', vals.immoFinancBrutN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A6 - Provisions
  setCell(wsA, 'A26', 'A6', labelFont);
  setCell(wsA, 'E26', 'Moins : provisions', labelFont);
  setCell(wsA, 'I26', -vals.immoFinancProvN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L26', -vals.immoFinancProvN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // Net financ
  setCell(wsA, 'I27', vals.immoFinancBrutN - vals.immoFinancProvN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L27', vals.immoFinancBrutN1 - vals.immoFinancProvN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // Total actifs immobilisés
  const totalImmoN = (vals.immoIncorpBrutN - vals.immoIncorpAmortN) + (vals.immoCorpBrutN - vals.immoCorpAmortN) + (vals.immoFinancBrutN - vals.immoFinancProvN);
  const totalImmoN1 = (vals.immoIncorpBrutN1 - vals.immoIncorpAmortN1) + (vals.immoCorpBrutN1 - vals.immoCorpAmortN1) + (vals.immoFinancBrutN1 - vals.immoFinancProvN1);
  setCell(wsA, 'D29', 'Total des actifs immobilis\u00e9s', { ...labelFont, alignment: { horizontal: 'right' } });
  setCell(wsA, 'I29', totalImmoN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L29', totalImmoN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A7 - Autres actifs non courants
  setCell(wsA, 'A31', 'A7', labelFont);
  setCell(wsA, 'E31', 'Autres actifs non courants', labelFont);
  setCell(wsA, 'I31', vals.autresActifsNonCourantsN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L31', vals.autresActifsNonCourantsN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // TOTAL DES ACTIFS NON COURANTS
  const totalNCN = totalImmoN + vals.autresActifsNonCourantsN;
  const totalNCN1 = totalImmoN1 + vals.autresActifsNonCourantsN1;
  setCell(wsA, 'C33', 'TOTAL DES ACTIFS NON COURANTS', labelBoldFont);
  setCell(wsA, 'I33', totalNCN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L33', totalNCN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  // ACTIFS COURANTS
  setCell(wsA, 'C35', 'ACTIFS COURANTS', labelBoldFont);

  // A8 - Stocks
  setCell(wsA, 'A37', 'A8', labelFont);
  setCell(wsA, 'E37', 'Stocks', labelFont);
  setCell(wsA, 'I37', vals.stocksN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L37', vals.stocksN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'M37', vals.stocksN - vals.stocksN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A9 - Provisions stocks
  setCell(wsA, 'A38', 'A9', labelFont);
  setCell(wsA, 'E38', 'Moins : provisions', labelFont);
  setCell(wsA, 'I38', -vals.stocksProvN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L38', -vals.stocksProvN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // Net stocks
  setCell(wsA, 'I39', vals.stocksN - vals.stocksProvN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L39', vals.stocksN1 - vals.stocksProvN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A10 - Clients
  setCell(wsA, 'A41', 'A10', labelFont);
  setCell(wsA, 'E41', 'Clients et comptes rattach\u00e9s', labelFont);
  setCell(wsA, 'I41', vals.clientsN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L41', vals.clientsN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'M41', vals.clientsN - vals.clientsN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A11 - Provisions clients
  setCell(wsA, 'A42', 'A11', labelFont);
  setCell(wsA, 'E42', 'Moins : provisions', labelFont);
  setCell(wsA, 'I42', -vals.clientsProvN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L42', -vals.clientsProvN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // Net clients
  setCell(wsA, 'I43', vals.clientsN - vals.clientsProvN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L43', vals.clientsN1 - vals.clientsProvN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A12 - Autres actifs courants
  setCell(wsA, 'A45', 'A12', labelFont);
  setCell(wsA, 'E45', 'Autres actifs courants', labelFont);
  setCell(wsA, 'I45', vals.autresActifsCourantsN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L45', vals.autresActifsCourantsN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'M45', vals.autresActifsCourantsN - vals.autresActifsCourantsN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // A15 - Liquidites
  setCell(wsA, 'A51', 'A15', labelFont);
  setCell(wsA, 'E51', 'Liquidit\u00e9s et \u00e9quivalents de liquidit\u00e9s', labelFont);
  setCell(wsA, 'I51', vals.tresorerieN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L51', vals.tresorerieN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'M51', vals.tresorerieN - vals.tresorerieN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  // TOTAL ACTIFS COURANTS
  const totalCourN = (vals.stocksN - vals.stocksProvN) + (vals.clientsN - vals.clientsProvN) + vals.autresActifsCourantsN + vals.tresorerieN;
  const totalCourN1 = (vals.stocksN1 - vals.stocksProvN1) + (vals.clientsN1 - vals.clientsProvN1) + vals.autresActifsCourantsN1 + vals.tresorerieN1;
  setCell(wsA, 'C53', 'TOTAL DES ACTIFS COURANTS', labelBoldFont);
  setCell(wsA, 'I53', totalCourN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L53', totalCourN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  // TOTAL ACTIF
  const totalAN = totalNCN + totalCourN;
  const totalAN1 = totalNCN1 + totalCourN1;
  setCell(wsA, 'C56', 'TOTAL DES ACTIFS', labelBoldFont);
  setCell(wsA, 'I56', totalAN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsA, 'L56', totalAN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  // ============ PASSIF ============
  const wsP = wb.addWorksheet('PASSIF', { properties: { defaultColWidth: 12 } });
  wsP.columns = [
    { width: 5 }, { width: 35 }, { width: 5 }, { width: 35 },
    { width: 8 }, { width: 8 }, { width: 15 }, { width: 8 }, { width: 15 }, { width: 14 }
  ];

  setMerge(wsP, 'A3:J3');
  setCell(wsP, 'A3', vals.nomSociete, { ...titleFont, alignment: { horizontal: 'center' } });
  setMerge(wsP, 'A5:J5');
  setCell(wsP, 'A5', `BILANS COMPARES ARRETES AUX 31 Dec ${vals.anneeN} & 31 Dec ${vals.annexeN1}`, { ...subtitleFont, alignment: { horizontal: 'center' } });
  setMerge(wsP, 'A7:J7');
  setCell(wsP, 'A7', '(En dinars tunisiens)', { ...subtitleFont, alignment: { horizontal: 'center' } });

  setCell(wsP, 'B10', 'CAPITAUX PROPRES ET PASSIFS', labelBoldFont);
  setCell(wsP, 'E10', 'Notes', { ...labelBoldFont, alignment: { horizontal: 'center' } });
  setCell(wsP, 'H10', new Date(vals.anneeN, 11, 31), { ...dateHeaderFont, alignment: { horizontal: 'right' } }, 'dd/mm/yyyy');
  setCell(wsP, 'J10', new Date(vals.annexeN1, 11, 31), { ...dateHeaderFont, alignment: { horizontal: 'right' } }, 'dd/mm/yyyy');

  setCell(wsP, 'B12', 'CAPITAUX PROPRES ET PASSIFS', labelBoldFont);
  setCell(wsP, 'C14', 'Capitaux propres', labelBoldFont);

  setCell(wsP, 'A16', 'P1', labelFont);
  setCell(wsP, 'D16', 'Capital Social', labelFont);
  setCell(wsP, 'H16', vals.capitalSocialN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J16', vals.capitalSocialN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'A17', 'P2', labelFont);
  setCell(wsP, 'D17', 'R\u00e9serves', labelFont);
  setCell(wsP, 'H17', vals.reservesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J17', vals.reservesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'A18', 'P3', labelFont);
  setCell(wsP, 'D18', 'R\u00e9sultats report\u00e9s', labelFont);
  setCell(wsP, 'H18', vals.resultatsReportesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J18', vals.resultatsReportesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'D20', 'Total capitaux propres avant r\u00e9sultat', labelFont);
  setCell(wsP, 'H20', vals.capitalSocialN + vals.reservesN + vals.resultatsReportesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J20', vals.capitalSocialN1 + vals.reservesN1 + vals.resultatsReportesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'D22', "R\u00e9sultat de l'exercice", labelFont);
  setCell(wsP, 'H22', vals.resultatExerciceN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J22', vals.resultatExerciceN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const totalCPN = vals.capitalSocialN + vals.reservesN + vals.resultatsReportesN + vals.resultatExerciceN;
  const totalCPN1 = vals.capitalSocialN1 + vals.reservesN1 + vals.resultatsReportesN1 + vals.resultatExerciceN1;
  setCell(wsP, 'B24', 'TOTAL CAPITAUX PROPRES', { ...labelBoldFont });
  setCell(wsP, 'E24', '4.1', { ...labelBoldFont, alignment: { horizontal: 'center' } });
  setCell(wsP, 'H24', totalCPN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J24', totalCPN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'B27', 'PASSIFS', labelBoldFont);
  setCell(wsP, 'C29', 'Passifs non courants', labelBoldFont);

  setCell(wsP, 'A31', 'P4', labelFont);
  setCell(wsP, 'D31', 'Emprunts', labelFont);
  setCell(wsP, 'H31', vals.empruntsN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J31', vals.empruntsN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'A32', 'P5', labelFont);
  setCell(wsP, 'D32', 'Autres passifs financiers', labelFont);
  setCell(wsP, 'H32', vals.autresPassifsFinanciersN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J32', vals.autresPassifsFinanciersN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'A33', 'P6', labelFont);
  setCell(wsP, 'D33', 'Provisions', labelFont);
  setCell(wsP, 'H33', vals.provisionsN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J33', vals.provisionsN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const totalPNCN = vals.empruntsN + vals.autresPassifsFinanciersN + vals.provisionsN;
  const totalPNCN1 = vals.empruntsN1 + vals.autresPassifsFinanciersN1 + vals.provisionsN1;
  setCell(wsP, 'C35', 'Total passifs non courants', { ...labelFont, alignment: { horizontal: 'right' } });
  setCell(wsP, 'H35', totalPNCN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J35', totalPNCN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'C37', 'Passifs courants', labelBoldFont);

  setCell(wsP, 'D39', 'Fournisseurs et comptes rattach\u00e9s', labelFont);
  setCell(wsP, 'H39', vals.fournisseursN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J39', vals.fournisseursN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'D40', 'Autres passifs courants', labelFont);
  setCell(wsP, 'H40', vals.autresPassifsCourantsN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J40', vals.autresPassifsCourantsN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsP, 'D41', 'Concours bancaires et autres passifs financiers', labelFont);
  setCell(wsP, 'H41', vals.concoursBancairesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J41', vals.concoursBancairesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const totalPCN = vals.fournisseursN + vals.autresPassifsCourantsN + vals.concoursBancairesN;
  const totalPCN1 = vals.fournisseursN1 + vals.autresPassifsCourantsN1 + vals.concoursBancairesN1;
  setCell(wsP, 'C43', 'Total passifs courants', { ...labelFont, alignment: { horizontal: 'right' } });
  setCell(wsP, 'H43', totalPCN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J43', totalPCN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const totalPN = totalCPN + totalPNCN + totalPCN;
  const totalPN1 = totalCPN1 + totalPNCN1 + totalPCN1;
  setCell(wsP, 'B46', 'TOTAL GENERAL PASSIF + CP', labelBoldFont);
  setCell(wsP, 'H46', totalPN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsP, 'J46', totalPN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  // ============ RESULTAT ============
  const wsR = wb.addWorksheet('RESULTAT', { properties: { defaultColWidth: 12 } });
  wsR.columns = [
    { width: 5 }, { width: 5 }, { width: 35 }, { width: 8 },
    { width: 8 }, { width: 15 }, { width: 8 }, { width: 15 }, { width: 14 }
  ];

  setMerge(wsR, 'B2:I2');
  setCell(wsR, 'B2', vals.nomSociete, { ...titleFont, alignment: { horizontal: 'center' } });
  setMerge(wsR, 'B4:I4');
  setCell(wsR, 'B4', `ETATS DE RESULTATS COMPARES ARRETES AUX 31 Dec ${vals.anneeN} & 31 Dec ${vals.annexeN1}`, { ...subtitleFont, alignment: { horizontal: 'center' } });
  setMerge(wsR, 'B6:I6');
  setCell(wsR, 'B6', '(En dinars tunisiens)', { ...subtitleFont, alignment: { horizontal: 'center' } });

  setCell(wsR, 'E9', 'Notes', { ...labelBoldFont, alignment: { horizontal: 'center' } });
  setCell(wsR, 'H9', new Date(vals.anneeN, 11, 31), { ...dateHeaderFont, alignment: { horizontal: 'right' } }, 'dd/mm/yyyy');
  setCell(wsR, 'I9', new Date(vals.annexeN1, 11, 31), { ...dateHeaderFont, alignment: { horizontal: 'right' } }, 'dd/mm/yyyy');

  const totalProdExpN = vals.revenusN + vals.achatsConsommesN;
  const totalChargesN = vals.achatsConsommesN + vals.chargesPersonnelN + vals.dotationsAmortN + vals.autresChargesExploitN;
  const resultatExploitN = totalProdExpN - totalChargesN;
  const totalProdExpN1 = vals.revenusN1 + vals.achatsConsommesN1;
  const totalChargesN1 = vals.achatsConsommesN1 + vals.chargesPersonnelN1 + vals.dotationsAmortN1 + vals.autresChargesExploitN1;
  const resultatExploitN1 = totalProdExpN1 - totalChargesN1;

  setCell(wsR, 'B11', "PRODUITS D'EXPLOITATION", labelBoldFont);
  setCell(wsR, 'A13', 'R1', labelFont);
  setCell(wsR, 'D13', 'Revenus', labelFont);
  setCell(wsR, 'E13', '5.1', { ...labelBoldFont, alignment: { horizontal: 'center' } });
  setCell(wsR, 'H13', vals.revenusN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I13', vals.revenusN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsR, 'A14', 'R2', labelFont);
  setCell(wsR, 'D14', 'Autres produits d\'exploitation', labelFont);

  setCell(wsR, 'A15', 'R3', labelFont);
  setCell(wsR, 'D15', 'Production immobilis\u00e9e', labelFont);

  setCell(wsR, 'D16', 'Transfert de charges', labelFont);

  setCell(wsR, 'C17', 'Total des produits d\'exploitation', { ...labelBoldFont });
  setCell(wsR, 'H17', totalProdExpN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I17', totalProdExpN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsR, 'B19', "CHARGES D'EXPLOITATION", labelBoldFont);

  setCell(wsR, 'D21', "Co\u00fbt d'achat des marchandises vendues", labelFont);
  setCell(wsR, 'E21', '5.2', { ...labelBoldFont, alignment: { horizontal: 'center' } });
  setCell(wsR, 'H21', vals.achatsConsommesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I21', vals.achatsConsommesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsR, 'A22', 'R5', labelFont);
  setCell(wsR, 'D22', 'Charges de personnel', labelFont);
  setCell(wsR, 'H22', vals.chargesPersonnelN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I22', vals.chargesPersonnelN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsR, 'A23', 'R6', labelFont);
  setCell(wsR, 'D23', 'Dotations aux amortissements et provisions', labelFont);
  setCell(wsR, 'E23', '5.3', { ...labelBoldFont, alignment: { horizontal: 'center' } });
  setCell(wsR, 'H23', vals.dotationsAmortN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I23', vals.dotationsAmortN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsR, 'A24', 'R7', labelFont);
  setCell(wsR, 'D24', 'Autres charges d\'exploitation', labelFont);
  setCell(wsR, 'E24', '5.4', { ...labelBoldFont, alignment: { horizontal: 'center' } });
  setCell(wsR, 'H24', vals.autresChargesExploitN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I24', vals.autresChargesExploitN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsR, 'C25', 'Total des charges d\'exploitation', { ...labelBoldFont });
  setCell(wsR, 'H25', totalChargesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I25', totalChargesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsR, 'B27', 'R\u00e9sultat d\'exploitation', { ...labelBoldFont });
  setCell(wsR, 'H27', resultatExploitN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I27', resultatExploitN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsR, 'A30', 'R8', labelFont);
  setCell(wsR, 'D30', 'Charges financi\u00e8res nettes', labelFont);
  setCell(wsR, 'H30', vals.chargesFinancieresN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I30', vals.chargesFinancieresN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const resultatNetN = resultatExploitN - vals.chargesFinancieresN - vals.impotBeneficesN;
  const resultatNetN1 = resultatExploitN1 - vals.chargesFinancieresN1 - vals.impotBeneficesN1;

  setCell(wsR, 'B34', 'Imp\u00f4t sur les b\u00e9n\u00e9fices', labelFont);
  setCell(wsR, 'H34', vals.impotBeneficesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I34', vals.impotBeneficesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsR, 'A47', 'R12', { ...labelBoldFont });
  setCell(wsR, 'B47', "R\u00e9sultat net de l'exercice", { ...labelBoldFont });
  setCell(wsR, 'H47', resultatNetN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsR, 'I47', resultatNetN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  // ============ SIG ============
  const wsS = wb.addWorksheet('SIG', { properties: { defaultColWidth: 12 } });
  wsS.columns = [
    { width: 30 }, { width: 40 }, { width: 5 },
    { width: 8 }, { width: 8 }, { width: 15 }, { width: 15 }
  ];

  setMerge(wsS, 'A2:G2');
  setCell(wsS, 'A2', vals.nomSociete, { ...titleFont, alignment: { horizontal: 'center' } });
  setMerge(wsS, 'A4:G4');
  setCell(wsS, 'A4', `SOLDES INTERM\u00c9DIAIRES DE GESTION COMPARES ARRETES AUX 31 Dec ${vals.anneeN} & 31 Dec ${vals.annexeN1}`, { ...subtitleFont, alignment: { horizontal: 'center' } });
  setMerge(wsS, 'A6:G6');
  setCell(wsS, 'A6', '(En dinars tunisiens)', { ...subtitleFont, alignment: { horizontal: 'center' } });

  setCell(wsS, 'D8', 'Notes', { ...labelBoldFont, alignment: { horizontal: 'center' } });
  setCell(wsS, 'F8', new Date(vals.anneeN, 11, 31), { ...dateHeaderFont, alignment: { horizontal: 'right' } }, 'dd/mm/yyyy');
  setCell(wsS, 'G8', new Date(vals.annexeN1, 11, 31), { ...dateHeaderFont, alignment: { horizontal: 'right' } }, 'dd/mm/yyyy');

  setCell(wsS, 'B10', 'Ventes de marchandises', labelFont);
  setCell(wsS, 'F10', vals.ventesMarchandisesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G10', vals.ventesMarchandisesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsS, 'B11', 'Co\u00fbt d\'achat des Mses Vendues', labelFont);

  const margeCommN = vals.ventesMarchandisesN - vals.cAchatMarchandisesN;
  const margeCommN1 = vals.ventesMarchandisesN1 - vals.cAchatMarchandisesN1;
  setCell(wsS, 'A13', 'MARGE COMMERCIALE', { ...labelBoldFont });
  setCell(wsS, 'F13', margeCommN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G13', margeCommN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsS, 'B15', 'Revenus et autres produits d\'exploitation', labelFont);
  setCell(wsS, 'B16', 'Production stock\u00e9e', labelFont);
  setCell(wsS, 'B17', 'Production immobilis\u00e9e', labelFont);
  setCell(wsS, 'B18', 'Transfert de charges', labelFont);
  setCell(wsS, 'A19', 'PRODUCTION DE L\'EXERCICE', { ...labelBoldFont });

  setCell(wsS, 'F22', -vals.cAchatMarchandisesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G22', -vals.cAchatMarchandisesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const margeBruteN = margeCommN + vals.revenusN - vals.cAchatMarchandisesN;
  const margeBruteN1 = margeCommN1 + vals.revenusN1 - vals.cAchatMarchandisesN1;
  setCell(wsS, 'A24', 'MARGE BRUTE TOTALE', { ...labelBoldFont });
  setCell(wsS, 'F24', margeBruteN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G24', margeBruteN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsS, 'A25', 'ACTIVIT\u00c9 TOTALE', { ...labelBoldFont });
  setCell(wsS, 'F25', margeBruteN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G25', margeBruteN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsS, 'B27', 'Marge brute totale', labelFont);
  setCell(wsS, 'B28', 'Achats d\'approvisionnements consomm\u00e9s', labelFont);
  setCell(wsS, 'B30', 'Autres charges externes', labelFont);
  setCell(wsS, 'F30', -vals.autresChargesExternesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G30', -vals.autresChargesExternesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const valeurAjN = margeBruteN - vals.autresChargesExternesN;
  const valeurAjN1 = margeBruteN1 - vals.autresChargesExternesN1;
  setCell(wsS, 'A32', 'VALEUR AJOUT\u00c9E BRUTE', { ...labelBoldFont });
  setCell(wsS, 'F32', valeurAjN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G32', valeurAjN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsS, 'B34', 'Imp\u00f4ts et taxes', labelFont);
  setCell(wsS, 'F34', -vals.impotsTaxesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G34', -vals.impotsTaxesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsS, 'B35', 'Charges de personnel', labelFont);
  setCell(wsS, 'F35', -vals.chargesPersonnelN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G35', -vals.chargesPersonnelN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const ebeN = valeurAjN - vals.impotsTaxesN - vals.chargesPersonnelN;
  const ebeN1 = valeurAjN1 - vals.impotsTaxesN1 - vals.chargesPersonnelN1;
  setCell(wsS, 'A37', 'EXC\u00c9DENT BRUT D\'EXPLOITATION', { ...labelBoldFont });
  setCell(wsS, 'F37', ebeN, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G37', ebeN1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsS, 'B39', 'Charges financi\u00e8res nettes', labelFont);
  setCell(wsS, 'F39', -vals.chargesFinancieresN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G39', -vals.chargesFinancieresN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const resultatExploitSIG = ebeN - vals.chargesFinancieresN;
  const resultatExploitSIG1 = ebeN1 - vals.chargesFinancieresN1;
  setCell(wsS, 'A42', 'R\u00c9SULTAT D\'EXPLOITATION', { ...labelBoldFont });
  setCell(wsS, 'F42', resultatExploitSIG, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G42', resultatExploitSIG1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  setCell(wsS, 'A44', 'IMP\u00d4T SUR LES B\u00c9N\u00c9FICES', labelBoldFont);
  setCell(wsS, 'F44', vals.impotBeneficesN, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G44', vals.impotBeneficesN1, { ...labelFont, alignment: { horizontal: 'right' } }, numFmt);

  const resultatNetSIG = resultatExploitSIG - vals.impotBeneficesN;
  const resultatNetSIG1 = resultatExploitSIG1 - vals.impotBeneficesN1;
  setCell(wsS, 'A46', 'R\u00c9SULTAT NET DE L\'EXERCICE', { ...labelBoldFont });
  setCell(wsS, 'F46', resultatNetSIG, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);
  setCell(wsS, 'G46', resultatNetSIG1, { ...labelBoldFont, alignment: { horizontal: 'right' } }, numFmt);

  // Write buffer
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
