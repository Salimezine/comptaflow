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

// Barème IRPP mensuel 2026 (LF 2025) — 8 tranches
const IRPP_BRACKET = [
  { min: 0,    max: 200,   taux: 0.00 },
  { min: 200,  max: 400,   taux: 0.10 },
  { min: 400,  max: 600,   taux: 0.20 },
  { min: 600,  max: 800,   taux: 0.25 },
  { min: 800,  max: 1000,  taux: 0.30 },
  { min: 1000, max: 2000,  taux: 0.35 },
  { min: 2000, max: 5000,  taux: 0.38 },
  { min: 5000, max: Infinity, taux: 0.40 },
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

  // 2. Assiette CNSS (salaire brut, plafonné à 5000 DT)
  const assiette_cnss = Math.min(brut, PLAFOND_CNSS);

  // 3. CNSS salarié (9.68% sur assiette plafonnée)
  const cnss_salariale = Math.round(assiette_cnss * TAUX_CNSS_SALARIAL * 1000) / 1000;

  // 4. Revenu imposable (Brut - CNSS)
  const revenu_imposable = Math.max(0, brut - cnss_salariale);

  // 5. Frais professionnels (10% plafonné à 2000 DT/an = 166.67 DT/mois)
  const frais_pro_annuel = Math.min(revenu_imposable * 12 * 0.10, 2000);
  const frais_pro = Math.round((frais_pro_annuel / 12) * 1000) / 1000;

  // 6. Revenu net imposable
  const revenu_net_imposable = Math.max(0, revenu_imposable - frais_pro);

  // 7. Calcul IRPP (barème progressif)
  let irpp = 0;
  const irpp_detail: SalaryResult['irpp_detail'] = [];
  let remaining = revenu_net_imposable;

  for (const bracket of IRPP_BRACKET) {
    if (remaining <= 0) break;
    const tranche_size = bracket.max === Infinity ? remaining : bracket.max - bracket.min;
    const taxable = Math.min(remaining, tranche_size);
    const impot = Math.round(taxable * bracket.taux * 1000) / 1000;
    irpp += impot;
    irpp_detail.push({
      tranche: bracket.max === Infinity ? `>${bracket.min}` : `${bracket.min}-${bracket.max}`,
      taux: bracket.taux,
      montant: taxable,
      impot,
    });
    remaining -= taxable;
  }

  irpp = Math.round(irpp * 1000) / 1000;

  // 8. CSS (0.5% du revenu net imposable, si > 416.67 DT/mois = 5000 DT/an)
  const css_salariale = revenu_net_imposable > 416.67
    ? Math.round(revenu_net_imposable * TAUX_CSS * 1000) / 1000
    : 0;

  // 9. Charges patronales
  const cnss_patronale = Math.round(brut * TAUX_CNSS_PATRONAL * 1000) / 1000;
  const at_mp = Math.round(brut * TAUX_AT_MP * 1000) / 1000;
  const tfp = Math.round(brut * TAUX_TFP * 1000) / 1000;
  const foprolos = Math.round(brut * TAUX_FOPROLOS * 1000) / 1000;

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
  const salaire_net = Math.round((brut - total_retenues) * 1000) / 1000;

  // 13. Net à payer (salaire net + allocations familiales)
  const net_a_payer = Math.round((salaire_net + alloc_familiales) * 1000) / 1000;

  return {
    salaire_brut: brut,
    prime_anciennete: 0, // À calculer si besoin
    ind_transport: 0,    // À calculer si besoin

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
