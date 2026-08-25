// FISC journal — DMI PDF parser and ecritures generator
// Piece A: constatation globale D = total_general (page 13), C = all withholdings + TVA (balancing figure)
// Pieces B: TFP, C: FOPROLOS, D: RECLASS TVA (4 lines), E: TCL

function parseDMIItems(pdfItems) {
  const result = {
    mois: null, annee: null,
    retenue_salaires: 0, css: 0, retenue_loyers: 0, retenue_marches: 0,
    tfp_du: 0, foprolos_du: 0,
    tva_collectee: 0, tva_deductible: 0, tva_report_precedent: 0,
    tva_resultat: 0, tva_signe: null,
    timbre_fiscal: 0, tcl_du: 0, total_general: 0,
  };

  const byPage = {};
  for (const item of pdfItems) {
    if (!byPage[item.page]) byPage[item.page] = [];
    byPage[item.page].push(item);
  }

  function getDecimals(page) {
    const seen = new Set();
    const nums = [];
    for (const item of (byPage[page] || [])) {
      if (!item.str.includes('.')) continue;
      const m = item.str.match(/^\d[\d .]*\d$/);
      if (m) {
        const val = parseFloat(m[0].replace(/ /g, ''));
        if (!isNaN(val) && val > 0 && !seen.has(val)) { seen.add(val); nums.push(val); }
      }
    }
    return nums;
  }

  // Month/Year
  for (const item of byPage[1] || []) {
    const m1 = item.str.match(/mois\s+0(\d)-20(\d{2})/);
    if (m1) { result.mois = '0' + m1[1]; result.annee = '20' + m1[2]; break; }
    const m2 = item.str.match(/annee=(\d{4}).*moiss=(\d{2})/);
    if (m2 && !result.annee) { result.annee = m2[1]; result.mois = m2[2]; }
  }

  // Page 1: Retenue salaires + CSS
  const p1 = getDecimals(1);
  const salCand = p1.filter(n => n >= 500 && n <= 5000);
  if (salCand.length > 0) result.retenue_salaires = salCand[0];
  const cssCand = p1.filter(n => n >= 10 && n <= 100);
  if (cssCand.length > 0) result.css = cssCand[0];

  console.log('Page 1:', p1);
  console.log('Retenue salaires:', result.retenue_salaires, 'CSS:', result.css);

  // Page 4: Retenues (loyers + marchés)
  const p4 = getDecimals(4);
  console.log('Page 4 decimals:', p4);
  const retCand = p4.filter(n => n >= 10 && n <= 5000);
  retCand.sort((a, b) => a - b);
  console.log('Retenues candidates (10-5000):', retCand);
  if (retCand.length >= 2) {
    result.retenue_loyers = retCand[0];
    result.retenue_marches = retCand[1];
  } else if (retCand.length === 1) {
    result.retenue_marches = retCand[0];
  }
  console.log('retenue_loyers:', result.retenue_loyers, 'retenue_marches:', result.retenue_marches);

  // Page 4-5: TVA collectée + TVA déductible
  const p4Full = getDecimals(4);
  const p5Full = getDecimals(5);
  const allTVA = [...p4Full, ...p5Full];
  // tva_collectee is typically largest TVA amount (9107.356 for DMI 01)
  const tvaCollCand = allTVA.filter(n => n >= 1000 && n <= 50000);
  if (tvaCollCand.length > 0) result.tva_collectee = tvaCollCand[tvaCollCand.length - 1];
  // tva_deductible is medium TVA amount (1853.5 for DMI 01)
  const tvaDedCand = allTVA.filter(n => n >= 100 && n <= 5000 && n !== result.tva_collectee);
  if (tvaDedCand.length > 0) result.tva_deductible = tvaDedCand[tvaDedCand.length - 1];

  // Page 6: TVA — sort by Y position (highest Y first = subtotal, then report, then result)
  const p6items = (byPage[6] || []).filter(item => {
    if (!item.str.includes('.')) return false;
    const m = item.str.match(/^\d[\d .]*\d$/);
    if (!m) return false;
    const val = parseFloat(m[0].replace(/ /g, ''));
    return !isNaN(val) && val > 100 && val < 100000;
  });
  p6items.sort((a, b) => b.y - a.y);
  // Y=759: subtotal, Y=738: report, Y=549: result
  if (p6items.length >= 3) {
    const subtotal = parseFloat(p6items[0].str.replace(/ /g, ''));
    const report = parseFloat(p6items[1].str.replace(/ /g, ''));
    const resultat = parseFloat(p6items[2].str.replace(/ /g, ''));
    result.tva_report_precedent = report;
    result.tva_resultat = resultat;
    // Sign: if subtotal > report → ب (due), else → ف (credit)
    result.tva_signe = subtotal > report ? 'ب' : 'ف';
  } else if (p6items.length === 2) {
    result.tva_report_precedent = parseFloat(p6items[0].str.replace(/ /g, ''));
    result.tva_resultat = parseFloat(p6items[1].str.replace(/ /g, ''));
    result.tva_signe = 'ب';
  } else if (p6items.length === 1) {
    result.tva_resultat = parseFloat(p6items[0].str.replace(/ /g, ''));
    result.tva_signe = 'ب';
  }

  // Page 10: Timbre
  const p10 = getDecimals(10);
  const timbreCand = p10.filter(n => n >= 40 && n <= 200);
  if (timbreCand.length > 0) result.timbre_fiscal = timbreCand[0];

  // Page 12: TCL + TFP + FOPROLOS (recap page)
  // Get all decimals with Y positions from page 12
  const p12Items = [];
  const p12seen = new Set();
  for (const item of (byPage[12] || [])) {
    if (!item.str.includes('.')) continue;
    const m = item.str.match(/^\d[\d .]*\d$/);
    if (m) {
      const val = parseFloat(m[0].replace(/ /g, ''));
      if (!isNaN(val) && val > 0 && !p12seen.has(val)) { p12seen.add(val); p12Items.push({ val, y: item.y }); }
    }
  }
  p12Items.sort((a, b) => b.y - a.y);
  console.log('Page 12 items (all):', p12Items.map(i => `${i.val} @ y=${i.y.toFixed(1)}`).join(', '));
  const p12vals = p12Items.map(i => i.val).filter(n => n >= 50 && n <= 5000);
  console.log('Page 12 filtered (50-5000):', p12vals);
  if (p12vals.length >= 3) {
    result.tcl_du = p12vals[0];
    result.tfp_du = p12vals[1];
    result.foprolos_du = p12vals[2];
  } else if (p12vals.length === 2) {
    result.tcl_du = p12vals[0];
    result.tfp_du = p12vals[1];
  } else if (p12vals.length === 1) {
    result.tcl_du = p12vals[0];
  }

  // Page 13: Total general
  const p13 = getDecimals(13);
  const totalCand = p13.filter(n => n >= 1000 && n <= 100000);
  if (totalCand.length > 0) result.total_general = totalCand[totalCand.length - 1];

  console.log('TVA candidates:', { tvaCollCand, tvaDedCand });
  console.log('TVA parsed:', { collectee: result.tva_collectee, deductible: result.tva_deductible });
  console.log('TVA from page 6:', { report: result.tva_report_precedent, resultat: result.tva_resultat, signe: result.tva_signe });
  console.log('Timbre:', result.timbre_fiscal, 'TCL:', result.tcl_du, 'TFP:', result.tfp_du, 'FOPROLOS:', result.foprolos_du, 'Total:', result.total_general);

  return result;
}

function generateFISCecritures(dmi, dossierId, societeId) {
  const journal = 'FISC';
  const datePiece = `${dmi.annee}-${dmi.mois}-21`;
  const libelle = `DMI ${dmi.mois}-${dmi.annee}`;
  const entries = [];
  let numPiece = 1;

  function addEntry(compte, sens, montant, tresorerie) {
    if (montant === 0) return;
    entries.push({
      dossier_id: dossierId, societe_id: societeId, journal_code: journal,
      date_operation: datePiece, date_piece: datePiece,
      numero_doc: `${libelle} P${numPiece}`, libelle,
      compte, sens, montant: Math.round(montant * 1000) / 1000, tresorerie,
    });
  }

  if (!dmi.total_general || dmi.total_general === 0) {
    return { error: 'Montant total general non trouve', entries: [] };
  }

  // Piece A: constatation globale
  addEntry('457100', 'D', dmi.total_general, `CST ${libelle}`);
  if (dmi.retenue_salaires > 0) addEntry('432100', 'C', dmi.retenue_salaires, `CST ${libelle}`);
  if (dmi.css > 0) addEntry('432101', 'C', dmi.css, `CST ${libelle}`);
  if (dmi.retenue_loyers > 0) addEntry('432300', 'C', dmi.retenue_loyers, `CST ${libelle}`);
  if (dmi.retenue_marches > 0) addEntry('432400', 'C', dmi.retenue_marches, `CST ${libelle}`);
  if (dmi.tfp_du > 0) addEntry('437300', 'C', dmi.tfp_du, `CST ${libelle}`);
  if (dmi.foprolos_du > 0) addEntry('437200', 'C', dmi.foprolos_du, `CST ${libelle}`);
  if (dmi.timbre_fiscal > 0) addEntry('437500', 'C', dmi.timbre_fiscal, `CST ${libelle}`);
  if (dmi.tcl_du > 0) addEntry('437400', 'C', dmi.tcl_du, `CST ${libelle}`);

  // TVA in piece A = balancing figure (total_general - sum of other credits)
  const sumC = entries.filter(e => e.numero_doc === `${libelle} P1` && e.sens === 'C')
    .reduce((s, e) => s + e.montant, 0);
  const tvaA = Math.round((dmi.total_general - sumC) * 1000) / 1000;
  if (tvaA > 0) {
    addEntry('436510', 'C', tvaA, `CST ${libelle}`);
  } else if (tvaA < 0) {
    addEntry('436670', 'C', Math.abs(tvaA), `CST ${libelle}`);
  }

  // Verify Piece A balance
  const pieceA = entries.filter(e => e.numero_doc === `${libelle} P1`);
  const totalDA = pieceA.filter(e => e.sens === 'D').reduce((s, e) => s + e.montant, 0);
  const totalCA = pieceA.filter(e => e.sens === 'C').reduce((s, e) => s + e.montant, 0);
  if (Math.abs(totalDA - totalCA) > 0.01) {
    return { error: `Piece A desequilibree: D=${totalDA.toFixed(3)} C=${totalCA.toFixed(3)} diff=${(totalDA - totalCA).toFixed(3)}`, entries: [], dmi };
  }
  numPiece++;

  // Piece B: TFP (661100→437300)
  if (dmi.tfp_du > 0) {
    addEntry('661100', 'D', dmi.tfp_du, `CST TFP ${libelle}`);
    addEntry('437300', 'C', dmi.tfp_du, `CST TFP ${libelle}`);
    numPiece++;
  }

  // Piece C: FOPROLOS (661200→437200)
  if (dmi.foprolos_du > 0) {
    addEntry('661200', 'D', dmi.foprolos_du, `CST FOPROLOSS ${libelle}`);
    addEntry('437200', 'C', dmi.foprolos_du, `CST FOPROLOSS ${libelle}`);
    numPiece++;
  }

  // Piece D: RECLASS TVA (4 lines)
  const pieceDEntries = [];
  if (dmi.tva_collectee > 0) pieceDEntries.push({ compte: '436710', sens: 'D', montant: dmi.tva_collectee });
  if (dmi.tva_deductible > 0) pieceDEntries.push({ compte: '436660', sens: 'C', montant: dmi.tva_deductible });
  if (dmi.tva_report_precedent > 0) pieceDEntries.push({ compte: '436670', sens: 'C', montant: dmi.tva_report_precedent });
  // TVA result: if ب (due) → C 436510; if ف (credit) → D 436670
  if (dmi.tva_signe === 'ب' && dmi.tva_resultat > 0) {
    pieceDEntries.push({ compte: '436510', sens: 'C', montant: dmi.tva_resultat });
  } else if (dmi.tva_signe === 'ف' && dmi.tva_resultat > 0) {
    pieceDEntries.push({ compte: '436670', sens: 'D', montant: dmi.tva_resultat });
  }

  if (pieceDEntries.length > 0) {
    const totalDE = pieceDEntries.filter(e => e.sens === 'D').reduce((s, e) => s + e.montant, 0);
    const totalCE = pieceDEntries.filter(e => e.sens === 'C').reduce((s, e) => s + e.montant, 0);
    if (Math.abs(totalDE - totalCE) < 0.01) {
      for (const e of pieceDEntries) addEntry(e.compte, e.sens, e.montant, 'RECLASS TVA');
      numPiece++;
    }
  }

  // Piece E: TCL (661300→437400)
  if (dmi.tcl_du > 0) {
    addEntry('661300', 'D', dmi.tcl_du, `CST TCL ${libelle}`);
    addEntry('437400', 'C', dmi.tcl_du, `CST TCL ${libelle}`);
    numPiece++;
  }

  return { entries, dmi };
}

module.exports = { parseDMIItems, generateFISCecritures };
