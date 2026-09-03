/**
 * Calculateur de salaire tunisien — Code du Travail 2026
 * CNSS, IRPP, CSS, Allocations familiales
 */

export interface SalaryInput {
  salaire_brut: number;
  situation_fam: string; // M=Chef de famille, C=Célibataire, D=Divorcé, V=Veuf
  nombre_enfants: number; // Max 4 pour calcul
  absences_jours?: number; // Jours d'absence dans le mois
  heures_supplementaires?: number; // Nombre d'heures sup
  avances?: number; // Avances sur salaire
}

export interface SalaryResult {
  // Gains
  salaire_brut: number;
  heures_supplementaires: number;
  majoration_hs: number;
  prime_anciennete: number;
  ind_transport: number;

  // Assiette CNSS
  assiette_cnss: number;

  // Cotisations salariales
  cnss_salariale: number;     // 9.68% du brut (plafonné 5000 DT)
  css_salariale: number;      // 0.5% du revenu imposable

  // Revenu imposable
  revenu_imposable: number;   // Brut - CNSS
  frais_pro: number;          // 10% plafonné à 2000 DT/an (166.67 DT/mois)
  revenu_net_imposable: number;

  // IRPP (barème progressif 8 tranches)
  irpp: number;

  // Charges patronales
  cnss_patronale: number;     // 16.57%
  at_mp: number;              // 0.5% (accidents du travail)
  tfp: number;                // 1% (Taxe Formation Professionnelle)
  foprolos: number;           // 1% (Fonds de Promotion des Logements)

  // Calcul final
  total_retenues: number;
  salaire_net: number;
  net_a_payer: number;

  // Détail IRPP par tranche
  irpp_detail: { tranche: string; taux: number; montant: number; impot: number }[];
}

// Barème IRPP annuel 2026 (LF 2025 art. 36) — 8 tranches
// L'IRPP est calculé sur le revenu ANNUEL imposable
const IRPP_BRACKET_ANNUAL = [
  { min: 0,     max: 5000,   taux: 0.00 },
  { min: 5000,  max: 10000,  taux: 0.15 },
  { min: 10000, max: 20000,  taux: 0.25 },
  { min: 20000, max: 30000,  taux: 0.30 },
  { min: 30000, max: 40000,  taux: 0.33 },
  { min: 40000, max: 50000,  taux: 0.36 },
  { min: 50000, max: 70000,  taux: 0.38 },
  { min: 70000, max: Infinity, taux: 0.40 },
];

// Plafond CNSS salarié
const PLAFOND_CNSS = 5000; // DT/mois

// Taux CNSS
const TAUX_CNSS_SALARIAL = 0.0968; // 9.68%
const TAUX_CNSS_PATRONAL = 0.1657; // 16.57%
const TAUX_AT_MP = 0.005;          // 0.5%
const TAUX_TFP = 0.01;             // 1%
const TAUX_FOPROLOS = 0.01;        // 1%
const TAUX_CSS = 0.005;            // 0.5%

// Allocations familiales (mensuel)
const ALLOC_CHEF_FAMILLE = 25;     // 300 DT/an / 12
const ALLOC_ENFANT = 8.333;        // 100 DT/an / 12

// SMIG 2026
const SMIG_2026 = 480; // DT/mois

export function calculateSalary(input: SalaryInput): SalaryResult {
  const {
    salaire_brut,
    situation_fam,
    nombre_enfants,
    absences_jours = 0,
    heures_supplementaires = 0,
    avances = 0,
  } = input;

  // 1. Salaire brut (déjà fourni)
  const brut = Math.max(0, salaire_brut);

  // 2. Heures supplémentaires (Article 90 Code du Travail)
  // Régime 40h/semaine: 25% majoration jusqu'à 48h, 50% au-delà
  const heures_par_mois = (40 * 52) / 12; // = 173.33h/mois pour régime 40h
  const taux_horaire = brut / heures_par_mois;

  // Calcul heures sup: jusqu'à 8h/semaine = 25%, au-delà = 50%
  const hs_25 = Math.min(heures_supplementaires, 8 * 4.33); // ~34.64h/mois max à 25%
  const hs_50 = Math.max(0, heures_supplementaires - hs_25);
  const majoration_hs = Math.round((taux_horaire * hs_25 * 0.25 + taux_horaire * hs_50 * 0.50) * 1000) / 1000;

  // Salaire brut total incluant heures sup
  const brut_total = Math.round((brut + majoration_hs) * 1000) / 1000;

  // 3. Assiette CNSS (salaire brut total, plafonné à 5000 DT)
  const assiette_cnss = Math.min(brut_total, PLAFOND_CNSS);

  // 3. CNSS salarié (9.68% sur assiette plafonnée)
  const cnss_salariale = Math.round(assiette_cnss * TAUX_CNSS_SALARIAL * 1000) / 1000;

  // 4. Revenu imposable (Brut total - CNSS)
  const revenu_imposable = Math.max(0, brut_total - cnss_salariale);

  // 5. Frais professionnels (10% plafonné à 2000 DT/an = 166.67 DT/mois)
  const frais_pro_annuel = Math.min(revenu_imposable * 12 * 0.10, 2000);
  const frais_pro = Math.round((frais_pro_annuel / 12) * 1000) / 1000;

  // 6. Revenu net imposable
  const revenu_net_imposable = Math.max(0, revenu_imposable - frais_pro);

  // 7. Calcul IRPP (barème progressif ANNUEL)
  // L'IRPP est calculé sur le revenu annuel imposable, puis divisé par 12
  const revenu_annuel_imposable = revenu_net_imposable * 12;
  let irpp_annuel = 0;
  const irpp_detail: SalaryResult['irpp_detail'] = [];
  let remaining_annuel = revenu_annuel_imposable;

  for (const bracket of IRPP_BRACKET_ANNUAL) {
    if (remaining_annuel <= 0) break;
    const tranche_size = bracket.max === Infinity ? remaining_annuel : bracket.max - bracket.min;
    const taxable = Math.min(remaining_annuel, tranche_size);
    const impot = Math.round(taxable * bracket.taux * 1000) / 1000;
    irpp_annuel += impot;
    irpp_detail.push({
      tranche: bracket.max === Infinity ? `>${bracket.min}` : `${bracket.min}-${bracket.max}`,
      taux: bracket.taux,
      montant: taxable,
      impot,
    });
    remaining_annuel -= taxable;
  }

  // IRPP mensuel = IRPP annuel / 12
  const irpp = Math.round((irpp_annuel / 12) * 1000) / 1000;

  // 8. CSS (0.5% du revenu net imposable, si > 416.67 DT/mois = 5000 DT/an)
  // CSS is calculated on revenu_net_imposable (after frais pro)
  const css_salariale = Math.round(revenu_net_imposable * TAUX_CSS * 1000) / 1000;

  // 9. Charges patronales (sur brut total incluant heures sup)
  const cnss_patronale = Math.round(brut_total * TAUX_CNSS_PATRONAL * 1000) / 1000;
  const at_mp = Math.round(brut_total * TAUX_AT_MP * 1000) / 1000;
  const tfp = Math.round(brut_total * TAUX_TFP * 1000) / 1000;
  const foprolos = Math.round(brut_total * TAUX_FOPROLOS * 1000) / 1000;

  // 10. Allocations familiales (crédit sur bulletin)
  let alloc_familiales = 0;
  if (situation_fam === 'M') {
    alloc_familiales += ALLOC_CHEF_FAMILLE;
    alloc_familiales += Math.min(nombre_enfants, 4) * ALLOC_ENFANT;
  }
  alloc_familiales = Math.round(alloc_familiales * 1000) / 1000;

  // 11. Total retenues
  const total_retenues = Math.round((cnss_salariale + irpp + css_salariale + avances) * 1000) / 1000;

  // 12. Salaire net
  const salaire_net = Math.round((brut_total - total_retenues) * 1000) / 1000;

  // 13. Net à payer (salaire net + allocations familiales)
  const net_a_payer = Math.round((salaire_net + alloc_familiales) * 1000) / 1000;

  return {
    salaire_brut: brut,
    heures_supplementaires,
    majoration_hs,
    prime_anciennete: 0,
    ind_transport: 0,

    assiette_cnss,
    cnss_salariale,
    css_salariale,

    revenu_imposable,
    frais_pro,
    revenu_net_imposable,

    irpp,

    cnss_patronale,
    at_mp,
    tfp,
    foprolos,

    total_retenues,
    salaire_net,
    net_a_payer,

    irpp_detail,
  };
}

/**
 * Génère les lignes de variables Sage Paie 100 pour un salarié
 * Basé sur les rubriques standards Sage Paie
 */
export function generateSageVariables(
  matricule: string,
  result: SalaryInput,
  calculated: SalaryResult
): { rubrique: string; zone: string; valeur: number }[] {
  const vars: { rubrique: string; zone: string; valeur: number }[] = [];

  // Salaire de base
  vars.push({ rubrique: 'SBASE', zone: '1', valeur: calculated.salaire_brut });

  // CNSS salarié
  if (calculated.cnss_salariale > 0) {
    vars.push({ rubrique: 'CSSAL', zone: '3', valeur: calculated.cnss_salariale });
  }

  // IRPP
  if (calculated.irpp > 0) {
    vars.push({ rubrique: 'IRPP', zone: '3', valeur: calculated.irpp });
  }

  // CSS
  if (calculated.css_salariale > 0) {
    vars.push({ rubrique: 'CSS', zone: '3', valeur: calculated.css_salariale });
  }

  // Avances
  if (result.avances && result.avances > 0) {
    vars.push({ rubrique: 'AVANCE', zone: '3', valeur: result.avances });
  }

  // Allocations familiales (si marié avec enfants)
  if (calculated.net_a_payer > calculated.salaire_net) {
    const alloc = calculated.net_a_payer - calculated.salaire_net;
    vars.push({ rubrique: 'ALLOCFAM', zone: '5', valeur: alloc });
  }

  return vars;
}
