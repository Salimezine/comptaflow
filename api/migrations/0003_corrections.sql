-- BAUD: AI Learning from user corrections
CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  societe_id TEXT NOT NULL,
  field TEXT NOT NULL CHECK(field IN ('matricule','rubrique_code','zone','valeur','nom_prenom')),
  old_value TEXT,
  new_value TEXT NOT NULL,
  source_pattern TEXT,
  context TEXT,
  hit_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_corrections_societe ON corrections(societe_id, field);
