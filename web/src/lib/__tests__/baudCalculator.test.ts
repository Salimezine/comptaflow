/**
 * Tests module BAUD — Paie tunisienne 2026
 * Vitest — Tests unitaires + integration tous mois/tous salaries
 */
import { describe, it, expect } from 'vitest';
import {
  calculateSalary,
  calculateAnciennete,
  getTauxAnciennete,
  applyRevalorisation,
  generateSagePaieExport,
  type SalaryResult,
} from '../baudCalculator.js';
import { verifySalaryCalculations } from '../baudAI.js';

// ============================================================================
// 1. SMIG — Decret n67/2026
// ============================================================================
describe('SMIG — Decret 67/2026', () => {
  it('salaire >= SMIG 470.251 est accepte', () => {
    const r = calculateSalary({ salaire_brut: 470.251, situation_fam: 'C', nombre_enfants: 0 });
    expect(r.salaire_brut).toBeGreaterThanOrEqual(470.251);
  });

  it('salaire < SMIG est detecte par rapport de controle', () => {
    const employees = [{ matricule: 'T1', nom: 'TEST', prenom: 'Low', nouveau_salaire_brut: 300, salaire_brut: 300 }];
    const results = new Map<string, SalaryResult>();
    results.set('T1', calculateSalary({ salaire_brut: 300, situation_fam: 'C', nombre_enfants: 0 }));
    const exportResult = generateSagePaieExport(employees, [], results, 6, 2026, false);
    expect(exportResult.smigViolations.length).toBe(1);
    expect(exportResult.smigViolations[0].matricule).toBe('T1');
  });
});

// ============================================================================
// 2. CNSS — Loi n73-40 (9.68%, plafond 5000 DT)
// ============================================================================
describe('CNSS — 9.68% plafond 5000 DT', () => {
  it('CNSS sur brut < plafond', () => {
    const r = calculateSalary({ salaire_brut: 1000, situation_fam: 'C', nombre_enfants: 0 });
    // Brut = 1000 + transport(95.002) + presence(8.248) = 1103.25
    const expectedCNSS = Math.round(Math.min(r.salaire_brut, 5000) * 0.0968 * 1000) / 1000;
    expect(r.cnss_salariale).toBe(expectedCNSS);
  });

  it('CNSS plafonne a 5000', () => {
    const r = calculateSalary({ salaire_brut: 8000, situation_fam: 'C', nombre_enfants: 0 });
    expect(r.cnss_salariale).toBe(Math.round(5000 * 0.0968 * 1000) / 1000);
  });
});

// ============================================================================
// 3. IRPP — Bareme annuel 8 tranches
// ============================================================================
describe('IRPP — bareme annuel', () => {
  it('IRPP = 0 pour bas salaire', () => {
    const r = calculateSalary({ salaire_brut: 300, situation_fam: 'C', nombre_enfants: 0 });
    expect(r.irpp).toBe(0);
  });

  it('IRPP > 0 pour salaire moyen', () => {
    const r = calculateSalary({ salaire_brut: 600, situation_fam: 'C', nombre_enfants: 0 });
    expect(r.irpp).toBeGreaterThan(0);
    expect(r.irpp).toBeLessThan(50);
  });

  it('IRPP detail coherence annuelle', () => {
    const r = calculateSalary({ salaire_brut: 1000, situation_fam: 'C', nombre_enfants: 0 });
    const totalDetail = r.irpp_detail.reduce((s, t) => s + t.impot, 0);
    expect(totalDetail / 12).toBeCloseTo(r.irpp, 2);
  });
});

// ============================================================================
// 4. CSS — 0.5% revenu net imposable
// ============================================================================
describe('CSS — 0.5% revenu net imposable', () => {
  it('CSS = 0.5% de revenu_net_imposable', () => {
    const r = calculateSalary({ salaire_brut: 1000, situation_fam: 'C', nombre_enfants: 0 });
    expect(r.css_salariale).toBe(Math.round(r.revenu_net_imposable * 0.005 * 1000) / 1000);
  });

  it('CSS n est PAS sur le brut', () => {
    const r = calculateSalary({ salaire_brut: 1000, situation_fam: 'C', nombre_enfants: 0 });
    const wrong = Math.round(r.salaire_brut * 0.005 * 1000) / 1000;
    expect(r.css_salariale).not.toBe(wrong);
  });
});

// ============================================================================
// 5. Frais pro — 10% plafond 2000 DT/an
// ============================================================================
describe('Frais professionnels', () => {
  it('plafond 166.67/mois pour haut salaire', () => {
    const r = calculateSalary({ salaire_brut: 5000, situation_fam: 'C', nombre_enfants: 0 });
    expect(r.frais_pro).toBe(Math.round((2000 / 12) * 1000) / 1000);
  });

  it('non plafond pour bas salaire', () => {
    const r = calculateSalary({ salaire_brut: 500, situation_fam: 'C', nombre_enfants: 0 });
    const expected = Math.round((r.revenu_imposable * 12 * 0.10 / 12) * 1000) / 1000;
    expect(r.frais_pro).toBe(expected);
  });
});

// ============================================================================
// 6. Anciennete
// ============================================================================
describe('calculateAnciennete', () => {
  it('0 an si meme annee', () => expect(calculateAnciennete('2025-06-15', 6, 2025)).toBe(0));
  it('1 an apres 13 mois', () => expect(calculateAnciennete('2024-05-15', 6, 2025)).toBe(1));
  it('3 ans exacts', () => expect(calculateAnciennete('2022-01-15', 6, 2025)).toBe(3));
  it('10 ans', () => expect(calculateAnciennete('2015-01-01', 6, 2025)).toBe(10));
  it('date vide = 0', () => expect(calculateAnciennete('', 6, 2025)).toBe(0));
});

describe('getTauxAnciennete', () => {
  it('0-2 ans = 0%', () => { expect(getTauxAnciennete(0)).toBe(0); expect(getTauxAnciennete(2)).toBe(0); });
  it('3-5 ans = 5%', () => { expect(getTauxAnciennete(3)).toBe(5); expect(getTauxAnciennete(5)).toBe(5); });
  it('6-8 ans = 10%', () => { expect(getTauxAnciennete(6)).toBe(10); expect(getTauxAnciennete(8)).toBe(10); });
  it('>= 9 ans = 15%', () => { expect(getTauxAnciennete(9)).toBe(15); expect(getTauxAnciennete(15)).toBe(15); });
});

// ============================================================================
// 7. Revalorisation legale — Decret n68/2026
// ============================================================================
describe('applyRevalorisation', () => {
  it('2026 = pas de revalorisation', () => expect(applyRevalorisation(1000, 2026)).toBe(1000));
  it('2027 = +5%', () => expect(applyRevalorisation(1000, 2027)).toBe(Math.round(1000 * 1.05 * 1000) / 1000));
  it('2028 = +10.25% cumulatif', () => expect(applyRevalorisation(1000, 2028)).toBe(Math.round(1000 * 1.05 * 1.05 * 1000) / 1000));
  it('2025 = pas de revalorisation', () => expect(applyRevalorisation(1000, 2025)).toBe(1000));
});

// ============================================================================
// 8. Calcul salaire — ordre correct
// ============================================================================
describe('Calcul salaire — ordre des operations', () => {
  it('brut = base_rev + HS + prime_anc + transport_rev + presence_rev', () => {
    const r = calculateSalary({
      salaire_brut: 1000, situation_fam: 'C', nombre_enfants: 0,
      date_recrutement: '2020-01-01', mois: 6, annee: 2026,
    });
    expect(r.salaire_de_base).toBe(1000);
    expect(r.prime_anciennete).toBe(100);
    expect(r.ind_transport).toBe(95.002);
    expect(r.prime_presence).toBe(8.248);
    expect(r.salaire_brut).toBe(Math.round((1000 + 0 + 100 + 95.002 + 8.248) * 1000) / 1000);
  });

  it('2028 : prime sur base revalORISEE', () => {
    const r = calculateSalary({
      salaire_brut: 1000, situation_fam: 'C', nombre_enfants: 0,
      date_recrutement: '2020-01-01', mois: 6, annee: 2028,
    });
    // salaire_de_base dans le résultat = base revalorisée (1000 * 1.05^2 = 1102.5)
    const expectedBase = Math.round(1000 * 1.05 * 1.05 * 1000) / 1000;
    expect(r.salaire_de_base).toBe(expectedBase);
    expect(r.prime_anciennete).toBe(Math.round(expectedBase * 10 / 100 * 1000) / 1000);
  });

  it('net = brut - cnss - irpp - css - avances', () => {
    const r = calculateSalary({ salaire_brut: 1000, situation_fam: 'C', nombre_enfants: 0, avances: 50 });
    const expected = Math.round((r.salaire_brut - r.cnss_salariale - r.irpp - r.css_salariale - 50) * 1000) / 1000;
    expect(r.salaire_net).toBe(expected);
  });
});

// ============================================================================
// 9. Export Sage Paie 100
// ============================================================================
describe('Export Sage Paie 100', () => {
  const employees = [
    { matricule: '209070', nom: 'DALY', prenom: 'SONDES', nouveau_salaire_brut: 592.928, salaire_brut: 592.928 },
    { matricule: '209071', nom: 'ROUHI', prenom: 'Nabil', nouveau_salaire_brut: 800, salaire_brut: 800 },
  ];
  const results = new Map<string, SalaryResult>();
  results.set('209070', calculateSalary({ salaire_brut: 592.928, situation_fam: 'C', nombre_enfants: 0, date_recrutement: '2020-01-01', mois: 6, annee: 2026 }));
  results.set('209071', calculateSalary({ salaire_brut: 800, situation_fam: 'M', nombre_enfants: 2, date_recrutement: '2018-06-01', mois: 6, annee: 2026 }));

  it('genere des lignes', () => {
    const e = generateSagePaieExport(employees, [], results, 6, 2026, false);
    expect(e.rows.length).toBeGreaterThan(0);
    expect(e.summary.totalEmployees).toBe(2);
  });

  it('rubriques 1000, 3100, 3310, 3320 toujours presentes', () => {
    const e = generateSagePaieExport(employees, [], results, 6, 2026, false);
    const codes = e.rows.map(r => r.code_rubrique);
    expect(codes).toContain('1000');
    expect(codes).toContain('3100');
    expect(codes).toContain('3310');
    expect(codes).toContain('3320');
  });

  it('4120 ABSENTE quand disabled', () => {
    const e = generateSagePaieExport(employees, [], results, 6, 2026, false);
    expect(e.rows.map(r => r.code_rubrique)).not.toContain('4120');
  });

  it('4120 PRESENTE quand enabled', () => {
    const e = generateSagePaieExport(employees, [], results, 6, 2026, true);
    expect(e.rows.map(r => r.code_rubrique)).toContain('4120');
  });

  it('format colonnes correct', () => {
    const e = generateSagePaieExport(employees, [], results, 6, 2026, false);
    for (const row of e.rows) {
      expect(row.matricule).toBeTruthy();
      expect(row.code_rubrique).toBeTruthy();
      expect(row.libelle).toBeTruthy();
      expect(typeof row.valeur).toBe('number');
      expect(row.periode).toBe('06/2026');
    }
  });

  it('alloc 5100 pour marie + enfants', () => {
    const e = generateSagePaieExport(employees, [], results, 6, 2026, false);
    const allocRows = e.rows.filter(r => r.code_rubrique === '5100');
    expect(allocRows.length).toBeGreaterThan(0);
    expect(allocRows.find(r => r.matricule === '209070')).toBeUndefined();
    expect(allocRows.find(r => r.matricule === '209071')!.valeur).toBeGreaterThan(0);
  });
});

// ============================================================================
// 10. Rapport de controle
// ============================================================================
describe('Rapport de controle', () => {
  it('detecte ecarts brut > 10%', () => {
    const employees = [{ matricule: 'T1', nom: 'TEST', prenom: 'Ecart', nouveau_salaire_brut: 1000, salaire_brut: 1000 }];
    const results = new Map<string, SalaryResult>();
    results.set('T1', calculateSalary({ salaire_brut: 1000, situation_fam: 'C', nombre_enfants: 0, date_recrutement: '2020-01-01', mois: 6, annee: 2026 }));
    const e = generateSagePaieExport(employees, [], results, 6, 2026, false);
    expect(e.controlReport.filter(c => c.type === 'warning').length).toBeGreaterThan(0);
  });

  it('detecte matricule trop court', () => {
    const employees = [{ matricule: 'T', nom: 'TEST', prenom: 'Short', nouveau_salaire_brut: 500, salaire_brut: 500 }];
    const results = new Map<string, SalaryResult>();
    results.set('T', calculateSalary({ salaire_brut: 500, situation_fam: 'C', nombre_enfants: 0 }));
    const e = generateSagePaieExport(employees, [], results, 6, 2026, false);
    expect(e.controlReport.filter(c => c.message.includes('Matricule')).length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 11. Validation DALY SONDES — bulletin juin 2026
// ============================================================================
describe('Validation DALY SONDES juin 2026', () => {
  it('composants brut corrects', () => {
    const r = calculateSalary({
      salaire_brut: 592.928, situation_fam: 'C', nombre_enfants: 0,
      date_recrutement: '2020-01-01', mois: 6, annee: 2026,
    });
    expect(r.salaire_de_base).toBe(592.928);
    expect(r.ind_transport).toBe(95.002);
    expect(r.prime_presence).toBe(8.248);
    expect(r.taux_anciennete).toBe(10);
    expect(r.prime_anciennete).toBe(Math.round(592.928 * 10 / 100 * 1000) / 1000);
  });

  it('CNSS correct', () => {
    const r = calculateSalary({
      salaire_brut: 592.928, situation_fam: 'C', nombre_enfants: 0,
      date_recrutement: '2020-01-01', mois: 6, annee: 2026,
    });
    expect(r.cnss_salariale).toBe(Math.round(Math.min(r.salaire_brut, 5000) * 0.0968 * 1000) / 1000);
  });

  it('IRPP detail coherent', () => {
    const r = calculateSalary({
      salaire_brut: 592.928, situation_fam: 'C', nombre_enfants: 0,
      date_recrutement: '2020-01-01', mois: 6, annee: 2026,
    });
    expect(r.irpp_detail.length).toBeGreaterThan(0);
    const totalDetail = r.irpp_detail.reduce((s, t) => s + t.impot, 0);
    expect(totalDetail / 12).toBeCloseTo(r.irpp, 2);
  });
});

// ============================================================================
// 12. TOUS LES MOIS (1-8) et TOUS LES SALARIES — test d'integration
// ============================================================================
describe('Integration — tous les mois et tous les salaries', () => {
  // Donnees simulees pour tous les mois (8 mois, salaires representatifs)
  // Inclut: celibataire, marie, bas salaire, haut salaire, anciennete variable
  const testEmployees = [
    { matricule: '209070', nom: 'DALY', prenom: 'SONDES', situation_fam: 'C', nombre_enfants: 0, date_recrutement: '2020-01-01', salaire_brut: 592.928, nouveau_salaire_brut: 592.928 },
    { matricule: '209071', nom: 'ROUHI', prenom: 'Nabil', situation_fam: 'M', nombre_enfants: 2, date_recrutement: '2018-06-01', salaire_brut: 800, nouveau_salaire_brut: 800 },
    { matricule: '209072', nom: 'BACCOUCHE', prenom: 'Tahar', situation_fam: 'M', nombre_enfants: 3, date_recrutement: '2015-03-01', salaire_brut: 750, nouveau_salaire_brut: 750 },
    { matricule: '209073', nom: 'ZAYANI', prenom: 'Majed', situation_fam: 'C', nombre_enfants: 0, date_recrutement: '2022-09-01', salaire_brut: 650, nouveau_salaire_brut: 650 },
    { matricule: '209074', nom: 'BEN SLIMENE', prenom: 'Karim', situation_fam: 'M', nombre_enfants: 1, date_recrutement: '2010-01-01', salaire_brut: 400, nouveau_salaire_brut: 400 },
    { matricule: '209075', nom: 'AAMRI', prenom: 'Moatez', situation_fam: 'C', nombre_enfants: 0, date_recrutement: '2023-06-01', salaire_brut: 6008.771, nouveau_salaire_brut: 6008.771 },
  ];

  const mois = [1, 2, 3, 4, 5, 6, 7, 8];
  const annee = 2026;

  it.each(mois)('Mois %i — tous les salaries calculables sans erreur', (moisCourant) => {
    const results = new Map<string, SalaryResult>();
    const errors: string[] = [];

    for (const emp of testEmployees) {
      try {
        const r = calculateSalary({
          salaire_brut: emp.salaire_brut,
          situation_fam: emp.situation_fam,
          nombre_enfants: emp.nombre_enfants,
          date_recrutement: emp.date_recrutement,
          mois: moisCourant,
          annee,
        });
        results.set(emp.matricule, r);

        // Verifications de base
        expect(r.salaire_brut).toBeGreaterThanOrEqual(0);
        expect(r.cnss_salariale).toBeGreaterThanOrEqual(0);
        expect(r.irpp).toBeGreaterThanOrEqual(0);
        expect(r.css_salariale).toBeGreaterThanOrEqual(0);
        expect(r.salaire_net).toBeGreaterThanOrEqual(0);
        expect(r.net_a_payer).toBeGreaterThanOrEqual(0);

        // CNSS = 9.68% du brut plafonne 5000
        const expectedCNSS = Math.round(Math.min(r.salaire_brut, 5000) * 0.0968 * 1000) / 1000;
        expect(r.cnss_salariale).toBe(expectedCNSS);

        // CSS = 0.5% du revenu net imposable
        const expectedCSS = Math.round(r.revenu_net_imposable * 0.005 * 1000) / 1000;
        expect(r.css_salariale).toBe(expectedCSS);

        // Frais pro plafond 2000/an
        expect(r.frais_pro).toBeLessThanOrEqual(Math.round((2000 / 12) * 1000) / 1000);

        // IRPP detail coherent
        const totalDetail = r.irpp_detail.reduce((s, t) => s + t.impot, 0);
        expect(totalDetail / 12).toBeCloseTo(r.irpp, 2);

        // Net = brut - retenues
        const expectedNet = Math.round((r.salaire_brut - r.total_retenues) * 1000) / 1000;
        expect(r.salaire_net).toBe(expectedNet);

        // Transport et presence toujours > 0 en 2026
        expect(r.ind_transport).toBeGreaterThan(0);
        expect(r.prime_presence).toBeGreaterThan(0);

      } catch (e: any) {
        errors.push(`${emp.matricule} ${emp.nom}: ${e.message}`);
      }
    }

    expect(errors).toEqual([]);
    expect(results.size).toBe(testEmployees.length);
  });

  it.each(mois)('Mois %i — export Sage genere pour tous les salaries', (moisCourant) => {
    const results = new Map<string, SalaryResult>();
    for (const emp of testEmployees) {
      results.set(emp.matricule, calculateSalary({
        salaire_brut: emp.salaire_brut,
        situation_fam: emp.situation_fam,
        nombre_enfants: emp.nombre_enfants,
        date_recrutement: emp.date_recrutement,
        mois: moisCourant,
        annee,
      }));
    }

    const exportResult = generateSagePaieExport(testEmployees, [], results, moisCourant, annee, false);

    // Nombre de lignes = nb salaries x nb rubriques
    expect(exportResult.rows.length).toBeGreaterThan(0);
    expect(exportResult.summary.totalEmployees).toBe(testEmployees.length);

    // Periode correcte
    const periodeAttendue = `${String(moisCourant).padStart(2, '0')}/${annee}`;
    for (const row of exportResult.rows) {
      expect(row.periode).toBe(periodeAttendue);
    }

    // Tous les salaries ont au moins 4 rubriques (1000, 2100, 2200, 3100)
    for (const emp of testEmployees) {
      const empRows = exportResult.rows.filter(r => r.matricule === emp.matricule);
      const codes = empRows.map(r => r.code_rubrique);
      expect(codes).toContain('1000');
      expect(codes).toContain('3100');
      expect(codes).toContain('3310');
      expect(codes).toContain('3320');
    }
  });

  it.each(mois)('Mois %i — verification IA sans erreur critique', (moisCourant) => {
    const employees = testEmployees.map(e => ({
      ...e,
      echelon: '', categorie: '', badges: '', fonction: 'Ouvrier',
      adresse: '', type_contrat: 'CDI', duree: '', numero_cnss: '12345678',
      bq_ou_poste: '', rib_ou_ccp: 'TN5901234567890123456789',
      date_sortie: '',
    }));

    const results = new Map<string, SalaryResult>();
    for (const emp of testEmployees) {
      results.set(emp.matricule, calculateSalary({
        salaire_brut: emp.salaire_brut,
        situation_fam: emp.situation_fam,
        nombre_enfants: emp.nombre_enfants,
        date_recrutement: emp.date_recrutement,
        mois: moisCourant,
        annee,
      }));
    }

    const verification = verifySalaryCalculations(employees, [], results);

    // Pas d'erreurs critiques (sauf SMIG si salaire < 470.251)
    const criticalErrors = verification.checks.filter(c =>
      c.status === 'error' && !c.name.includes('SMIG') && !c.name.includes('Salaire < SMIG')
    );
    expect(criticalErrors).toEqual([]);

    // Tous les salaries verifies
    expect(verification.summary.verified).toBe(testEmployees.length);
  });
});

// ============================================================================
// 13. Revalorisation progressive sur 3 ans (2026-2028)
// ============================================================================
describe('Revalorisation progressive 2026-2028', () => {
  const base = 1000;

  it('2026 : base identique', () => {
    const r = calculateSalary({ salaire_brut: base, situation_fam: 'C', nombre_enfants: 0, mois: 6, annee: 2026 });
    expect(r.salaire_de_base).toBe(base);
  });

  it('2027 : base +5%', () => {
    const r = calculateSalary({ salaire_brut: base, situation_fam: 'C', nombre_enfants: 0, mois: 6, annee: 2027 });
    expect(r.salaire_de_base).toBe(Math.round(base * 1.05 * 1000) / 1000);
  });

  it('2028 : base +10.25% cumulatif', () => {
    const r = calculateSalary({ salaire_brut: base, situation_fam: 'C', nombre_enfants: 0, mois: 6, annee: 2028 });
    expect(r.salaire_de_base).toBe(Math.round(base * 1.05 * 1.05 * 1000) / 1000);
  });

  it('transport/presence utilisent valeurs BTP directement', () => {
    const r = calculateSalary({ salaire_brut: base, situation_fam: 'C', nombre_enfants: 0, mois: 6, annee: 2028 });
    // 2028 a des valeurs BTP : 104.740 transport, 9.094 présence
    expect(r.ind_transport).toBe(104.740);
    expect(r.prime_presence).toBe(9.094);
  });
});
