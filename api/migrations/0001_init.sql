-- EUREX D1 Schema
CREATE TABLE IF NOT EXISTS societes (
  id TEXT PRIMARY KEY,
  raison_sociale TEXT NOT NULL,
  matricule_fiscal TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journaux (
  id TEXT PRIMARY KEY,
  societe_id TEXT NOT NULL,
  code TEXT NOT NULL,
  libelle TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dossiers (
  id TEXT PRIMARY KEY,
  societe_id TEXT NOT NULL,
  nom TEXT NOT NULL,
  statut TEXT DEFAULT 'brouillon',
  nb_pieces INTEGER DEFAULT 0,
  nb_ecritures INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pieces (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL,
  societe_id TEXT NOT NULL,
  nom_fichier TEXT NOT NULL,
  chemin TEXT,
  date_document TEXT,
  numero_facture TEXT,
  tiers TEXT,
  montant_ht REAL DEFAULT 0,
  montant_tva REAL DEFAULT 0,
  montant_ttc REAL DEFAULT 0,
  mode_reglement TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ecritures (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL,
  societe_id TEXT NOT NULL,
  journal_code TEXT NOT NULL,
  date_operation TEXT NOT NULL,
  date_piece TEXT,
  numero_doc TEXT,
  libelle TEXT NOT NULL,
  compte TEXT NOT NULL,
  sens TEXT NOT NULL,
  montant REAL NOT NULL,
  tresorerie TEXT,
  statut TEXT DEFAULT 'brouillon',
  piece_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS factures (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL,
  societe_id TEXT NOT NULL,
  date_facture TEXT NOT NULL,
  numero_facture TEXT NOT NULL,
  client TEXT,
  total_ht_0 REAL DEFAULT 0,
  total_ht_19 REAL DEFAULT 0,
  tva_19 REAL DEFAULT 0,
  timbre REAL DEFAULT 1,
  total_ttc REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rapport_modes (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL,
  date_jour TEXT NOT NULL,
  especes REAL DEFAULT 0,
  cheques REAL DEFAULT 0,
  tpe REAL DEFAULT 0,
  bonsAchat REAL DEFAULT 0,
  avoir REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(dossier_id, date_jour)
);

CREATE INDEX IF NOT EXISTS idx_ecritures_dossier ON ecritures(dossier_id);
CREATE INDEX IF NOT EXISTS idx_ecritures_journal ON ecritures(dossier_id, journal_code);
CREATE INDEX IF NOT EXISTS idx_factures_dossier ON factures(dossier_id);
CREATE INDEX IF NOT EXISTS idx_rapport_dossier ON rapport_modes(dossier_id);
CREATE INDEX IF NOT EXISTS idx_pieces_dossier ON pieces(dossier_id);
