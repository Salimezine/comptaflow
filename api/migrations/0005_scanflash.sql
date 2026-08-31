CREATE TABLE IF NOT EXISTS societes_scan (
  id TEXT PRIMARY KEY,
  raison_sociale TEXT NOT NULL,
  matricule_fiscal TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dossiers_scan (
  id TEXT PRIMARY KEY,
  societe_id TEXT NOT NULL,
  nom TEXT NOT NULL,
  mois INTEGER NOT NULL,
  annee INTEGER NOT NULL,
  statut TEXT DEFAULT 'brouillon',
  nb_pieces INTEGER DEFAULT 0,
  nb_ecritures INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS factures_scan (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL,
  numero TEXT,
  date_facture TEXT,
  client TEXT,
  compte_client TEXT,
  total_ht_0 REAL DEFAULT 0,
  total_ht_19 REAL DEFAULT 0,
  tva_19 REAL DEFAULT 0,
  fodec REAL DEFAULT 0,
  timbre REAL DEFAULT 0,
  total_ttc REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ecritures_scan (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL,
  numero_doc TEXT,
  date_operation TEXT,
  journal_code TEXT DEFAULT 'VT',
  compte TEXT NOT NULL,
  libelle TEXT,
  sens TEXT NOT NULL CHECK(sens IN ('D', 'C')),
  montant REAL NOT NULL,
  page INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
