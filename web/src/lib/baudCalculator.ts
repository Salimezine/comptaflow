/**
 * Calculateur de salaire tunisien — Code du Travail 2026
 * CNSS, IRPP, CSS, Allocations familiales
 * Prime ancienneté (barème configurable) + Revalorisation légale décret 68/2026
 *
 * Ordre de calcul (sans dépendance circulaire):
 *   salaire_de_base
 *   → revalorisation légale (+5%/an sur base, transport, présence pour 2026-2028)
 *   → prime_ancienneté (sur base revalorisée)
 *   → primes légales (panier, savon, douche, nuit, logement, lait)
 *   → salaire_brut_total = base_rév + HS + prime_ancienneté + transport_rév + présence_rév + primes_légales
 *   → assiettes CNSS (brut - lait) / IRPP / CSS sur salaire_brut_total
 */

export interface SalaryInput {
  salaire_brut: number;
  situation_fam: string; // M=Chef de famille, C=Célibataire, D=Divorcé, V=Veuf
  nombre_enfants: number; // Max 4 pour calcul
  absences_jours?: number; // Jours d'absence dans le mois
  heures_supplementaires?: number; // Nombre d'heures sup
  avances?: number; // Avances sur salaire
  // Nouveaux champs pour prime ancienneté et revalorisation
  date_recrutement?: string; // Date d'embauche (Excel serial ou YYYY-MM-DD)
  mois?: number; // Mois du bulletin (1-12)
  annee?: number; // Année du bulletin
  ind_transport?: number; // Indemnité de transport conventionnelle (mensuel)
  prime_presence?: number; // Prime de présence conventionnelle (mensuel)
  // Primes légales ( valeurs par défaut configurable, ajustables par employé)
  prime_nuit?: number; // Prime de nuit (variable par employé)
  prime_logement?: number; // Prime de logement (variable par employé)
  // Augmentation étatique (Décret 68/2026, +5%/an)
  // Montant saisi manuellement dans Sage Paie — pas de formule automatique
  // Incluse dans le brut total et l'assiette CNSS (confirmé bulletin Sage)
  augmentation?: number; // Montant de l'augmentation 2025 (rubrique 4100)
}

export interface SalaryResult {
  // Gains
  salaire_de_base: number;        // Salaire de base (avant HS, primes)
  salaire_brut: number;           // Salaire brut total (base + HS + primes + transport + présence + primes légales)
  heures_supplementaires: number;
  majoration_hs: number;
  prime_anciennete: number;       // Montant de la prime d'ancienneté
  taux_anciennete: number;        // Taux applicable (en %)
  anciennete_annees: number;      // Nombre d'années d'ancienneté
  ind_transport: number;          // Indemnité de transport (après revalorisation si applicable)
  prime_presence: number;         // Prime de présence (après revalorisation si applicable)

  // Primes légales (Convention BTP)
  prime_panier: number;           // Prime de panier légale (0.800 DT/jour, configurable)
  prime_douche: number;           // Prime de douche (0.600 DT/semaine, configurable)
  prime_savon: number;            // Prime de savon (exclue CNSS, configurable)
  prime_nuit: number;             // Prime de nuit (variable par employé)
  prime_logement: number;         // Prime de logement (variable par employé)
  prime_lait: number;             // Prime de lait (exclue CNSS, configurable)
  mit: number;                    // MIT = 60.61% × prime_presence
  augmentation: number;           // Augmentation 2025 — montant saisi manuellement (4100)

  // Assiette CNSS
  assiette_cnss: number;

  // Cotisations salariales
  cnss_salariale: number;     // 9.68% du brut (plafonné 5000 DT, excluant lait)
  css_salariale: number;      // 0.5% du revenu imposable

  // Revenu imposable
  revenu_imposable: number;   // Brut total - CNSS
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

// SMIG 2026 — Décret n°2026-67 du 30 avril 2026, JORT n°44
// Régime 40h/semaine: 470,251 DT/mois | Régime 48h: 554,736 DT/mois
// On utilise le régime 40h comme base (régime BTP standard)
const SMIG_2026 = 470.251; // DT/mois — régime 40h/semaine

// Barème prime d'ancienneté — Barème générique tunisien (pas de convention BTP spécifique)
// Source: usage courant en Tunisie, non défini par la convention collective BTP
// Configurable via config.json → prime_anciennete.bareme
const BAREME_ANCIENNETE_DEFAULT = [
  { min_years: 0, taux: 0 },     // < 3 ans: pas de prime
  { min_years: 3, taux: 5 },     // 3-6 ans: 5%
  { min_years: 6, taux: 10 },    // 6-9 ans: 10%
  { min_years: 9, taux: 15 },    // ≥ 9 ans: 15% (plafond)
];

// Revalorisation légale — Décret n°68 du 30 avril 2026 (JORT n°44)
// +5% par an (cumulatif) sur salaires de base, indemnités de transport et de présence
// pour les secteurs non agricoles soumis à des conventions collectives sectorielles
// Application: 2026, 2027, 2028 (calculé sur les montants revalorisés de l'année précédente)
// Exception: entreprises ayant déjà accordé des augmentations équivalentes ou supérieures
const REVALORISATION_TAUX = 0.05; // +5% par an

/**
 * Indemnité de transport — Convention BTP Tunisie
 * Source: paie-tunisie.com — NON VÉRIFIÉ sur texte officiel JORT
 * Les montants ci-dessous sont issus du site paie-tunisie.com (référence Tunisie paie)
 * et suivent la progression ~5%/an cohérente avec le décret n°68/2026.
 * Vérifier sur le texte officiel JORT si un contrôle CNSS/inspection du travail est prévu.
 */
const BTP_TRANSPORT: Record<number, number> = {
  2021: 79.399,
  2023: 84.758,
  2024: 90.479,
  2026: 95.002,  // paie-tunisie.com, non vérifié sur texte officiel JORT
  2027: 99.753,  // paie-tunisie.com, non vérifié sur texte officiel JORT
  2028: 104.740, // paie-tunisie.com, non vérifié sur texte officiel JORT
};

/**
 * Prime de présence — Convention BTP Tunisie
 * Source: paie-tunisie.com — NON VÉRIFIÉ sur texte officiel JORT
 * Même observation que pour le transport: progression ~5%/an
 */
const BTP_PRESENCE: Record<number, number> = {
  2021: 6.894,
  2023: 7.359,
  2024: 7.856,
  2026: 8.248,   // paie-tunisie.com, non vérifié sur texte officiel JORT
  2027: 8.661,   // paie-tunisie.com, non vérifié sur texte officiel JORT
  2028: 9.094,   // paie-tunisie.com, non vérifié sur texte officiel JORT
};

// ============================================================================
// PRIMES LÉGALES — Convention BTP Tunisie + Décret n°2003-1098
// ============================================================================
// Source: paie-tunisie.com/387/fr/55/publications/batiment-et-travaux-publics
//
// Montants mensuels de référence (configurables via config.json → primes_légales)
// Ordre de calcul: les primes légales s'ajoutent au brut AVANT le calcul CNSS/IRPP/CSS
//
// Exclusion CNSS: le lait (4385) et le savon (3801) sont exclus de l'assiette CNSS
// selon Décret n°2003-1098 du 19 mai 2003, Article 11:
// "Le lait, le savon et autres produits accordés aux employés dans le cadre de la
//  préservation de la santé et de la sécurité au travail ou leur contre-valeur en espèces."
// ============================================================================

// Prime de panier légale — Convention BTP
// Convention: 800M/jour sous condition 7h+ continues, pauses < 1h
// Montant bulletin: ~12 DT/mois (variable légèrement par employé, prorata jours travaillés)
const PRIME_PANIER_JOUR = 0.800; // DT/jour — configurable

// Prime de douche — Convention BTP
// Convention: 600M/semaine pour travailleurs en lieux sans douches ou en déplacement
// Montant bulletin: ~24 DT/mois (variable légèrement)
const PRIME_DOUCHE_SEMAINE = 0.600; // DT/semaine — configurable
const SEMAINES_PAR_MOIS = 4.333;    // 52 semaines / 12 mois

// Prime de savon — Exclue de l'assiette CNSS (Décret 2003-1098, art. 11)
// Montant bulletin: ~5.3 DT/mois (variable légèrement)
const PRIME_SAVON = 5.300; // DT/mois — configurable

// Prime de lait — Exclue de l'assiette CNSS (Décret 2003-1098, art. 11)
// Montant bulletin: ~29 DT/mois (variable légèrement)
const PRIME_LAIT = 29.000; // DT/mois — configurable

// MIT — Contribution Maladie, Invalidité, Tuberculose
// Calculé sur la prime de présence (2200)
// Taux confirmé par bulletin: 60.61% × prime_presence
const MIT_TAUX = 0.6061;

/**
 * Convertit une date (Excel serial ou YYYY-MM-DD) en objet Date
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try YYYY-MM-DD format
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // Try Excel serial number
  const serial = parseFloat(dateStr);
  if (!isNaN(serial) && serial > 25000 && serial < 50000) {
    // Excel date serial: days since 1900-01-01 (with leap year bug)
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + serial * 86400000);
  }

  // Try DD/MM/YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    return new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
  }

  return null;
}

/**
 * Calcule l'ancienneté en années à partir de la date de recrutement
 * @param dateRecrutement Date d'embauche (string)
 * @param mois Mois du bulletin (1-12)
 * @param annee Année du bulletin
 * @returns Nombre d'années d'ancienneté (arrondi au.floor)
 */
export function calculateAnciennete(dateRecrutement: string, mois: number, annee: number): number {
  const dateEmbauche = parseDate(dateRecrutement);
  if (!dateEmbauche) return 0;

  const dateBulletin = new Date(annee, mois - 1, 1);
  let anciennete = dateBulletin.getFullYear() - dateEmbauche.getFullYear();
  const monthDiff = dateBulletin.getMonth() - dateEmbauche.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && dateBulletin.getDate() < dateEmbauche.getDate())) {
    anciennete--;
  }

  return Math.max(0, anciennete);
}

/**
 * Détermine le taux de prime d'ancienneté selon le barème
 * @param ancienneteAnnees Nombre d'années d'ancienneté
 * @param bareme Barème configurable (tableau de {min_years, taux})
 * @returns Taux en pourcentage (ex: 5 pour 5%)
 */
export function getTauxAnciennete(ancienneteAnnees: number, bareme?: { min_years: number; taux: number }[]): number {
  const b = bareme || BAREME_ANCIENNETE_DEFAULT;
  let taux = 0;
  for (const palier of b) {
    if (ancienneteAnnees >= palier.min_years) {
      taux = palier.taux;
    }
  }
  return taux;
}

/**
 * Applique la revalorisation légale (+5%/an) sur une valeur pour une année donnée
 * Le décret 68/2026 prévoit une revalorisation cumulative: chaque année est calculée
 * sur les montants revalorisés de l'année précédente.
 * @param valeur Montant de base
 * @param anneeAnnée du bulletin
 * @param anneeBase Année de référence (2026 = pas de revalorisation)
 * @returns Montant revalorisé
 */
export function applyRevalorisation(valeur: number, annee: number, anneeBase: number = 2026): number {
  if (annee <= anneeBase) return valeur;
  const nbAnnees = annee - anneeBase;
  // Application cumulative: valeur × (1.05)^n
  return Math.round(valeur * Math.pow(1 + REVALORISATION_TAUX, nbAnnees) * 1000) / 1000;
}

export function calculateSalary(input: SalaryInput): SalaryResult {
  const {
    salaire_brut: salaire_de_base_input,
    situation_fam,
    nombre_enfants,
    absences_jours = 0,
    heures_supplementaires = 0,
    avances = 0,
    date_recrutement = '',
    mois = 1,
    annee = 2026,
    ind_transport: ind_transport_input,
    prime_presence: prime_presence_input,
    prime_nuit: prime_nuit_input = 0,
    prime_logement: prime_logement_input = 0,
    augmentation: augmentation_input = 0,
  } = input;

  // 1. Salaire de base (avant toute prime ou revalorisation)
  const salaire_de_base = Math.max(0, salaire_de_base_input);

  // 2. Indemnité de transport et prime de présence
  //    Les valeurs BTP pour chaque année incluent déjà la progression conventionnelle (~5%/an).
  //    Pas de revalorisation supplémentaire sur transport/présence si une valeur BTP existe
  //    pour l'année demandée — sinon appliquer revalorisation sur la base 2026.
  const ind_transport_base = ind_transport_input !== undefined
    ? ind_transport_input
    : (BTP_TRANSPORT[annee] || applyRevalorisation(BTP_TRANSPORT[2026] || 0, annee));
  const prime_presence_base = prime_presence_input !== undefined
    ? prime_presence_input
    : (BTP_PRESENCE[annee] || applyRevalorisation(BTP_PRESENCE[2026] || 0, annee));

  // 3. Application de la revalorisation légale (+5%/an pour 2026-2028)
  //    Revalorisation sur le salaire de base UNIQUEMENT (transport/présence gérés ci-dessus)
  //    Déc. n68/2026 : +5%/an cumulatif sur salaire de base, transport, présence
  //    Les valeurs BTP pour 2027/2028 intègrent déjà cette revalorisation
  const salaire_base_reval = applyRevalorisation(salaire_de_base, annee);

  // 4. Prime d'ancienneté (sur base REVALORISÉE, pas sur l'origine)
  //    L'ancienneté en années est indépendante du montant (pas de circularité)
  const ancienneteAnnees = date_recrutement
    ? calculateAnciennete(date_recrutement, mois, annee)
    : 0;
  const tauxAnciennete = getTauxAnciennete(ancienneteAnnees);
  const prime_anciennete = Math.round(salaire_base_reval * tauxAnciennete / 100 * 1000) / 1000;

  // 5. Heures supplémentaires (Article 90 Code du Travail)
  //    Calculées sur le taux horaire du salaire de base (avant revalorisation)
  const heures_par_mois = (40 * 52) / 12; // = 173.33h/mois pour régime 40h
  const taux_horaire = salaire_de_base / heures_par_mois;

  // Calcul heures sup: jusqu'à 8h/semaine = 25%, au-delà = 50%
  const hs_25 = Math.min(heures_supplementaires, 8 * 4.33); // ~34.64h/mois max à 25%
  const hs_50 = Math.max(0, heures_supplementaires - hs_25);
  const majoration_hs = Math.round((taux_horaire * hs_25 * 0.25 + taux_horaire * hs_50 * 0.50) * 1000) / 1000;

  // 6. Primes légales — Convention BTP
  //    Panier: 0.800 DT/jour (sous condition 7h+ continues)
  //    Douche: 0.600 DT/semaine (lieux sans douches ou déplacement)
  //    Savon: montant fixe (exclue CNSS — Décret 2003-1098 art. 11)
  //    Lait: montant fixe (exclue CNSS — Décret 2003-1098 art. 11)
  //    Nuit: variable par employé (input)
  //    Logement: variable par employé (input)
  //    Augmentation: montant saisi manuellement (input) — Décret 68/2026
  const jours_travailles = Math.max(0, 26 - absences_jours); // ~26 jours/mois ouvrier BTP
  const prime_panier = Math.round(PRIME_PANIER_JOUR * jours_travailles * 1000) / 1000;
  const prime_douche = Math.round(PRIME_DOUCHE_SEMAINE * SEMAINES_PAR_MOIS * 1000) / 1000;
  const prime_savon = PRIME_SAVON;
  const prime_lait = PRIME_LAIT;
  const prime_nuit = Math.max(0, prime_nuit_input);
  const prime_logement = Math.max(0, prime_logement_input);
  const augmentation = Math.max(0, augmentation_input);

  // 7. MIT — 60.61% de la prime de présence (confirmé par bulletin Sage Paie)
  const mit = Math.round(prime_presence_base * MIT_TAUX * 1000) / 1000;

  // 8. Salaire brut total = base rév + HS + prime ancienneté + transport + présence + primes légales + augmentation
  //    Confirmation bulletin Sage:
  //    - Le Total Brut EXCLUT la nuit (3802), les HS (4113), et le rappel (5100)
  //    - L'augmentation (4100) est INCLUSE dans le Total Brut
  //    - La nuit (3802) est un gain séparé, soumis à CNSS mais pas dans le Total Brut
  const salaire_brut = Math.round((
    salaire_base_reval + majoration_hs + prime_anciennete
    + ind_transport_base + prime_presence_base
    + prime_panier + prime_douche + prime_savon + prime_lait + prime_logement
    + augmentation
  ) * 1000) / 1000;

  // 9. Assiette CNSS = Total Brut - prime_lait (exclue par Décret 2003-1098 art. 11)
  //    Confirmation bulletin Sage:
  //    - Le Total Brut EXCLUT nuit (3802), HS (4113), rappel (5100)
  //    - L'augmentation (4100) est INCLUSE dans l'assiette CNSS
  //    - Le plafond 5000 DT peut ne pas être appliqué pour certaines entreprises
  //    - Le savon est aussi exclu en théorie mais le bulletin ne le soustrait pas toujours
  const assiette_cnss = Math.min(Math.max(0, salaire_brut - prime_lait), PLAFOND_CNSS);

  // 10. CNSS salarié (9.68% sur assiette plafonnée, excluant lait)
  const cnss_salariale = Math.round(assiette_cnss * TAUX_CNSS_SALARIAL * 1000) / 1000;

  // 9. Revenu imposable (Brut total - CNSS)
  const revenu_imposable = Math.max(0, salaire_brut - cnss_salariale);

  // 10. Frais professionnels (10% plafonné à 2000 DT/an = 166.67 DT/mois)
  const frais_pro_annuel = Math.min(revenu_imposable * 12 * 0.10, 2000);
  const frais_pro = Math.round((frais_pro_annuel / 12) * 1000) / 1000;

  // 11. Revenu net imposable
  const revenu_net_imposable = Math.max(0, revenu_imposable - frais_pro);

  // 12. Calcul IRPP (barème progressif ANNUEL)
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

  // 13. CSS (0.5% du revenu net imposable)
  const css_salariale = Math.round(revenu_net_imposable * TAUX_CSS * 1000) / 1000;

  // 14. Charges patronales (sur brut total incluant heures sup)
  const cnss_patronale = Math.round(salaire_brut * TAUX_CNSS_PATRONAL * 1000) / 1000;
  const at_mp = Math.round(salaire_brut * TAUX_AT_MP * 1000) / 1000;
  const tfp = Math.round(salaire_brut * TAUX_TFP * 1000) / 1000;
  const foprolos = Math.round(salaire_brut * TAUX_FOPROLOS * 1000) / 1000;

  // 15. Allocations familiales (crédit sur bulletin)
  let alloc_familiales = 0;
  if (situation_fam === 'M') {
    alloc_familiales += ALLOC_CHEF_FAMILLE;
    alloc_familiales += Math.min(nombre_enfants, 4) * ALLOC_ENFANT;
  }
  alloc_familiales = Math.round(alloc_familiales * 1000) / 1000;

  // 16. Total retenues
  const total_retenues = Math.round((cnss_salariale + irpp + css_salariale + avances) * 1000) / 1000;

  // 17. Salaire net
  const salaire_net = Math.round((salaire_brut - total_retenues) * 1000) / 1000;

  // 18. Net à payer (salaire net + allocations familiales)
  const net_a_payer = Math.round((salaire_net + alloc_familiales) * 1000) / 1000;

  return {
    salaire_de_base: salaire_base_reval,
    salaire_brut,
    heures_supplementaires,
    majoration_hs,
    prime_anciennete,
    taux_anciennete: tauxAnciennete,
    anciennete_annees: ancienneteAnnees,
    ind_transport: ind_transport_base,
    prime_presence: prime_presence_base,

    // Primes légales
    prime_panier,
    prime_douche,
    prime_savon,
    prime_nuit,
    prime_logement,
    prime_lait,
    mit,
    augmentation,

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

// ============================================================================
// RUBRIQUES SAGE PAIE 100 — Format d'importation "long" (1 ligne / salarié / rubrique)
// ============================================================================
// Structure de colonnes Excel attendue par Sage Paie 100 :
//   Matricule | Code Rubrique | Libellé | Valeur | Période
//
// ATTENTION : ces codes (1000, 2100, 2200, 4113, 4101) sont des codes standards
// Sage Paie. Vérifier le "format d'importation" configuré dans Sage Paie de
// l'entreprise (Menu Modules → Importation des données → format existant) avant
// toute utilisation en production. Les codes internes peuvent différer d'une
// installation à l'autre.
// ============================================================================

export interface SageRubrique {
  code: string;       // Code rubrique Sage (ex: "1000")
  libelle: string;    // Libellé lisible
  zone: string;       // Zone Sage (1=gain, 3=retenue, 5=crédit)
  type: 'gain' | 'retenue' | 'credit';
}

/**
 * Rubriques Sage Paie 100 confirmées pour l'export BAUD.
 *
 * Base légale de chaque rubrique documentée ci-dessous.
 */
export const SAGE_RUBRIQUES: Record<string, SageRubrique> = {
  // --- GAINS ---
  // Rubrique 1000 : Salaire de base
  // Base légale : contrat de travail individuel
  // Revalorisé selon Décret n°68/2026 (JORT n°44, 30/04/2026) : +5%/an cumulatif
  '1000': { code: '1000', libelle: 'SALAIRE DE BASE', zone: '1', type: 'gain' },

  // Rubrique 1100 : Salaire de base complémentaire (individuel)
  '1100': { code: '1100', libelle: 'SBASE COMPLEMENT', zone: '1', type: 'gain' },

  // Rubrique 2100 : Indemnité de transport
  // Base légale : Convention collective BTP tunisienne
  // Montant de référence 2026 : 95.002 DT/mois (source: paie-tunisie.com, non vérifié JORT)
  // Revalorisé selon Décret n°68/2026 : +5%/an cumulatif
  '2100': { code: '2100', libelle: 'IND TRANSPORT', zone: '1', type: 'gain' },

  // Rubrique 2200 : Indemnité de présence
  // Base légale : Convention collective BTP tunisienne
  // Montant de référence 2026 : 8.248 DT/mois (source: paie-tunisie.com, non vérifié JORT)
  // Revalorisé selon Décret n°68/2026 : +5%/an cumulatif
  '2200': { code: '2200', libelle: 'IND PRESENCE', zone: '1', type: 'gain' },

  // Rubrique 2202 : MIT — Contribution Maladie, Invalidité, Tuberculose
  // Calculé sur la prime de présence : 60.61% × prime_presence
  // Confirmé par bulletin Sage Paie
  '2202': { code: '2202', libelle: 'MIT', zone: '1', type: 'gain' },

  // Rubrique 2330 : Prime de panier légale
  // Base légale : Convention BTP — 800M/jour (sous condition 7h+ continues, pauses < 1h)
  // Montant bulletin : ~12 DT/mois (variable légèrement par employé)
  '2330': { code: '2330', libelle: 'PRIME PANIER', zone: '1', type: 'gain' },

  // Rubrique 3210 : Prime de douche
  // Base légale : Convention BTP — 600M/semaine (lieux sans douches ou déplacement)
  // Montant bulletin : ~24 DT/mois (variable légèrement)
  '3210': { code: '3210', libelle: 'PRIME DOUCHE', zone: '1', type: 'gain' },

  // Rubrique 3801 : Prime de savon
  // Exclue de l'assiette CNSS — Décret n°2003-1098 du 19/05/2003, Article 11
  // Montant bulletin : ~5.3 DT/mois (variable légèrement)
  '3801': { code: '3801', libelle: 'PRIME SAVON', zone: '1', type: 'gain' },

  // Rubrique 3802 : Prime de nuit
  // Variable par employé (travail de nuit ou déplacement)
  '3802': { code: '3802', libelle: 'PRIME NUIT', zone: '1', type: 'gain' },

  // Rubrique 4100 : Augmentation 2025 (revalorisation 5% — Décret n°68/2026)
  // Appliquée rétroactivement au 01/01/2026
  '4100': { code: '4100', libelle: 'AUGMENTATION 2025', zone: '1', type: 'gain' },

  // Rubrique 4101 : Augmentation individuelle 2026
  // Montant individuel négocié, PAS calculé automatiquement
  // À ne pas confondre avec la prime d'ancienneté
  '4101': { code: '4101', libelle: 'AUGMENTATION 2026', zone: '1', type: 'gain' },

  // Rubrique 4113 : Heures supplémentaires 100%
  // Base légale : Code du travail, article 90
  // Majoration 25% jusqu'à 8h/semaine, 50% au-delà
  '4113': { code: '4113', libelle: 'HEURES SUP 100%', zone: '1', type: 'gain' },

  // Rubrique 4120 : Prime d'ancienneté (DÉSACTIVÉE PAR DÉFAUT)
  // Base légale : Code du travail, article 135 (loi n°66-27 du 30/04/1966)
  // Barème générique (aucun texte BTP spécifique trouvé) :
  //   < 3 ans: 0% | 3-6 ans: 5% | 6-9 ans: 10% | ≥ 9 ans: 15%
  // IMPORTANT : ce barème n'est PAS un texte légal obligatoire pour le BTP.
  // À ajuster si un avenant BTP est trouvé. Désactivé par défaut car représente
  // un nouveau coût absent de la paie actuelle de l'entreprise.
  '4120': { code: '4120', libelle: 'PRIME ANCIENNETE', zone: '1', type: 'gain' },

  // Rubrique 4383 : Prime de logement
  // Variable par employé (montant fixe mensuel)
  '4383': { code: '4383', libelle: 'PRIME LOGEMENT', zone: '1', type: 'gain' },

  // Rubrique 4385 : Prime de lait
  // Exclue de l'assiette CNSS — Décret n°2003-1098 du 19/05/2003, Article 11
  // Montant bulletin : ~29 DT/mois (variable légèrement)
  '4385': { code: '4385', libelle: 'PRIME LAIT', zone: '1', type: 'gain' },

  // --- RETENUES ---
  // Rubrique 3100 : CNSS salarié (part salariale)
  // Base légale : Loi n°73-40 du 24/07/1973 modifiée
  // Taux : 9.68% du salaire brut, plafonné à 5000 DT/mois
  // Assiette = brut - prime_lait (exclue CNSS — Décret 2003-1098 art. 11)
  '3100': { code: '3100', libelle: 'CNSS SALARIALE', zone: '3', type: 'retenue' },

  // Rubrique 3310 : IRPP
  // Base légale : Loi n°74-9 du 20/03/1974 modifiée, barème LF 2025 art. 36
  // Calcul annuel : revenu_net_imposable × 12 → barème 8 tranches → / 12
  '3310': { code: '3310', libelle: 'IRPP', zone: '3', type: 'retenue' },

  // Rubrique 3320 : CSS (Cotisation de Solidarité Sociale)
  // Base légale : Loi n°92-73 du 28/07/1992
  // Taux : 0.5% du revenu net imposable (après frais professionnels)
  '3320': { code: '3320', libelle: 'CSS', zone: '3', type: 'retenue' },

  // --- CRÉDITS ---
  // Rubrique 5100 : Allocations familiales
  // Base légale : Loi n°82-26 du 12/04/1982
  // Chef de famille: 25 DT/mois + 8.333 DT/mois par enfant (max 4)
  '5100': { code: '5100', libelle: 'ALLOC FAMILIALES', zone: '5', type: 'credit' },
};

export interface SageExportRow {
  matricule: string;
  code_rubrique: string;
  libelle: string;
  valeur: number;
  periode: string; // format "MM/YYYY"
}

export interface ControlReportItem {
  matricule: string;
  nom: string;
  prenom: string;
  type: 'ok' | 'warning' | 'error';
  message: string;
  detail?: string;
}

export interface SageExportResult {
  rows: SageExportRow[];
  controlReport: ControlReportItem[];
  smigViolations: { matricule: string; nom: string; brut: number; smig: number }[];
  summary: {
    totalRows: number;
    totalEmployees: number;
    rubriquesGenerated: string[];
    smigViolations: number;
    warnings: number;
    errors: number;
  };
}

/**
 * SMIG 2026 — Décret n°2026-67 du 30 avril 2026, JORT n°44
 * Régime 40h/semaine: 470,251 DT/mois | Régime 48h: 554,736 DT/mois
 * Régime BTP standard = 40h/semaine
 */
const SMIG_REGIME_40H: Record<number, number> = {
  2026: 470.251,
  2027: 493.304,
  2028: 517.571,
};

/**
 * Génère le fichier d'importation Sage Paie 100 (format "long").
 *
 * Structure : une ligne par salarié par rubrique.
 * Format de colonnes attendu par Sage :
 *   Matricule | Code Rubrique | Libellé | Valeur | Période
 *
 * Rubriques générées :
 *   - 1000 : Salaire de base (après revalorisation décret 68/2026)
 *   - 2100 : Indemnité de transport (après revalorisation)
 *   - 2200 : Indemnité de présence (après revalorisation)
 *   - 4113 : Heures supplémentaires (si > 0)
 *   - 4120 : Prime d'ancienneté (SEULEMENT si prime_anciennete.enabled = true)
 *   - 3100 : CNSS salarié
 *   - 3310 : IRPP
 *   - 3320 : CSS
 *   - 5100 : Allocations familiales (si marié + enfants)
 *
 * @param employees Liste des employés (depuis le parser Excel)
 * @param pointage Données de pointage
 * @param salaryResults Résultats des calculs de salaire
 * @param mois Mois du bulletin (1-12)
 * @param annee Année du bulletin
 * @param primeAncienneteEnabled Flag global : activer la prime d'ancienneté (default: false)
 * @returns Résultat avec lignes Excel, rapport de contrôle, violations SMIG
 */
export function generateSagePaieExport(
  employees: { matricule: string; nom: string; prenom: string; nouveau_salaire_brut: number; salaire_brut: number }[],
  pointage: { matricule: string; avances: number; absences: string; heures_supplementaires: string; conges_payes: string }[],
  salaryResults: Map<string, SalaryResult>,
  mois: number,
  annee: number,
  primeAncienneteEnabled: boolean = false
): SageExportResult {
  const rows: SageExportRow[] = [];
  const controlReport: ControlReportItem[] = [];
  const smigViolations: SageExportResult['smigViolations'] = [];
  const periode = `${String(mois).padStart(2, '0')}/${annee}`;

  // SMIG applicable pour l'année
  const smigApplicable = SMIG_REGIME_40H[annee] || SMIG_REGIME_40H[2026];

  const rubriquesUsed = new Set<string>();
  let warnings = 0;
  let errors = 0;

  for (const emp of employees) {
    const result = salaryResults.get(emp.matricule);
    if (!result) {
      controlReport.push({
        matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom,
        type: 'error', message: `Aucun calcul de salaire pour ${emp.nom} ${emp.prenom}`,
      });
      errors++;
      continue;
    }

    const ptg = pointage.find(p => p.matricule === emp.matricule);

    // --- CONTRÔLE SMIG ---
    // Décret n°2026-67 du 30/04/2026 : salaire brut ne peut être inférieur au SMIG
    // Régime 40h/semaine : 470,251 DT/mois (2026)
    // Avertissement BLOQUANT : ne pas laisser passer silencieusement
    if (result.salaire_brut < smigApplicable) {
      smigViolations.push({
        matricule: emp.matricule,
        nom: `${emp.nom} ${emp.prenom}`,
        brut: result.salaire_brut,
        smig: smigApplicable,
      });
      controlReport.push({
        matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom,
        type: 'error',
        message: `Salaire brut ${result.salaire_brut.toFixed(3)} DT < SMIG ${smigApplicable} DT (régime 40h)`,
        detail: `Décret n°67/2026, JORT n°44. Corriger le salaire de base avant export.`,
      });
      errors++;
    }

    // --- CONTRÔLE ÉCART BRUT ---
    // Log/rapport de contrôle : écarts entre brut calculé et dernier brut connu
    const brutConnu = emp.nouveau_salaire_brut > 0 ? emp.nouveau_salaire_brut : emp.salaire_brut;
    if (brutConnu > 0) {
      const ecart = Math.abs(result.salaire_brut - brutConnu);
      const ecartPct = (ecart / brutConnu) * 100;
      if (ecartPct > 10) {
        controlReport.push({
          matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom,
          type: 'warning',
          message: `Écart brut calculé vs connu : ${ecart.toFixed(3)} DT (${ecartPct.toFixed(1)}%)`,
          detail: `Brut calculé: ${result.salaire_brut.toFixed(3)} | Brut connu Excel: ${brutConnu.toFixed(3)}`,
        });
        warnings++;
      }
    }

    // --- CONTRÔLE MATRICULE ---
    if (!emp.matricule || emp.matricule.length < 3) {
      controlReport.push({
        matricule: emp.matricule || '(vide)', nom: emp.nom, prenom: emp.prenom,
        type: 'warning',
        message: `Matricule "${emp.matricule}" trop court ou vide — vérifier correspondance Sage`,
      });
      warnings++;
    }

    // --- GÉNÉRATION DES LIGNES RUBRIQUES ---

    // 1000 : Salaire de base (revalorisé)
    // Décret n°68/2026 : +5%/an cumulatif sur salaire de base
    rows.push({
      matricule: emp.matricule,
      code_rubrique: '1000',
      libelle: SAGE_RUBRIQUES['1000'].libelle,
      valeur: result.salaire_de_base,
      periode,
    });
    rubriquesUsed.add('1000');

    // 2100 : Indemnité de transport (revalorisée)
    // Convention BTP + Décret 68/2026
    if (result.ind_transport > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '2100',
        libelle: SAGE_RUBRIQUES['2100'].libelle,
        valeur: result.ind_transport,
        periode,
      });
      rubriquesUsed.add('2100');
    }

    // 2200 : Indemnité de présence (revalorisée)
    // Convention BTP + Décret 68/2026
    if (result.prime_presence > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '2200',
        libelle: SAGE_RUBRIQUES['2200'].libelle,
        valeur: result.prime_presence,
        periode,
      });
      rubriquesUsed.add('2200');
    }

    // 2202 : MIT — 60.61% × prime_presence
    if (result.mit > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '2202',
        libelle: SAGE_RUBRIQUES['2202'].libelle,
        valeur: result.mit,
        periode,
      });
      rubriquesUsed.add('2202');
    }

    // 2330 : Prime de panier légale
    // Convention BTP : 800M/jour (sous condition 7h+ continues)
    if (result.prime_panier > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '2330',
        libelle: SAGE_RUBRIQUES['2330'].libelle,
        valeur: result.prime_panier,
        periode,
      });
      rubriquesUsed.add('2330');
    }

    // 3210 : Prime de douche
    // Convention BTP : 600M/semaine (lieux sans douches ou déplacement)
    if (result.prime_douche > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '3210',
        libelle: SAGE_RUBRIQUES['3210'].libelle,
        valeur: result.prime_douche,
        periode,
      });
      rubriquesUsed.add('3210');
    }

    // 3801 : Prime de savon (exclue CNSS — Décret 2003-1098 art. 11)
    if (result.prime_savon > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '3801',
        libelle: SAGE_RUBRIQUES['3801'].libelle,
        valeur: result.prime_savon,
        periode,
      });
      rubriquesUsed.add('3801');
    }

    // 3802 : Prime de nuit (variable par employé)
    if (result.prime_nuit > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '3802',
        libelle: SAGE_RUBRIQUES['3802'].libelle,
        valeur: result.prime_nuit,
        periode,
      });
      rubriquesUsed.add('3802');
    }

    // 4383 : Prime de logement (variable par employé)
    if (result.prime_logement > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '4383',
        libelle: SAGE_RUBRIQUES['4383'].libelle,
        valeur: result.prime_logement,
        periode,
      });
      rubriquesUsed.add('4383');
    }

    // 4385 : Prime de lait (exclue CNSS — Décret 2003-1098 art. 11)
    if (result.prime_lait > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '4385',
        libelle: SAGE_RUBRIQUES['4385'].libelle,
        valeur: result.prime_lait,
        periode,
      });
      rubriquesUsed.add('4385');
    }

    // 4100 : Augmentation 2025 (revalorisation 5% — Décret n°68/2026)
    // Montant saisi manuellement dans Sage Paie — pas de formule automatique
    // Incluse dans le brut total et l'assiette CNSS (confirmé bulletin Sage)
    if (result.augmentation > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '4100',
        libelle: SAGE_RUBRIQUES['4100'].libelle,
        valeur: result.augmentation,
        periode,
      });
      rubriquesUsed.add('4100');
    }

    // 4113 : Heures supplémentaires
    // Code du travail, article 90 : majoration 25% (≤8h/sem) ou 50% (>8h/sem)
    if (result.heures_supplementaires > 0 && result.majoration_hs > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '4113',
        libelle: SAGE_RUBRIQUES['4113'].libelle,
        valeur: result.majoration_hs,
        periode,
      });
      rubriquesUsed.add('4113');
    }

    // 4120 : Prime d'ancienneté (UNIQUEMENT si activée)
    // Code du travail art. 135 (loi n°66-27 du 30/04/1966)
    // Barème générique : <3ans=0%, 3-6ans=5%, 6-9ans=10%, ≥9ans=15%
    // DÉSACTIVÉE PAR DÉFAUT — nouveau coût absent de la paie actuelle
    if (primeAncienneteEnabled && result.prime_anciennete > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '4120',
        libelle: SAGE_RUBRIQUES['4120'].libelle,
        valeur: result.prime_anciennete,
        periode,
      });
      rubriquesUsed.add('4120');
    }

    // 3100 : CNSS salarié
    // Loi n°73-40 : 9.68% du brut, plafonné 5000 DT/mois
    // Assiette = brut - prime_lait (exclue CNSS — Décret 2003-1098 art. 11)
    if (result.cnss_salariale > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '3100',
        libelle: SAGE_RUBRIQUES['3100'].libelle,
        valeur: result.cnss_salariale,
        periode,
      });
      rubriquesUsed.add('3100');
    }

    // 3310 : IRPP
    // Loi n°74-9, barème annuel LF 2025 art. 36 (8 tranches)
    if (result.irpp > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '3310',
        libelle: SAGE_RUBRIQUES['3310'].libelle,
        valeur: result.irpp,
        periode,
      });
      rubriquesUsed.add('3310');
    }

    // 3320 : CSS
    // Loi n°92-73 : 0.5% du revenu net imposable
    if (result.css_salariale > 0) {
      rows.push({
        matricule: emp.matricule,
        code_rubrique: '3320',
        libelle: SAGE_RUBRIQUES['3320'].libelle,
        valeur: result.css_salariale,
        periode,
      });
      rubriquesUsed.add('3320');
    }

    // 5100 : Allocations familiales
    // Loi n°82-26 : 25 DT/mois chef de famille + 8.333 DT/mois/enfant (max 4)
    if (result.net_a_payer > result.salaire_net) {
      const alloc = Math.round((result.net_a_payer - result.salaire_net) * 1000) / 1000;
      if (alloc > 0) {
        rows.push({
          matricule: emp.matricule,
          code_rubrique: '5100',
          libelle: SAGE_RUBRIQUES['5100'].libelle,
          valeur: alloc,
          periode,
        });
        rubriquesUsed.add('5100');
      }
    }

    // --- LIGNE AVANCES (si présence dans pointage) ---
    // Pas de rubrique Sage standard définie — à configurer dans Sage
    if (ptg && ptg.avances > 0) {
      controlReport.push({
        matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom,
        type: 'warning',
        message: `Avance ${ptg.avances} DT — rubrique non exportée (configurez le code Sage dans config.json)`,
      });
      warnings++;
    }
  }

  return {
    rows,
    controlReport,
    smigViolations,
    summary: {
      totalRows: rows.length,
      totalEmployees: employees.length,
      rubriquesGenerated: Array.from(rubriquesUsed).sort(),
      smigViolations: smigViolations.length,
      warnings,
      errors,
    },
  };
}

/**
 * @deprecated Utiliser generateSagePaieExport() à la place.
 * Conservé pour rétrocompatibilité temporaire.
 */
export function generateSageVariables(
  matricule: string,
  result: SalaryInput,
  calculated: SalaryResult
): { rubrique: string; zone: string; valeur: number }[] {
  const vars: { rubrique: string; zone: string; valeur: number }[] = [];
  vars.push({ rubrique: 'SBASE', zone: '1', valeur: calculated.salaire_de_base });
  if (calculated.prime_anciennete > 0) vars.push({ rubrique: 'P_ANC', zone: '1', valeur: calculated.prime_anciennete });
  if (calculated.ind_transport > 0) vars.push({ rubrique: 'TRANSP', zone: '1', valeur: calculated.ind_transport });
  if (calculated.prime_presence > 0) vars.push({ rubrique: 'PRESENCE', zone: '1', valeur: calculated.prime_presence });
  if (calculated.cnss_salariale > 0) vars.push({ rubrique: 'CSSAL', zone: '3', valeur: calculated.cnss_salariale });
  if (calculated.irpp > 0) vars.push({ rubrique: 'IRPP', zone: '3', valeur: calculated.irpp });
  if (calculated.css_salariale > 0) vars.push({ rubrique: 'CSS', zone: '3', valeur: calculated.css_salariale });
  if (result.avances && result.avances > 0) vars.push({ rubrique: 'AVANCE', zone: '3', valeur: result.avances });
  if (calculated.net_a_payer > calculated.salaire_net) {
    const alloc = calculated.net_a_payer - calculated.salaire_net;
    vars.push({ rubrique: 'ALLOCFAM', zone: '5', valeur: alloc });
  }
  return vars;
}
