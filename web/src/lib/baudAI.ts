/**
 * AI Verification and Correction System for BAUD Module
 * Verifies salary calculations, detects anomalies, and provides corrections
 */

import { Employee, PointageData } from './baudParser.js';
import { calculateSalary, SalaryResult } from './baudCalculator.js';

export interface VerificationCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
  employee?: string;
  correction?: any;
}

export interface VerificationResult {
  verdict: 'OK' | 'ATTENTION' | 'ERREUR';
  checks: VerificationCheck[];
  missing: string[];
  anomalies: string[];
  corrections: CorrectionAction[];
  autoFixes: AutoFixAction[];
  summary: {
    totalEmployees: number;
    verified: number;
    warnings: number;
    errors: number;
    corrected: number;
    autoFixed: number;
  };
}

export interface CorrectionAction {
  matricule: string;
  nom: string;
  field: string;
  oldValue: any;
  newValue: any;
  reason: string;
}

export interface AutoFixAction {
  type: 'add_pointage' | 'fix_duplicate' | 'fix_smig' | 'fix_cnss' | 'fix_matricule';
  description: string;
  matricule: string;
  data: any;
  applied: boolean;
}

// Tunisian Labor Code Constants 2026
const CONSTANTS = {
  CNSS_SALARIAL: 0.0968,
  CNSS_PATRONAL: 0.1657,
  AT_MP: 0.005,
  TFP: 0.01,
  FOPROLOS: 0.01,
  CSS: 0.005,
  PLAFOND_CNSS: 5000,
  SMIG: 480,
  FRAIS_PRO_MAX: 2000,
  FRAIS_PRO_RATE: 0.10,
  IRPP_BRACKETS: [
    { min: 0, max: 5000, rate: 0 },
    { min: 5000, max: 10000, rate: 0.15 },
    { min: 10000, max: 20000, rate: 0.25 },
    { min: 20000, max: 30000, rate: 0.30 },
    { min: 30000, max: 40000, rate: 0.33 },
    { min: 40000, max: 50000, rate: 0.36 },
    { min: 50000, max: 70000, rate: 0.38 },
    { min: 70000, max: Infinity, rate: 0.40 },
  ],
};

/**
 * Main verification function
 */
export function verifySalaryCalculations(
  employees: Employee[],
  pointage: PointageData[],
  salaryResults: Map<string, SalaryResult>
): VerificationResult {
  const checks: VerificationCheck[] = [];
  const missing: string[] = [];
  const anomalies: string[] = [];
  const corrections: CorrectionAction[] = [];
  const autoFixes: AutoFixAction[] = [];

  // Create pointage lookup
  const pointageMap = new Map<string, PointageData>();
  for (const ptg of pointage) {
    pointageMap.set(ptg.matricule, ptg);
  }

  let verified = 0;
  let warnings = 0;
  let errors = 0;

  // 1. Check for missing employees
  for (const emp of employees) {
    if (!salaryResults.has(emp.matricule)) {
      missing.push(`${emp.matricule} ${emp.nom} ${emp.prenom}`);
      checks.push({
        name: 'Salaire manquant',
        status: 'error',
        detail: `Aucun calcul pour ${emp.nom} ${emp.prenom}`,
        employee: emp.matricule,
      });
      errors++;
    }
  }

  // 2. Verify each employee calculation
  for (const emp of employees) {
    const result = salaryResults.get(emp.matricule);
    if (!result) continue;

    const ptg = pointageMap.get(emp.matricule);
    const verificationChecks = verifyEmployee(emp, ptg, result, corrections, autoFixes);
    
    for (const check of verificationChecks) {
      checks.push(check);
      if (check.status === 'warning') warnings++;
      if (check.status === 'error') errors++;
    }
    verified++;
  }

  // 3. Cross-employee anomaly detection
  const crossChecks = detectCrossEmployeeAnomalies(employees, salaryResults, autoFixes);
  for (const anomaly of crossChecks) {
    anomalies.push(anomaly);
    checks.push({
      name: 'Anomalie inter-employés',
      status: 'warning',
      detail: anomaly,
    });
    warnings++;
  }

  // 4. Verify totals
  const totalChecks = verifyTotals(employees, salaryResults);
  checks.push(...totalChecks);

  // Determine verdict
  let verdict: VerificationResult['verdict'] = 'OK';
  if (errors > 0) verdict = 'ERREUR';
  else if (warnings > 0) verdict = 'ATTENTION';

  return {
    verdict,
    checks,
    missing,
    anomalies,
    corrections,
    autoFixes,
    summary: {
      totalEmployees: employees.length,
      verified,
      warnings,
      errors,
      corrected: corrections.length,
      autoFixed: autoFixes.filter(f => f.applied).length,
    },
  };
}

/**
 * Verify individual employee calculation
 */
function verifyEmployee(
  emp: Employee,
  ptg: PointageData | undefined,
  result: SalaryResult,
  corrections: CorrectionAction[],
  autoFixes: AutoFixAction[]
): VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  const empLabel = `${emp.nom} ${emp.prenom}`;

  // 1. Check SMIG (minimum wage)
  if (result.salaire_brut < CONSTANTS.SMIG) {
    checks.push({
      name: 'Salaire < SMIG',
      status: 'warning',
      detail: `${empLabel}: Brut ${result.salaire_brut} < SMIG ${CONSTANTS.SMIG}`,
      employee: emp.matricule,
    });
    // Auto-fix: set to SMIG
    autoFixes.push({
      type: 'fix_smig',
      description: `Corriger le salaire de ${empLabel} au SMIG (${CONSTANTS.SMIG} DT)`,
      matricule: emp.matricule,
      data: { field: 'salaire_brut', newValue: CONSTANTS.SMIG },
      applied: false,
    });
  }

  // 2. Verify CNSS calculation
  const expectedCNSS = Math.round(Math.min(result.salaire_brut, CONSTANTS.PLAFOND_CNSS) * CONSTANTS.CNSS_SALARIAL * 1000) / 1000;
  if (Math.abs(result.cnss_salariale - expectedCNSS) > 0.01) {
    checks.push({
      name: 'CNSS incorrect',
      status: 'error',
      detail: `${empLabel}: CNSS calculé ${result.cnss_salariale} ≠ attendu ${expectedCNSS}`,
      employee: emp.matricule,
      correction: { field: 'cnss_salariale', oldValue: result.cnss_salariale, newValue: expectedCNSS },
    });
    corrections.push({
      matricule: emp.matricule,
      nom: empLabel,
      field: 'cnss_salariale',
      oldValue: result.cnss_salariale,
      newValue: expectedCNSS,
      reason: 'Recalcul CNSS selon barème 9.68%',
    });
  }

  // 3. Verify IRPP calculation (annual method)
  const expectedIRPP = calculateExpectedIRPP(result.revenu_net_imposable);
  if (Math.abs(result.irpp - expectedIRPP) > 0.01) {
    checks.push({
      name: 'IRPP incorrect',
      status: 'error',
      detail: `${empLabel}: IRPP calculé ${result.irpp} ≠ attendu ${expectedIRPP}`,
      employee: emp.matricule,
      correction: { field: 'irpp', oldValue: result.irpp, newValue: expectedIRPP },
    });
    corrections.push({
      matricule: emp.matricule,
      nom: empLabel,
      field: 'irpp',
      oldValue: result.irpp,
      newValue: expectedIRPP,
      reason: 'Recalcul IRPP selon barème annuel LF 2025',
    });
  }

  // 4. Verify CSS calculation
  const expectedCSS = Math.round(result.revenu_net_imposable * CONSTANTS.CSS * 1000) / 1000;
  if (Math.abs(result.css_salariale - expectedCSS) > 0.01) {
    checks.push({
      name: 'CSS incorrect',
      status: 'error',
      detail: `${empLabel}: CSS calculé ${result.css_salariale} ≠ attendu ${expectedCSS}`,
      employee: emp.matricule,
    });
  }

  // 5. Check for missing pointage data
  if (!ptg) {
    checks.push({
      name: 'Pointage manquant',
      status: 'warning',
      detail: `${empLabel}: Aucune donnée de pointage`,
      employee: emp.matricule,
    });
    // Auto-fix: create default pointage
    autoFixes.push({
      type: 'add_pointage',
      description: `Créer un pointage par défaut pour ${empLabel} (0 absences, 0 avances)`,
      matricule: emp.matricule,
      data: {
        matricule: emp.matricule,
        nom: emp.nom,
        prenom: emp.prenom,
        absences: '',
        avances: 0,
        conges_payes: '',
        heures_supplementaires: '',
      },
      applied: false,
    });
  } else {
    // Check absences合理性
    const absences = parseInt(ptg.absences) || 0;
    if (absences > 22) {
      checks.push({
        name: 'Absences excessives',
        status: 'warning',
        detail: `${empLabel}: ${absences} absences (> 22 jours/mois)`,
        employee: emp.matricule,
      });
    }

    // Check avances合理性
    if (ptg.avances > result.salaire_brut * 0.5) {
      checks.push({
        name: 'Avances élevées',
        status: 'warning',
        detail: `${empLabel}: Avances ${ptg.avances} > 50% du brut ${result.salaire_brut}`,
        employee: emp.matricule,
      });
    }
  }

  // 6. Check for negative values
  if (result.salaire_net < 0) {
    checks.push({
      name: 'Salaire net négatif',
      status: 'error',
      detail: `${empLabel}: Net ${result.salaire_net} < 0`,
      employee: emp.matricule,
    });
  }

  // 7. Verify net calculation
  const expectedNet = Math.round((result.salaire_brut - result.total_retenues) * 1000) / 1000;
  if (Math.abs(result.salaire_net - expectedNet) > 0.01) {
    checks.push({
      name: 'Calcul net incorrect',
      status: 'error',
      detail: `${empLabel}: Net calculé ${result.salaire_net} ≠ attendu ${expectedNet}`,
      employee: emp.matricule,
    });
  }

  // 8. Checkheures supplémentaires
  if (result.heures_supplementaires > 0) {
    const maxHS = 8 * 4.33; // 8h/sem * 4.33 sem/mois
    if (result.heures_supplementaires > maxHS * 2) {
      checks.push({
        name: 'Heures sup excessives',
        status: 'warning',
        detail: `${empLabel}: ${result.heures_supplementaires}h sup > ${maxHS * 2}h max`,
        employee: emp.matricule,
      });
    }
  }

  // If no issues found, add OK check
  if (checks.length === 0) {
    checks.push({
      name: 'Vérification OK',
      status: 'ok',
      detail: `${empLabel}: Tous les calculs sont corrects`,
      employee: emp.matricule,
    });
  }

  return checks;
}

/**
 * Calculate expected IRPP using annual method
 */
function calculateExpectedIRPP(revenuNetImposable: number): number {
  const annual = revenuNetImposable * 12;
  let irppAnnual = 0;
  let remaining = annual;

  for (const bracket of CONSTANTS.IRPP_BRACKETS) {
    if (remaining <= 0) break;
    const size = bracket.max === Infinity ? remaining : bracket.max - bracket.min;
    const taxable = Math.min(remaining, size);
    irppAnnual += taxable * bracket.rate;
    remaining -= taxable;
  }

  return Math.round((irppAnnual / 12) * 1000) / 1000;
}

/**
 * Detect anomalies across employees
 */
function detectCrossEmployeeAnomalies(
  employees: Employee[],
  salaryResults: Map<string, SalaryResult>,
  autoFixes: AutoFixAction[]
): string[] {
  const anomalies: string[] = [];

  // 1. Check for duplicate matricules
  const matriculeCount = new Map<string, number>();
  for (const emp of employees) {
    matriculeCount.set(emp.matricule, (matriculeCount.get(emp.matricule) || 0) + 1);
  }
  for (const [mat, count] of matriculeCount) {
    if (count > 1) {
      anomalies.push(`Matricule ${mat} en double (${count} fois)`);
      // Auto-fix: suggest new matricule
      const maxMat = Math.max(...employees.map(e => parseInt(e.matricule) || 0));
      autoFixes.push({
        type: 'fix_duplicate',
        description: `Changer le matricule dupliqué ${mat} en ${maxMat + 1}`,
        matricule: mat,
        data: { newMatricule: String(maxMat + 1) },
        applied: false,
      });
    }
  }

  // 2. Check for salary outliers (using IQR method)
  const salaries = employees.map(e => e.salaire_brut).filter(s => s > 0).sort((a, b) => a - b);
  if (salaries.length > 10) {
    const q1 = salaries[Math.floor(salaries.length * 0.25)];
    const q3 = salaries[Math.floor(salaries.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    for (const emp of employees) {
      if (emp.salaire_brut < lowerBound || emp.salaire_brut > upperBound) {
        anomalies.push(`${emp.nom} ${emp.prenom}: Salaire ${emp.salaire_brut} aberrant (hors IQR [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}])`);
      }
    }
  }

  // 3. Check for missing CNSS numbers
  for (const emp of employees) {
    if (!emp.numero_cnss || emp.numero_cnss.length < 5) {
      anomalies.push(`${emp.nom} ${emp.prenom}: Numéro CNSS manquant ou invalide`);
    }
  }

  // 4. Check for missing CIN
  for (const emp of employees) {
    if (!emp.cin || emp.cin.length < 5) {
      anomalies.push(`${emp.nom} ${emp.prenom}: CIN manquant ou invalide`);
    }
  }

  return anomalies;
}

/**
 * Verify totals
 */
function verifyTotals(
  employees: Employee[],
  salaryResults: Map<string, SalaryResult>
): VerificationCheck[] {
  const checks: VerificationCheck[] = [];

  let totalBrut = 0;
  let totalCNSS = 0;
  let totalIRPP = 0;
  let totalCSS = 0;
  let totalNet = 0;

  for (const emp of employees) {
    const result = salaryResults.get(emp.matricule);
    if (!result) continue;

    totalBrut += result.salaire_brut;
    totalCNSS += result.cnss_salariale;
    totalIRPP += result.irpp;
    totalCSS += result.css_salariale;
    totalNet += result.salaire_net;
  }

  // Check ratios
  const cnssRatio = totalCNSS / totalBrut;
  const irppRatio = totalIRPP / totalBrut;

  if (Math.abs(cnssRatio - CONSTANTS.CNSS_SALARIAL) > 0.02) {
    checks.push({
      name: 'Ratio CNSS aberrant',
      status: 'warning',
      detail: `Ratio CNSS/Brut: ${(cnssRatio * 100).toFixed(2)}% (attendu ~${CONSTANTS.CNSS_SALARIAL * 100}%)`,
    });
  }

  if (irppRatio > 0.3) {
    checks.push({
      name: 'Ratio IRPP élevé',
      status: 'warning',
      detail: `Ratio IRPP/Brut: ${(irppRatio * 100).toFixed(2)}% (> 30%)`,
    });
  }

  // Add summary check
  checks.push({
    name: 'Totaux',
    status: 'ok',
    detail: `Brut: ${totalBrut.toFixed(3)}, CNSS: ${totalCNSS.toFixed(3)}, IRPP: ${totalIRPP.toFixed(3)}, CSS: ${totalCSS.toFixed(3)}, Net: ${totalNet.toFixed(3)}`,
  });

  return checks;
}

/**
 * Apply corrections to salary results
 */
export function applyCorrections(
  employees: Employee[],
  pointage: PointageData[],
  salaryResults: Map<string, SalaryResult>,
  corrections: CorrectionAction[]
): Map<string, SalaryResult> {
  const correctedResults = new Map<string, SalaryResult>(salaryResults);

  for (const correction of corrections) {
    const result = correctedResults.get(correction.matricule);
    if (!result) continue;

    const newResult = { ...result };
    (newResult as any)[correction.field] = correction.newValue;

    // Recalculate totals if needed
    if (correction.field === 'cnss_salariale' || correction.field === 'irpp' || correction.field === 'css_salariale') {
      newResult.total_retenues = newResult.cnss_salariale + newResult.irpp + newResult.css_salariale;
      newResult.salaire_net = Math.round((newResult.salaire_brut - newResult.total_retenues) * 1000) / 1000;
      newResult.net_a_payer = newResult.salaire_net;
    }

    correctedResults.set(correction.matricule, newResult);
  }

  return correctedResults;
}

/**
 * Apply auto-fixes to employees and pointage data
 */
export function applyAutoFixes(
  employees: Employee[],
  pointage: PointageData[],
  autoFixes: AutoFixAction[]
): { employees: Employee[]; pointage: PointageData[] } {
  let newEmployees = [...employees];
  let newPointage = [...pointage];

  for (const fix of autoFixes) {
    if (fix.applied) continue;

    switch (fix.type) {
      case 'add_pointage':
        // Add missing pointage entry
        newPointage.push(fix.data);
        break;

      case 'fix_duplicate':
        // Fix duplicate matricule (change the last occurrence)
        const lastIndex = newEmployees.findIndex(e => e.matricule === fix.matricule);
        if (lastIndex >= 0) {
          newEmployees[lastIndex] = { ...newEmployees[lastIndex], matricule: fix.data.newMatricule };
        }
        break;

      case 'fix_smig':
        // Fix salary to SMIG
        const empIndex = newEmployees.findIndex(e => e.matricule === fix.matricule);
        if (empIndex >= 0) {
          newEmployees[empIndex] = { ...newEmployees[empIndex], salaire_brut: fix.data.newValue };
        }
        break;

      case 'fix_cnss':
        // Fix CNSS number
        const empIdx = newEmployees.findIndex(e => e.matricule === fix.matricule);
        if (empIdx >= 0) {
          newEmployees[empIdx] = { ...newEmployees[empIdx], numero_cnss: fix.data.newValue };
        }
        break;
    }
  }

  return { employees: newEmployees, pointage: newPointage };
}
