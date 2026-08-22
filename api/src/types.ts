export interface Env {
  DB: D1Database;
  PDF_BUCKET: R2Bucket;
}

export interface Societe {
  id: string;
  raison_sociale: string;
  matricule_fiscal: string | null;
  created_at: string;
}

export interface Journal {
  id: string;
  societe_id: string;
  code: string;
  libelle: string;
}

export interface Dossier {
  id: string;
  societe_id: string;
  nom: string;
  statut: string;
  nb_pieces: number;
  nb_ecritures: number;
  created_at: string;
}

export interface Piece {
  id: string;
  dossier_id: string;
  societe_id: string;
  nom_fichier: string;
  r2_key: string;
  date_document: string | null;
  numero_facture: string | null;
  tiers: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  mode_reglement: string | null;
  created_at: string;
}

export interface Ecriture {
  id: string;
  dossier_id: string;
  societe_id: string;
  journal_code: string;
  date_operation: string;
  date_piece: string | null;
  numero_doc: string | null;
  libelle: string;
  compte_debit: string;
  compte_credit: string;
  montant: number;
  tresorerie: string | null;
  statut: string;
  piece_id: string | null;
  created_at: string;
}
