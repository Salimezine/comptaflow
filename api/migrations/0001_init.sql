CREATE TABLE IF NOT EXISTS societes (
  id TEXT PRIMARY KEY,
  raison_sociale TEXT NOT NULL,
  matricule_fiscal TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journaux (
  id TEXT PRIMARY KEY,
  societe_id TEXT NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  UNIQUE(societe_id, code)
);

CREATE TABLE IF NOT EXISTS dossiers (
  id TEXT PRIMARY KEY,
  societe_id TEXT NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  statut TEXT DEFAULT 'brouillon',
  nb_pieces INTEGER DEFAULT 0,
  nb_ecritures INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pieces (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  societe_id TEXT NOT NULL,
  nom_fichier TEXT NOT NULL,
  r2_key TEXT NOT NULL,
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
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  societe_id TEXT NOT NULL,
  journal_code TEXT NOT NULL,
  date_operation TEXT NOT NULL,
  date_piece TEXT,
  numero_doc TEXT,
  libelle TEXT NOT NULL,
  compte_debit TEXT NOT NULL,
  compte_credit TEXT NOT NULL,
  montant REAL NOT NULL,
  tresorerie TEXT,
  statut TEXT DEFAULT 'brouillon',
  piece_id TEXT REFERENCES pieces(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pieces_dossier ON pieces(dossier_id);
CREATE INDEX IF NOT EXISTS idx_ecritures_dossier ON ecritures(dossier_id);
CREATE INDEX IF NOT EXISTS idx_ecritures_societe ON ecritures(societe_id);

INSERT INTO journaux (id, societe_id, code, libelle) VALUES
  ('j1', 'default', 'VE', 'Ventes'),
  ('j2', 'default', 'AC', 'Achats'),
  ('j3', 'default', 'BQ', 'Banque'),
  ('j4', 'default', 'CA', 'Caisse'),
  ('j5', 'default', 'OD', 'Operations Diverses');
