/**
 * COMPREHENSIVE VALIDATION: All 8 months Excel vs Calculator
 * Compare calculated values against real Sage Paie bulletin data
 */
const XLSX = require('xlsx');
const path = require('path');

// ============ CONSTANTS (matching baudCalculator.ts) ============
const TAUX_CNSS_SALARIAL = 0.0968;
const TAUX_CNSS_PATRONAL = 0.1657;
const TAUX_AT_MP = 0.005;
const TAUX_TFP = 0.01;
const TAUX_FOPROLOS = 0.01;
const TAUX_CSS = 0.005;
const PLAFOND_CNSS = 5000;
const PRIME_PANIER_JOUR = 0.800;
const PRIME_DOUCHE_SEMAINE = 0.600;
const SEMAINES_PAR_MOIS = 4.333;
const PRIME_SAVON = 5.300;
const PRIME_LAIT = 29.000;
const MIT_TAUX = 0.6061;
const ALLOC_CHEF_FAMILLE = 25;
const ALLOC_ENFANT = 8.333;

const IRPP_BRACKET_ANNUAL = [
  { min: 0, max: 5000, taux: 0.00 },
  { min: 5000, max: 10000, taux: 0.15 },
  { min: 10000, max: 20000, taux: 0.25 },
  { min: 20000, max: 30000, taux: 0.30 },
  { min: 30000, max: 40000, taux: 0.33 },
  { min: 40000, max: 50000, taux: 0.36 },
  { min: 50000, max: 70000, taux: 0.38 },
  { min: 70000, max: Infinity, taux: 0.40 },
];

function calculateSalary(input) {
  const {
    salaire_de_base,
    absences_jours = 0,
    heures_supplementaires = 0,
    avances = 0,
    prime_nuit = 0,
    prime_logement = 0,
    augmentation = 0,
    ind_transport,
    prime_presence,
    situation_fam = 'C',
    nombre_enfants = 0,
  } = input;

  const base = Math.max(0, salaire_de_base);
  const transport = ind_transport !== undefined ? ind_transport : 95.002;
  const presence = prime_presence !== undefined ? prime_presence : 8.248;
  const mit = Math.round(presence * MIT_TAUX * 1000) / 1000;

  const jours_travailles = Math.max(0, 26 - absences_jours);
  const panier = Math.round(PRIME_PANIER_JOUR * jours_travailles * 1000) / 1000;
  const douche = Math.round(PRIME_DOUCHE_SEMAINE * SEMAINES_PAR_MOIS * 1000) / 1000;
  const savon = PRIME_SAVON;
  const lait = PRIME_LAIT;

  const brut = Math.round((
    base + transport + presence + mit
    + panier + douche + savon + lait + prime_nuit + prime_logement
    + augmentation
  ) * 1000) / 1000;

  const assiette_cnss = Math.min(Math.max(0, brut - lait), PLAFOND_CNSS);
  const cnss_sal = Math.round(assiette_cnss * TAUX_CNSS_SALARIAL * 1000) / 1000;
  const revenu_imp = Math.max(0, brut - cnss_sal);
  const frais_pro_annuel = Math.min(revenu_imp * 12 * 0.10, 2000);
  const frais_pro = Math.round((frais_pro_annuel / 12) * 1000) / 1000;
  const revenu_net_imp = Math.max(0, revenu_imp - frais_pro);
  
  const revenu_annuel = revenu_net_imp * 12;
  let irpp_annuel = 0;
  let remaining = revenu_annuel;
  for (const b of IRPP_BRACKET_ANNUAL) {
    if (remaining <= 0) break;
    const size = b.max === Infinity ? remaining : b.max - b.min;
    const taxable = Math.min(remaining, size);
    irpp_annuel += Math.round(taxable * b.taux * 1000) / 1000;
    remaining -= taxable;
  }
  const irpp = Math.round((irpp_annuel / 12) * 1000) / 1000;
  const css = Math.round(revenu_net_imp * TAUX_CSS * 1000) / 1000;

  let alloc = 0;
  if (situation_fam === 'M') {
    alloc += ALLOC_CHEF_FAMILLE;
    alloc += Math.min(nombre_enfants, 4) * ALLOC_ENFANT;
  }

  const total_ret = Math.round((cnss_sal + irpp + css + avances) * 1000) / 1000;
  const net = Math.round((brut - cnss_sal - irpp - css) * 1000) / 1000;
  const net_payer = Math.round((net + alloc) * 1000) / 1000;

  return {
    salaire_de_base: base,
    transport, presence, mit,
    panier, douche, savon, lait,
    prime_nuit, prime_logement, augmentation,
    brut, assiette_cnss, cnss_sal,
    revenu_imp, frais_pro, revenu_net_imp,
    irpp, css, alloc,
    total_ret, net, net_payer,
  };
}

// ============ JUNE 2026 SAGE BULLETIN REFERENCE ============
const JUNE_BULLETIN = [
  { mat: '001', nom: 'BACCOUCHE', prenom: 'Taher', base: 588.218, complement: 998.765, transport: 93.055, presence: 7.878, mit: 4.775, panier: 11.760, douche: 23.875, savon: 5.157, nuit: 78.693, aug: 203.449, hs: 667.870, logement: 25.110, lait: 28.350, rappel: 192.420, brut: 1990.392, cnss: 189.926, irpp: 236.601, css: 7.649, avances: 157, sf: 'M', ne: 5 },
  { mat: '002', nom: 'ROUHI', prenom: 'Nabil', base: 1044.082, complement: 983.933, transport: 105.560, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 54.620, aug: 370.940, hs: 510.976, logement: 26.293, lait: 29.700, rappel: 192.420, brut: 3363.040, cnss: 322.667, irpp: 602.045, css: 13.526, avances: 57, sf: 'M', ne: 2 },
  { mat: '003', nom: 'BAOUAB', prenom: 'Nada', base: 817.658, complement: 1615.429, transport: 105.560, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 51.604, aug: 377.282, hs: 916.560, logement: 26.293, lait: 29.700, rappel: 275.690, brut: 3538.867, cnss: 339.687, irpp: 688.447, css: 14.926, avances: 100, sf: 'M', ne: 2 },
  { mat: '004', nom: 'BEN SLIMANE', prenom: 'Karim', base: 606.945, complement: 507.737, transport: 84.188, presence: 7.127, mit: 4.320, panier: 10.640, douche: 21.600, savon: 4.666, nuit: 0, aug: 103.007, hs: 0, logement: 22.717, lait: 25.650, rappel: 0, brut: 1645.637, cnss: 156.815, irpp: 167.634, css: 6.269, avances: 0, sf: 'C', ne: 0 },
  { mat: '005', nom: 'KAABI', prenom: 'Olfa', base: 670.871, complement: 280.367, transport: 93.055, presence: 7.878, mit: 4.775, panier: 11.760, douche: 23.875, savon: 5.157, nuit: 0, aug: 205.857, hs: 0, logement: 25.110, lait: 28.350, rappel: 0, brut: 1549.475, cnss: 147.245, irpp: 146.757, css: 5.852, avances: 157, sf: 'C', ne: 2 },
  { mat: '006', nom: 'RAYSI', prenom: 'Salwa', base: 702.483, complement: 449.069, transport: 97.440, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 0, aug: 192.660, hs: 0, logement: 26.293, lait: 29.700, rappel: 0, brut: 2470.174, cnss: 236.238, irpp: 368.937, css: 10.295, avances: 157, sf: 'M', ne: 1 },
  { mat: '007', nom: 'CHABANE', prenom: 'Mohamed', base: 854.059, complement: 259.344, transport: 86.348, presence: 6.748, mit: 4.090, panier: 10.080, douche: 20.450, savon: 4.417, nuit: 0, aug: 117.287, hs: 0, logement: 21.508, lait: 24.300, rappel: 0, brut: 1735.925, cnss: 165.685, irpp: 174.656, css: 6.410, avances: 0, sf: 'M', ne: 2 },
  { mat: '008', nom: 'FRIX', prenom: 'Fouad', base: 1044.082, complement: 598.718, transport: 105.560, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 65.616, aug: 283.465, hs: 437.800, logement: 26.293, lait: 29.700, rappel: 0, brut: 2647.203, cnss: 253.374, irpp: 401.556, css: 10.366, avances: 157, sf: 'M', ne: 2 },
  { mat: '009', nom: 'BOUCHAHDA', prenom: 'Walid', base: 1044.082, complement: 1509.387, transport: 105.560, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 88.598, aug: 381.517, hs: 1000.500, logement: 26.293, lait: 29.700, rappel: 0, brut: 4241.606, cnss: 407.713, irpp: 858.842, css: 17.450, avances: 264, sf: 'M', ne: 1 },
  { mat: '010', nom: 'HECHI', prenom: 'Mohamed', base: 1044.082, complement: 349.369, transport: 105.560, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 63.501, aug: 206.595, hs: 454.550, logement: 26.293, lait: 29.700, rappel: 0, brut: 2335.619, cnss: 223.213, irpp: 307.503, css: 9.067, avances: 300, sf: 'M', ne: 1 },
  { mat: '011', nom: 'ROUHI', prenom: 'Imed', base: 1044.082, complement: 683.639, transport: 105.560, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 66.876, aug: 243.608, hs: 672.060, logement: 26.293, lait: 29.700, rappel: 0, brut: 2927.787, cnss: 280.535, irpp: 475.264, css: 11.590, avances: 300, sf: 'M', ne: 2 },
  { mat: '012', nom: 'RAGUEZ', prenom: 'Ali', base: 1044.082, complement: 782.883, transport: 105.560, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 67.720, aug: 341.260, hs: 739.140, logement: 26.293, lait: 29.700, rappel: 0, brut: 3192.607, cnss: 306.169, irpp: 542.141, css: 12.776, avances: 0, sf: 'M', ne: 3 },
  { mat: '013', nom: 'ZAYNI', prenom: 'Majed', base: 1189.013, complement: 2368.347, transport: 105.560, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 0, aug: 398.460, hs: 1348.560, logement: 26.293, lait: 29.700, rappel: 0, brut: 5521.902, cnss: 531.645, irpp: 1306.962, css: 23.713, avances: 0, sf: 'C', ne: 0 },
  { mat: '014', nom: 'AAMRI', prenom: 'Moetez', base: 1346.001, complement: 4127.440, transport: 105.560, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 0, aug: 570.417, hs: 0, logement: 26.293, lait: 29.700, rappel: 0, brut: 6261.380, cnss: 603.227, irpp: 1571.661, css: 27.094, avances: 0, sf: 'M', ne: 0 },
  { mat: '015', nom: 'EL MANNAI', prenom: 'Amina', base: 692.021, complement: 325.726, transport: 97.440, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 63.218, aug: 143.816, hs: 792.000, logement: 26.293, lait: 29.700, rappel: 359.655, brut: 2162.965, cnss: 206.500, irpp: 283.768, css: 8.592, avances: 0, sf: 'C', ne: 0 },
  { mat: '016', nom: 'HASSINE', prenom: 'Faouzi', base: 743.286, complement: 298.682, transport: 97.440, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 78.693, aug: 181.059, hs: 555.920, logement: 26.293, lait: 29.700, rappel: 166.845, brut: 2046.567, cnss: 195.233, irpp: 236.936, css: 7.655, avances: 57, sf: 'C', ne: 0 },
  { mat: '017', nom: 'ELWAER', prenom: 'Mortadha', base: 689.406, complement: 180.015, transport: 97.440, presence: 8.249, mit: 5.000, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 0, aug: 176.207, hs: 522.808, logement: 26.293, lait: 29.700, rappel: 244.045, brut: 1747.838, cnss: 166.316, irpp: 199.357, css: 6.904, avances: 57, sf: 'C', ne: 0 },
  { mat: '018', nom: 'LAZAAR', prenom: 'Nader', base: 1396.734, complement: 3507.930, transport: 105.560, presence: 8.249, mit: 0, panier: 12.320, douche: 25.000, savon: 5.400, nuit: 0, aug: 0, hs: 371.232, logement: 26.293, lait: 29.700, rappel: 0, brut: 5481.841, cnss: 0, irpp: 1514.105, css: 26.191, avances: 0, sf: 'C', ne: 0 },
  { mat: '031', nom: 'RHILI', prenom: 'Fatma', base: 595.065, complement: 85.559, transport: 97.440, presence: 8.249, mit: 0, panier: 12.320, douche: 0, savon: 5.400, nuit: 0, aug: 0, hs: 358.996, logement: 26.293, lait: 29.700, rappel: 0, brut: 1398.103, cnss: 123.836, irpp: 107.109, css: 5.480, avances: 0, sf: 'M', ne: 2 },
  { mat: '040', nom: 'SLIMEN', prenom: 'Slim', base: 595.065, complement: 175.533, transport: 97.440, presence: 8.249, mit: 0, panier: 12.320, douche: 0, savon: 5.400, nuit: 0, aug: 0, hs: 255.072, logement: 26.293, lait: 29.700, rappel: 0, brut: 1308.996, cnss: 164.640, irpp: 132.087, css: 5.116, avances: 100, sf: 'C', ne: 0 },
  { mat: '043', nom: 'SIRAT', prenom: 'Hamdi', base: 911.188, complement: 24.010, transport: 105.560, presence: 8.249, mit: 0, panier: 12.320, douche: 0, savon: 5.400, nuit: 0, aug: 0, hs: 0, logement: 26.293, lait: 29.700, rappel: 0, brut: 1730.530, cnss: 164.640, irpp: 169.319, css: 6.293, avances: 0, sf: 'M', ne: 1 },
];

// ============ VALIDATE JUNE 2026 ============
console.log('='.repeat(120));
console.log('VALIDATION: June 2026 — Calculator vs Real Sage Bulletin');
console.log('='.repeat(120));

const EXCEL_FILES = [
  { file: 'Liste du personnel du mois de Janvier 2026.xls', mois: 1 },
  { file: 'Liste du personnel du mois de Février 2026.xls', mois: 2 },
  { file: 'Liste du personnel du mois de Mars 2026 VF.xls', mois: 3 },
  { file: 'Liste du personnel du mois d\'Avril 2026.xls', mois: 4 },
  { file: 'Liste du personnel du mois de mai 2026.xls', mois: 5 },
  { file: 'Liste du personnel du mois de juin 2026.xls', mois: 6 },
  { file: 'Liste du personnel du mois de juillet 2026.xls', mois: 7 },
  { file: 'Liste du personnel du mois de aout 2026.xls', mois: 8 },
];

function parseExcel(filepath) {
  const wb = XLSX.readFile(filepath);
  const employees = [];
  const pointage = [];

  // Parse DP sheet
  const dpSheet = wb.Sheets['DP'];
  if (dpSheet) {
    const data = XLSX.utils.sheet_to_json(dpSheet, { header: 1, defval: '' });
    let headerRow = 3;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      if (data[i] && String(data[i][1] || '').trim() === 'Mat') { headerRow = i; break; }
    }
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const nom = String(row[3] || '').trim();
      const prenom = String(row[4] || '').trim();
      if (!nom && !prenom) continue;
      const sf = String(row[7] || '').trim();
      let situationFam = 'C';
      if (sf === 'M' || sf.toLowerCase().includes('mar')) situationFam = 'M';
      else if (sf === 'C' || sf.toLowerCase().includes('célib') || sf.toLowerCase().includes('celib')) situationFam = 'C';
      employees.push({
        matricule: String(row[1] || '').trim(),
        nom: nom.toUpperCase(),
        prenom,
        salaire_brut: typeof row[19] === 'number' ? row[19] : parseFloat(String(row[19] || '0').replace(',', '.')) || 0,
        nouveau_salaire_brut: typeof row[20] === 'number' ? row[20] : parseFloat(String(row[20] || '0').replace(',', '.')) || 0,
        situation_fam: situationFam,
        nombre_enfants: Math.max(0, Math.floor(parseFloat(String(row[8] || '0').replace(',', '.')) || 0)),
        date_recrutement: String(row[2] || '').trim(),
        fonction: String(row[12] || '').trim(),
      });
    }
  }

  // Parse Pointage sheet
  const ptgSheet = wb.Sheets['Pointage'];
  if (ptgSheet) {
    const data = XLSX.utils.sheet_to_json(ptgSheet, { header: 1, defval: '' });
    let headerRow = 3;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      if (data[i] && String(data[i][1] || '').trim() === 'Mat') { headerRow = i; break; }
    }
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const nom = String(row[2] || '').trim();
      const prenom = String(row[3] || '').trim();
      if (!nom && !prenom) continue;
      const abs = String(row[4] || '').trim();
      const av = parseFloat(String(row[5] || '0').replace(',', '.')) || 0;
      const cp = String(row[6] || '').trim();
      const hs = String(row[7] || '').trim();
      if (abs || av || cp || hs) {
        pointage.push({
          nom: nom.toUpperCase(),
          prenom,
          absences: abs,
          avances: av,
          conges_payes: cp,
          heures_supplementaires: hs,
        });
      }
    }
  }

  return { employees, pointage };
}

function parseAbsences(absStr) {
  if (!absStr) return 0;
  const m = absStr.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function parseHS(hsStr) {
  if (!hsStr) return 0;
  const n = parseFloat(String(hsStr).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Validate June 2026 against real bulletin
console.log('\n--- JUNE 2026: EXCEL CALCULATED vs SAGE BULLETIN ---');
console.log('Employee'.padEnd(25) + 'Field'.padEnd(18) + 'Excel'.padEnd(12) + 'Bulletin'.padEnd(12) + 'Delta'.padEnd(10) + 'Status');
console.log('-'.repeat(90));

const juneFile = path.join('D:\\base de paie', 'Liste du personnel du mois de juin 2026.xls');
const juneData = parseExcel(juneFile);

let totalTests = 0;
let passed = 0;
let failed = 0;

for (const emp of juneData.employees) {
  // Find matching bulletin entry by name
  const bulletin = JUNE_BULLETIN.find(b => {
    const bName = b.nom.toUpperCase();
    const eName = emp.nom.toUpperCase();
    return bName.includes(eName.substring(0, 5)) || eName.includes(bName.substring(0, 5));
  });
  
  if (!bulletin) continue;
  
  // Find pointage
  const ptg = juneData.pointage.find(p => {
    const pName = p.nom.toUpperCase();
    const eName = emp.nom.toUpperCase();
    return pName.includes(eName.substring(0, 5)) || eName.includes(pName.substring(0, 5));
  });
  
  const absences = ptg ? parseAbsences(ptg.absences) : 0;
  const hs = ptg ? parseHS(ptg.heures_supplementaires) : 0;
  const avances = ptg ? ptg.avances : 0;
  
  // Calculate using our calculator
  // The bulletin has rubriques 1000 (base) + 1100 (complement) = total base
  // The primes (panier, douche, etc.) are calculated from this base
  const base1000 = bulletin.base; // Bulletin 1000
  const base1100 = bulletin.complement; // Bulletin 1100
  const totalBase = base1000 + base1100;
  
  // For the calculator, we pass the total base as salaire_de_base
  // The calculator will add transport, presence, MIT, panier, douche, savon, lait, nuit, logement, augmentation
  const calc = calculateSalary({
    salaire_de_base: totalBase,
    absences_jours: absences,
    heures_supplementaires: hs,
    avances: avances,
    prime_nuit: bulletin.nuit,
    prime_logement: bulletin.logement,
    augmentation: bulletin.aug,
    ind_transport: bulletin.transport,
    prime_presence: bulletin.presence,
    situation_fam: bulletin.sf,
    nombre_enfants: bulletin.ne,
  });
  
  // Compare key fields
  const comparisons = [
    { field: 'Brut', calc: calc.brut, ref: bulletin.brut },
    { field: 'CNSS', calc: calc.cnss_sal, ref: bulletin.cnss },
    { field: 'IRPP', calc: calc.irpp, ref: bulletin.irpp },
    { field: 'CSS', calc: calc.css, ref: bulletin.css },
  ];
  
  for (const c of comparisons) {
    const delta = Math.abs(c.calc - c.ref);
    const pct = c.ref > 0 ? (delta / c.ref * 100) : 0;
    const ok = delta < 0.5; // tolerance 0.5 DT
    totalTests++;
    if (ok) passed++; else failed++;
    console.log(
      `${bulletin.nom} ${bulletin.prenom}`.padEnd(25) +
      c.field.padEnd(18) +
      c.calc.toFixed(3).padEnd(12) +
      c.ref.toFixed(3).padEnd(12) +
      delta.toFixed(3).padEnd(10) +
      (ok ? 'OK' : `FAIL (${pct.toFixed(1)}%)`)
    );
  }
}

console.log('\n' + '='.repeat(90));
console.log(`RESULTS: ${passed}/${totalTests} passed, ${failed} failed`);
console.log('='.repeat(90));

// ============ PARSE ALL 8 MONTHS ============
console.log('\n\n' + '='.repeat(120));
console.log('ALL 8 MONTHS: Employee Counts & Key Stats');
console.log('='.repeat(120));

for (const { file, mois } of EXCEL_FILES) {
  const filepath = path.join('D:\\base de paie', file);
  try {
    const data = parseExcel(filepath);
    console.log(`\nMois ${mois}: ${file}`);
    console.log(`  Employees: ${data.employees.length}, Pointage entries: ${data.pointage.length}`);
    
    // Show key employees and their base salaries
    for (const emp of data.employees.slice(0, 5)) {
      const ptg = data.pointage.find(p => {
        const pName = p.nom.toUpperCase();
        const eName = emp.nom.toUpperCase();
        return pName.includes(eName.substring(0, 5)) || eName.includes(pName.substring(0, 5));
      });
      const abs = ptg ? ptg.absences : '';
      const hs = ptg ? ptg.heures_supplementaires : '';
      const av = ptg ? ptg.avances : 0;
      console.log(`  ${emp.nom} ${emp.prenom}: Brut=${emp.salaire_brut} | Nouveau=${emp.nouveau_salaire_brut} | SF=${emp.situation_fam} | NE=${emp.nombre_enfants} | Abs=${abs} | HS=${hs} | Av=${av}`);
    }
    if (data.employees.length > 5) {
      console.log(`  ... and ${data.employees.length - 5} more`);
    }
  } catch (e) {
    console.log(`\nMois ${mois}: ERROR reading ${file}: ${e.message}`);
  }
}
