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

function w(ws: ExcelJS.Worksheet, r: number, c: number, val: number) {
  ws.getRow(r + 1).getCell(c + 1).value = val;
}

function wStr(ws: ExcelJS.Worksheet, r: number, c: number, val: string) {
  ws.getRow(r + 1).getCell(c + 1).value = val;
}

export async function buildEFExcel(vals: EFValues): Promise<ArrayBuffer> {
  const resp = await fetch(`${import.meta.env.BASE_URL}ef-template.xlsx`);
  const buf = await resp.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const wsA = wb.getWorksheet('ACTIF')!;
  const wsP = wb.getWorksheet('PASSIF')!;
  const wsR = wb.getWorksheet('RT')!;
  const wsS = wb.getWorksheet('SIG ')!;
  const wsF = wb.getWorksheet('FLUX')!;
  const wsT = wb.getWorksheet('TAB AMT')!;

  // Remove extra sheets (PAGE DE GARDE, BALANCE, TCD, RESULTAT FISCAL)
  const keepNames = new Set(['ACTIF', 'PASSIF', 'RT', 'SIG ', 'FLUX', 'TAB AMT']);
  const toRemove: number[] = [];
  wb.eachSheet((sheet, id) => {
    if (!keepNames.has(sheet.name)) toRemove.push(id);
  });
  toRemove.forEach(id => wb.removeWorksheet(id));

  const yearN = vals.anneeN;
  const yearN1 = vals.annexeN1;

  // ===== Update headers =====
  wStr(wsA, 1, 0, vals.nomSociete); // A2
  wStr(wsP, 2, 0, vals.nomSociete); // A3
  wStr(wsR, 1, 0, vals.nomSociete); // A2
  wStr(wsS, 1, 0, vals.nomSociete); // A2
  wStr(wsF, 1, 1, vals.nomSociete); // B2
  wStr(wsT, 0, 0, vals.nomSociete); // A1

  // ===== ACTIF =====
  // Reference: I9=46022(N), L9=45657(N1) → row8,col7 / row8,col10
  w(wsA, 8, 7, vals.immoIncorpBrutN + vals.immoCorpBrutN + vals.immoFinancBrutN
    - vals.immoIncorpAmortN - vals.immoCorpAmortN - vals.immoFinancProvN
    + vals.autresActifsNonCourantsN);
  w(wsA, 8, 10, vals.immoIncorpBrutN1 + vals.immoCorpBrutN1 + vals.immoFinancBrutN1
    - vals.immoIncorpAmortN1 - vals.immoCorpAmortN1 - vals.immoFinancProvN1
    + vals.autresActifsNonCourantsN1);

  // Immobilisations corporelles: I15=45000(N), L15=45000(N1) → row14,col7 / row14,col10
  w(wsA, 14, 7, vals.immoCorpBrutN);
  w(wsA, 14, 10, vals.immoCorpBrutN1);
  // Amort corp: I17=45000 → row16,col7
  w(wsA, 16, 7, vals.immoCorpBrutN - vals.immoCorpAmortN);
  w(wsA, 16, 10, vals.immoCorpBrutN1 - vals.immoCorpAmortN1);

  // Immobilisations financieres: I19=341505(N), L19=338344(N1) → row18,col7 / row18,col10
  w(wsA, 18, 7, vals.immoFinancBrutN);
  w(wsA, 18, 10, vals.immoFinancBrutN1);
  // M19=3161 (variation)
  w(wsA, 18, 11, vals.immoFinancBrutN - vals.immoFinancBrutN1);
  // O19=-66450 (provisions)
  w(wsA, 18, 13, -vals.immoFinancProvN);

  // I20=-272194, L20=-205744 (immob fin nettes) → row19
  w(wsA, 19, 7, vals.immoFinancBrutN - vals.immoFinancProvN);
  w(wsA, 19, 10, vals.immoFinancBrutN1 - vals.immoFinancProvN1);
  // M20=66450 (variation)
  w(wsA, 19, 11, (vals.immoFinancBrutN - vals.immoFinancProvN) - (vals.immoFinancBrutN1 - vals.immoFinancProvN1));

  // I21=69311, L21=132600 (autres immo financieres) → row20
  w(wsA, 20, 7, vals.immoIncorpBrutN - vals.immoIncorpAmortN);
  w(wsA, 20, 10, vals.immoIncorpBrutN1 - vals.immoIncorpAmortN1);
  w(wsA, 20, 11, (vals.immoIncorpBrutN - vals.immoIncorpAmortN) - (vals.immoIncorpBrutN1 - vals.immoIncorpAmortN1));

  // Stocks: I31=128604(N), L31=191893(N1) → row30,col7 / row30,col10
  w(wsA, 30, 7, vals.stocksN);
  w(wsA, 30, 10, vals.stocksN1);
  // Provisions: T31=-75965 → row30,col19
  w(wsA, 30, 18, -vals.stocksProvN);
  // T32=9143 → row31
  w(wsA, 31, 18, vals.stocksProvN);
  // T33=-85108 → row32
  w(wsA, 32, 18, -(vals.stocksN - vals.stocksProvN));

  // Stocks net: I35=128604, L35=191893 → row34
  w(wsA, 34, 7, vals.stocksN - vals.stocksProvN);
  w(wsA, 34, 10, vals.stocksN1 - vals.stocksProvN1);

  // Creances: I39=100385(N), L39=89120(N1) → row38
  w(wsA, 38, 7, vals.clientsN);
  w(wsA, 38, 10, vals.clientsN1);
  // M39=-11265 (variation)
  w(wsA, 38, 11, vals.clientsN - vals.clientsN1);

  // Creances net: I41=100385, L41=89120 → row40
  w(wsA, 40, 7, vals.clientsN - vals.clientsProvN);
  w(wsA, 40, 10, vals.clientsN1 - vals.clientsProvN1);

  // Autres actifs: I43=8851(N), L43=3846(N1) → row42
  w(wsA, 42, 7, vals.autresActifsCourantsN);
  w(wsA, 42, 10, vals.autresActifsCourantsN1);
  // M43=-5005
  w(wsA, 42, 11, vals.autresActifsCourantsN - vals.autresActifsCourantsN1);

  // Autres actifs net: I45=8851, L45=3846 → row44
  w(wsA, 44, 7, vals.autresActifsCourantsN);
  w(wsA, 44, 10, vals.autresActifsCourantsN1);

  // Tresorerie: I47=90128(N), L47=83521(N1) → row46
  w(wsA, 46, 7, vals.tresorerieN);
  w(wsA, 46, 10, vals.tresorerieN1);
  // M47=-6607
  w(wsA, 46, 11, vals.tresorerieN - vals.tresorerieN1);

  // Tresorerie net: I49=90128, L49=83521 → row48
  w(wsA, 48, 7, vals.tresorerieN);
  w(wsA, 48, 10, vals.tresorerieN1);

  // Tresorerie fin: I53=266952(N), L53=111764(N1) → row52
  const totalImmoNetN = (vals.immoIncorpBrutN - vals.immoIncorpAmortN) + (vals.immoCorpBrutN - vals.immoCorpAmortN) + (vals.immoFinancBrutN - vals.immoFinancProvN);
  const totalImmoNetN1 = (vals.immoIncorpBrutN1 - vals.immoIncorpAmortN1) + (vals.immoCorpBrutN1 - vals.immoCorpAmortN1) + (vals.immoFinancBrutN1 - vals.immoFinancProvN1);
  const tresorerieFinN = vals.tresorerieN;
  const tresorerieFinN1 = vals.tresorerieN1;
  w(wsA, 52, 7, tresorerieFinN);
  w(wsA, 52, 10, tresorerieFinN1);
  w(wsA, 52, 11, tresorerieFinN - tresorerieFinN1);

  // Total: I55=466316, L55=288251 → row54
  const totalNCN = totalImmoNetN + vals.autresActifsNonCourantsN;
  const totalNCN1 = totalImmoNetN1 + vals.autresActifsNonCourantsN1;
  w(wsA, 54, 7, totalNCN + (vals.stocksN - vals.stocksProvN) + (vals.clientsN - vals.clientsProvN) + vals.autresActifsCourantsN);
  w(wsA, 54, 10, totalNCN1 + (vals.stocksN1 - vals.stocksProvN1) + (vals.clientsN1 - vals.clientsProvN1) + vals.autresActifsCourantsN1);
  // N56=-155188
  w(wsA, 55, 12, -(vals.tresorerieN - vals.tresorerieN1));

  // TOTAL ACTIF: I58=594920(N), L58=480144(N1) → row57
  const totalActifN = totalNCN + (vals.stocksN - vals.stocksProvN) + (vals.clientsN - vals.clientsProvN) + vals.autresActifsCourantsN + vals.tresorerieN;
  const totalActifN1 = totalNCN1 + (vals.stocksN1 - vals.stocksProvN1) + (vals.clientsN1 - vals.clientsProvN1) + vals.autresActifsCourantsN1 + vals.tresorerieN1;
  w(wsA, 57, 7, totalActifN);
  w(wsA, 57, 10, totalActifN1);

  // ===== PASSIF =====
  // H10=46022(N), J10=45657(N1) → row9,col6 / row9,col8
  const totalCPN = vals.capitalSocialN + vals.reservesN + vals.resultatsReportesN + vals.resultatExerciceN;
  const totalCPN1 = vals.capitalSocialN1 + vals.reservesN1 + vals.resultatsReportesN1 + vals.resultatExerciceN1;
  w(wsP, 9, 6, totalCPN);
  w(wsP, 9, 8, totalCPN1);

  // H16=20000(capital), J16=20000 → row15
  w(wsP, 15, 6, vals.capitalSocialN);
  w(wsP, 15, 8, vals.capitalSocialN1);

  // H17=2000(reserves), J17=2000 → row16
  w(wsP, 16, 6, vals.reservesN);
  w(wsP, 16, 8, vals.reservesN1);

  // H18=1418(report), J18=18609 → row17
  w(wsP, 17, 6, vals.resultatsReportesN);
  w(wsP, 17, 8, vals.resultatsReportesN1);

  // H20=23418(subtotal CP), J20=40609 → row19
  w(wsP, 19, 6, vals.capitalSocialN + vals.reservesN + vals.resultatsReportesN);
  w(wsP, 19, 8, vals.capitalSocialN1 + vals.reservesN1 + vals.resultatsReportesN1);

  // H22=98370(resultat), J22=22809 → row21
  w(wsP, 21, 6, vals.resultatExerciceN);
  w(wsP, 21, 8, vals.resultatExerciceN1);

  // H24=121788(total CP), J24=63418 → row23
  w(wsP, 23, 6, totalCPN);
  w(wsP, 23, 8, totalCPN1);

  // H31=19533(emprunts), J31=49600 → row30
  w(wsP, 30, 6, vals.empruntsN);
  w(wsP, 30, 8, vals.empruntsN1);
  // L31=-30067(variation)
  w(wsP, 30, 10, vals.empruntsN - vals.empruntsN1);

  // H35=19533(total NC), J35=49600 → row34
  w(wsP, 34, 6, vals.empruntsN + vals.autresPassifsFinanciersN + vals.provisionsN);
  w(wsP, 34, 8, vals.empruntsN1 + vals.autresPassifsFinanciersN1 + vals.provisionsN1);

  // H39=311992(fournisseurs), J39=259986 → row38
  w(wsP, 38, 6, vals.fournisseursN);
  w(wsP, 38, 8, vals.fournisseursN1);
  // K39=102633(variation)
  w(wsP, 38, 9, vals.fournisseursN - vals.fournisseursN1);

  // H40=109723(autres PC), J40=59096 → row39
  w(wsP, 39, 6, vals.autresPassifsCourantsN);
  w(wsP, 39, 8, vals.autresPassifsCourantsN1);

  // H41=31884(concours), J41=48044 → row40
  w(wsP, 40, 6, vals.concoursBancairesN);
  w(wsP, 40, 8, vals.concoursBancairesN1);

  // H43=453599(total CT), J43=367126 → row42
  const totalCTN = vals.fournisseursN + vals.autresPassifsCourantsN + vals.concoursBancairesN;
  const totalCTN1 = vals.fournisseursN1 + vals.autresPassifsCourantsN1 + vals.concoursBancairesN1;
  w(wsP, 42, 6, totalCTN);
  w(wsP, 42, 8, totalCTN1);

  // H46=473132(total passif NC+CT), J46=416726 → row45
  const totalPN = vals.empruntsN + vals.autresPassifsFinanciersN + vals.provisionsN;
  const totalPN1 = vals.empruntsN1 + vals.autresPassifsFinanciersN1 + vals.provisionsN1;
  w(wsP, 45, 6, totalPN + totalCTN);
  w(wsP, 45, 8, totalPN1 + totalCTN1);

  // H50=594920(total passif), J50=480144 → row49
  w(wsP, 49, 6, totalCPN + totalPN + totalCTN);
  w(wsP, 49, 8, totalCPN1 + totalPN1 + totalCTN1);

  // ===== RT (Resultat) =====
  // H9=46022(N), I9=45657(N1) → row8,col6 / row8,col7
  w(wsR, 8, 6, yearN);
  w(wsR, 8, 7, yearN1);

  // H13=1837959(ventes), I13=1600954 → row12
  w(wsR, 12, 6, vals.ventesMarchandisesN + vals.revenusN);
  w(wsR, 12, 7, vals.ventesMarchandisesN1 + vals.revenusN1);

  // H17=1837959(production), I17=1600954 → row16
  w(wsR, 16, 6, vals.revenusN);
  w(wsR, 16, 7, vals.revenusN1);

  // H21=1289616(cout achat), I21=1162054 → row20
  w(wsR, 20, 6, -vals.achatsConsommesN);
  w(wsR, 20, 7, -vals.achatsConsommesN1);

  // H22=71935(charges personnel), I22=70609 → row21
  w(wsR, 21, 6, -vals.chargesPersonnelN);
  w(wsR, 21, 7, -vals.chargesPersonnelN1);

  // H23=66450(dotations), I23=65973 → row22
  w(wsR, 22, 6, -vals.dotationsAmortN);
  w(wsR, 22, 7, -vals.dotationsAmortN1);

  // H24=272697(autres charges), I24=251907 → row23
  w(wsR, 23, 6, -vals.autresChargesExploitN);
  w(wsR, 23, 7, -vals.autresChargesExploitN1);

  // H25=1700698(total charges), I25=1550543 → row24
  const totalChargesN = vals.achatsConsommesN + vals.chargesPersonnelN + vals.dotationsAmortN + vals.autresChargesExploitN;
  const totalChargesN1 = vals.achatsConsommesN1 + vals.chargesPersonnelN1 + vals.dotationsAmortN1 + vals.autresChargesExploitN1;
  w(wsR, 24, 6, -totalChargesN);
  w(wsR, 24, 7, -totalChargesN1);

  // H28=137261(marge brute), I28=50411 → row27
  const margeBruteN = vals.ventesMarchandisesN;
  const margeBruteN1 = vals.ventesMarchandisesN1;
  w(wsR, 27, 6, margeBruteN);
  w(wsR, 27, 7, margeBruteN1);

  // H30=-13053(charges financieres), I30=-21476 → row29
  w(wsR, 29, 6, -vals.chargesFinancieresN);
  w(wsR, 29, 7, -vals.chargesFinancieresN1);

  // H35=124208(res avant IS), I35=28935 → row34
  const resAvantISN = margeBruteN - totalChargesN - vals.chargesFinancieresN;
  const resAvantISN1 = margeBruteN1 - totalChargesN1 - vals.chargesFinancieresN1;
  w(wsR, 34, 6, resAvantISN);
  w(wsR, 34, 7, resAvantISN1);

  // H37=-25838(IS), I37=-6126 → row36
  w(wsR, 36, 6, -vals.impotBeneficesN);
  w(wsR, 36, 7, -vals.impotBeneficesN1);

  // H39=98370(resultat), I39=22809 → row38
  const resOrdN = resAvantISN - vals.impotBeneficesN;
  const resOrdN1 = resAvantISN1 - vals.impotBeneficesN1;
  w(wsR, 38, 6, resOrdN);
  w(wsR, 38, 7, resOrdN1);

  // H43=98370(res activites ordinaires), I43=22809 → row42
  w(wsR, 42, 6, resOrdN);
  w(wsR, 42, 7, resOrdN1);

  // H47=98370(resultat net), I47=22809 → row46
  w(wsR, 46, 6, resOrdN);
  w(wsR, 46, 7, resOrdN1);

  // ===== SIG =====
  // F8=46022(N), G8=45291(N1) → row7,col4 / row7,col5
  w(wsS, 7, 4, yearN);
  w(wsS, 7, 5, yearN1);

  // F10=1837959(ventes marchandises), G10=1600954 → row9
  w(wsS, 9, 4, vals.ventesMarchandisesN);
  w(wsS, 9, 5, vals.ventesMarchandisesN1);

  // F13=1837959(marge commerciale), G13=1600954 → row12
  w(wsS, 12, 4, vals.ventesMarchandisesN);
  w(wsS, 12, 5, vals.ventesMarchandisesN1);

  // F21=-1289616(cout achat), G21=-1162054 → row20
  w(wsS, 20, 4, -vals.cAchatMarchandisesN);
  w(wsS, 20, 5, -vals.cAchatMarchandisesN1);

  // F24=548343(marge brute), G24=438900 → row23
  const margeCommN = vals.ventesMarchandisesN - vals.cAchatMarchandisesN;
  const margeCommN1 = vals.ventesMarchandisesN1 - vals.cAchatMarchandisesN1;
  w(wsS, 23, 4, margeCommN);
  w(wsS, 23, 5, margeCommN1);

  // F26=548343(activite totale), G26=438900 → row25
  w(wsS, 25, 4, margeCommN);
  w(wsS, 25, 5, margeCommN1);

  // F28=548343(marge brute totale), G28=438900 → row27
  w(wsS, 27, 4, margeCommN);
  w(wsS, 27, 5, margeCommN1);

  // F30=-266927(charges externes), G30=-245978 → row29
  w(wsS, 29, 4, -vals.autresChargesExternesN);
  w(wsS, 29, 5, -vals.autresChargesExternesN1);

  // F32=281416(VAB), G32=192922 → row31
  const vabN = margeCommN - vals.autresChargesExternesN;
  const vabN1 = margeCommN1 - vals.autresChargesExternesN1;
  w(wsS, 31, 4, vabN);
  w(wsS, 31, 5, vabN1);

  // F34=-5770(impots taxes), G34=-5929 → row33
  w(wsS, 33, 4, -vals.impotsTaxesN);
  w(wsS, 33, 5, -vals.impotsTaxesN1);

  // F35=-71935(charges personnel), G35=-70609 → row34
  w(wsS, 34, 4, -vals.chargesPersonnelN);
  w(wsS, 34, 5, -vals.chargesPersonnelN1);

  // F37=203711(EBE), G37=116384 → row36
  const ebeN = vabN - vals.impotsTaxesN - vals.chargesPersonnelN;
  const ebeN1 = vabN1 - vals.impotsTaxesN1 - vals.chargesPersonnelN1;
  w(wsS, 36, 4, ebeN);
  w(wsS, 36, 5, ebeN1);

  // F39=-13053(charges financieres), G39=-21476 → row38
  w(wsS, 38, 4, -vals.chargesFinancieresN);
  w(wsS, 38, 5, -vals.chargesFinancieresN1);

  // F44=-66450(dotations), G44=-65973 → row43
  w(wsS, 43, 4, -vals.dotationsAmortN);
  w(wsS, 43, 5, -vals.dotationsAmortN1);

  // F45=-25838(IS), G45=-6126 → row44
  w(wsS, 44, 4, -vals.impotBeneficesN);
  w(wsS, 44, 5, -vals.impotBeneficesN1);

  // F47=98370(resultat), G47=22809 → row46
  const resOrdSigN = ebeN - vals.chargesFinancieresN - vals.dotationsAmortN - vals.impotBeneficesN;
  const resOrdSigN1 = ebeN1 - vals.chargesFinancieresN1 - vals.dotationsAmortN1 - vals.impotBeneficesN1;
  w(wsS, 46, 4, resOrdSigN);
  w(wsS, 46, 5, resOrdSigN1);

  // F52=98370(resultat net), G52=22809 → row51
  w(wsS, 51, 4, resOrdSigN);
  w(wsS, 51, 5, resOrdSigN1);

  // ===== FLUX =====
  // H9=46022(N), I9=45657(N1) → row8,col7 / row8,col8
  w(wsF, 8, 7, yearN);
  w(wsF, 8, 8, yearN1);

  // H13=98370(resultat net), I13=22810 → row12
  w(wsF, 12, 7, vals.variationStocksN !== undefined ? resOrdN : 0);
  w(wsF, 12, 8, resOrdN1);

  // H15=66450(dotations), I15=65973 → row14
  w(wsF, 14, 7, vals.dotationsProvisionsN);
  w(wsF, 14, 8, vals.dotationsProvisionsN1);

  // H17=-11265(variation stocks), I17=49516 → row16
  w(wsF, 16, 7, vals.variationStocksN);
  w(wsF, 16, 8, vals.variationStocksN1);

  // H18=-5005(variation creances), I18=93 → row17
  w(wsF, 17, 7, vals.variationCreancesN);
  w(wsF, 17, 8, vals.variationCreancesN1);

  // H19=-6607(variation autres actifs), I19=107496 → row18
  w(wsF, 18, 7, vals.variationAutresActifsN);
  w(wsF, 18, 8, vals.variationAutresActifsN1);

  // H20=87898(variation fournisseurs), I20=35895 → row19
  w(wsF, 19, 7, vals.variationFournisseursN);
  w(wsF, 19, 8, vals.variationFournisseursN1);

  // H22=0(plus values), H23=0(reprise) → row21, row22
  w(wsF, 21, 7, 0);
  w(wsF, 22, 7, 0);

  // H24=229841(flux exploitation), I24=281783 → row23
  const fluxExploitN = resOrdN + vals.dotationsProvisionsN + vals.variationStocksN + vals.variationCreancesN + vals.variationAutresActifsN + vals.variationFournisseursN;
  const fluxExploitN1 = resOrdN1 + vals.dotationsProvisionsN1 + vals.variationStocksN1 + vals.variationCreancesN1 + vals.variationAutresActifsN1 + vals.variationFournisseursN1;
  w(wsF, 23, 7, fluxExploitN);
  w(wsF, 23, 8, fluxExploitN1);

  // H28=-3161(acquisitions immo), I28=-5303 → row27
  w(wsF, 27, 7, -vals.acqImmobilisationsN);
  w(wsF, 27, 8, -vals.acqImmobilisationsN1);

  // H33=-3161(flux investissement), I33=-5303 → row32
  const fluxInvestN = -vals.acqImmobilisationsN;
  const fluxInvestN1 = -vals.acqImmobilisationsN1;
  w(wsF, 32, 7, fluxInvestN);
  w(wsF, 32, 8, fluxInvestN1);

  // H38=-40000(dividendes), I38=-160000 → row37
  w(wsF, 37, 7, 0);
  w(wsF, 37, 8, 0);

  // H40=-30067(remboursements), I40=-38255 → row39
  w(wsF, 39, 7, 0);
  w(wsF, 39, 8, 0);

  // H42=-70067(flux financement), I42=-198255 → row41
  w(wsF, 41, 7, 0);
  w(wsF, 41, 8, 0);

  // H47=156613(variation tresorerie), I47=78225 → row46
  const varTresorN = fluxExploitN + fluxInvestN;
  const varTresorN1 = fluxExploitN1 + fluxInvestN1;
  w(wsF, 46, 7, varTresorN);
  w(wsF, 46, 8, varTresorN1);

  // H49=110339(tresorerie debut), I49=32114 → row48
  w(wsF, 48, 7, vals.tresorerieN1);
  w(wsF, 48, 8, vals.tresorerieN1);

  // H50=266952(tresorerie fin), I50=110339 → row49
  w(wsF, 49, 7, vals.tresorerieN);
  w(wsF, 49, 8, vals.tresorerieN1);

  // ===== TAB AMT =====
  // Reference columns: D=VB N-1, E=Acq, G=VB N, I=Amort N-1, J=Dot, L=Amort N, M=VNC N
  // Row 9: totals header
  const totalVbN1 = vals.immob.reduce((s, l) => s + l.vbN1, 0);
  const totalAcq = vals.immob.reduce((s, l) => s + l.acq, 0);
  const totalCes = vals.immob.reduce((s, l) => s + l.ces, 0);
  const totalDot = vals.immob.reduce((s, l) => s + l.dot, 0);
  const totalReg = vals.immob.reduce((s, l) => s + l.reg, 0);
  const totalVbN = vals.immob.reduce((s, l) => s + l.vbN, 0);
  const totalAmortN1 = vals.immob.reduce((s, l) => s + l.amortN1, 0);
  const totalAmortN = totalAmortN1 + totalDot - totalReg;

  w(wsT, 8, 3, totalVbN1);   // D9
  w(wsT, 8, 6, totalVbN);    // G9
  w(wsT, 8, 8, totalAmortN1); // I9
  w(wsT, 8, 11, totalAmortN); // L9

  // Row 11: Immobilisations incorporelles total
  if (vals.immob.length >= 1) {
    const inc = vals.immob[0];
    w(wsT, 10, 3, inc.vbN1);  // D11
    w(wsT, 10, 6, inc.vbN);   // G11
    w(wsT, 10, 11, inc.amortN1 + inc.dot - inc.reg); // L11
  }

  // Row 13: Immobilisations corporelles total
  if (vals.immob.length >= 2) {
    const corp = vals.immob[1];
    w(wsT, 12, 3, corp.vbN1); // D13
    w(wsT, 12, 6, corp.vbN);  // G13
    w(wsT, 12, 11, corp.amortN1 + corp.dot - corp.reg); // L13
  }

  // Rows 18, 20, 22, 24, 26, 28: individual 22x lines
  const immoRows = [17, 19, 21, 23, 25, 27]; // 0-indexed
  const immoLines = vals.immob.slice(2);
  for (let i = 0; i < Math.min(immoLines.length, immoRows.length); i++) {
    const l = immoLines[i];
    const r = immoRows[i];
    w(wsT, r, 3, l.vbN1);    // D
    w(wsT, r, 4, l.acq);     // E
    w(wsT, r, 6, l.vbN + l.acq - l.ces); // G
    w(wsT, r, 8, l.amortN1); // I
    w(wsT, r, 9, l.dot);     // J
    w(wsT, r, 11, l.amortN1 + l.dot - l.reg); // L
    w(wsT, r, 12, (l.vbN + l.acq - l.ces) - (l.amortN1 + l.dot - l.reg)); // M
  }

  // Row 30: total of individual lines
  const indVbN1 = immoLines.reduce((s, l) => s + l.vbN1, 0);
  const indAcq = immoLines.reduce((s, l) => s + l.acq, 0);
  const indCes = immoLines.reduce((s, l) => s + l.ces, 0);
  const indDot = immoLines.reduce((s, l) => s + l.dot, 0);
  const indReg = immoLines.reduce((s, l) => s + l.reg, 0);
  const indVbN = immoLines.reduce((s, l) => s + l.vbN, 0);
  const indAmortN1 = immoLines.reduce((s, l) => s + l.amortN1, 0);
  const indAmortN = indAmortN1 + indDot - indReg;
  w(wsT, 29, 3, indVbN1);   // D30
  w(wsT, 29, 4, indAcq);    // E30
  w(wsT, 29, 6, indVbN + indAcq - indCes); // G30
  w(wsT, 29, 8, indAmortN1); // I30
  w(wsT, 29, 9, indDot);    // J30
  w(wsT, 29, 11, indAmortN); // L30
  w(wsT, 29, 12, (indVbN + indAcq - indCes) - indAmortN); // M30

  // Row 31: grand total
  w(wsT, 30, 3, totalVbN1);  // D31
  w(wsT, 30, 4, totalAcq);   // E31
  w(wsT, 30, 6, totalVbN + totalAcq - totalCes); // G31
  w(wsT, 30, 8, totalAmortN1); // I31
  w(wsT, 30, 9, totalDot);   // J31
  w(wsT, 30, 11, totalAmortN); // L31
  w(wsT, 30, 12, (totalVbN + totalAcq - totalCes) - totalAmortN); // M31

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
