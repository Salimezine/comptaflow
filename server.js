const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web/dist')));

const db = new Database(path.join(__dirname, 'comptaflow.db'));
db.pragma('journal_mode = WAL');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function genId() { return crypto.randomBytes(8).toString('hex'); }

db.exec(`
  CREATE TABLE IF NOT EXISTS societes (
    id TEXT PRIMARY KEY, raison_sociale TEXT NOT NULL, matricule_fiscal TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS journaux (
    id TEXT PRIMARY KEY, societe_id TEXT NOT NULL, code TEXT NOT NULL, libelle TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS dossiers (
    id TEXT PRIMARY KEY, societe_id TEXT NOT NULL, nom TEXT NOT NULL, statut TEXT DEFAULT 'brouillon',
    nb_pieces INTEGER DEFAULT 0, nb_ecritures INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS pieces (
    id TEXT PRIMARY KEY, dossier_id TEXT NOT NULL, societe_id TEXT NOT NULL, nom_fichier TEXT NOT NULL,
    chemin TEXT NOT NULL, date_document TEXT, numero_facture TEXT, tiers TEXT,
    montant_ht REAL DEFAULT 0, montant_tva REAL DEFAULT 0, montant_ttc REAL DEFAULT 0,
    mode_reglement TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ecritures (
    id TEXT PRIMARY KEY, dossier_id TEXT NOT NULL, societe_id TEXT NOT NULL, journal_code TEXT NOT NULL,
    date_operation TEXT NOT NULL, date_piece TEXT, numero_doc TEXT, libelle TEXT NOT NULL,
    compte_debit TEXT NOT NULL, compte_credit TEXT NOT NULL, montant REAL NOT NULL,
    tresorerie TEXT, statut TEXT DEFAULT 'brouillon', piece_id TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS factures (
    id TEXT PRIMARY KEY, dossier_id TEXT NOT NULL, societe_id TEXT NOT NULL,
    date_facture TEXT NOT NULL, numero_facture TEXT NOT NULL, client TEXT,
    total_ht_0 REAL DEFAULT 0, total_ht_19 REAL DEFAULT 0, tva_19 REAL DEFAULT 0,
    timbre REAL DEFAULT 1, total_ttc REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  );
`);

// --- AUTO CREATE DEFAULT DATA ---
const defaultSoc = db.prepare('SELECT id FROM societes LIMIT 1').get();
if (!defaultSoc) {
  const sid = 'default_soc';
  db.prepare('INSERT INTO societes (id, raison_sociale) VALUES (?, ?)').run(sid, 'Cabinet');
  const journaux = [['VE','Ventes'],['AC','Achats'],['BQ','Banque'],['CA','Caisse'],['OD','Operations Diverses']];
  for (const [c, l] of journaux) db.prepare('INSERT INTO journaux (id, societe_id, code, libelle) VALUES (?, ?, ?, ?)').run(genId(), sid, c, l);
}

const defaultDossier = db.prepare('SELECT id FROM dossiers WHERE nom = ?').get('ANIMAL');
if (!defaultDossier) {
  const soc = db.prepare('SELECT id FROM societes LIMIT 1').get();
  const did = 'dossier_animal';
  db.prepare('INSERT INTO dossiers (id, societe_id, nom) VALUES (?, ?, ?)').run(did, soc.id, 'ANIMAL');
}

// --- SOCIETES ---
app.get('/api/societes', (req, res) => {
  res.json(db.prepare('SELECT * FROM societes ORDER BY raison_sociale').all());
});

app.post('/api/societes', (req, res) => {
  const { raison_sociale, matricule_fiscal } = req.body;
  if (!raison_sociale) return res.status(400).json({ error: 'Raison sociale requise' });
  const id = genId();
  db.prepare('INSERT INTO societes (id, raison_sociale, matricule_fiscal) VALUES (?, ?, ?)').run(id, raison_sociale, matricule_fiscal || null);
  const journaux = [['VE','Ventes'],['AC','Achats'],['BQ','Banque'],['CA','Caisse'],['OD','Operations Diverses']];
  const stmt = db.prepare('INSERT INTO journaux (id, societe_id, code, libelle) VALUES (?, ?, ?, ?)');
  for (const [c, l] of journaux) stmt.run(genId(), id, c, l);
  res.json({ id, raison_sociale, matricule_fiscal });
});

app.delete('/api/societes/:id', (req, res) => {
  db.prepare('DELETE FROM societes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- JOURNAUX ---
app.get('/api/societes/:sid/journaux', (req, res) => {
  res.json(db.prepare('SELECT * FROM journaux WHERE societe_id = ?').all(req.params.sid));
});

// --- DOSSIERS ---
app.get('/api/societes/:sid/dossiers', (req, res) => {
  res.json(db.prepare('SELECT * FROM dossiers WHERE societe_id = ? ORDER BY created_at DESC').all(req.params.sid));
});

app.post('/api/societes/:sid/dossiers', (req, res) => {
  const { nom } = req.body;
  const id = genId();
  db.prepare('INSERT INTO dossiers (id, societe_id, nom) VALUES (?, ?, ?)').run(id, req.params.sid, nom);
  res.json({ id, nom, statut: 'brouillon' });
});

app.get('/api/dossiers/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(req.params.id);
  d ? res.json(d) : res.status(404).json({ error: 'Non trouve' });
});

app.delete('/api/dossiers/:id', (req, res) => {
  db.prepare('DELETE FROM dossiers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- UPLOAD ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${genId()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/dossiers/:did/upload', upload.array('files', 50), (req, res) => {
  const did = req.params.did;
  const d = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(did);
  if (!d) return res.status(404).json({ error: 'Dossier non trouve' });
  const stmt = db.prepare('INSERT INTO pieces (id, dossier_id, societe_id, nom_fichier, chemin) VALUES (?, ?, ?, ?, ?)');
  const created = [];
  for (const f of req.files) {
    const id = genId();
    stmt.run(id, did, d.societe_id, f.originalname, f.path);
    created.push({ id, nom_fichier: f.originalname });
  }
  db.prepare('UPDATE dossiers SET nb_pieces = nb_pieces + ? WHERE id = ?').run(created.length, did);
  res.json({ uploaded: created.length, pieces: created });
});

// --- LIST PIECES ---
app.get('/api/dossiers/:did/pieces', (req, res) => {
  res.json(db.prepare('SELECT * FROM pieces WHERE dossier_id = ? ORDER BY created_at').all(req.params.did));
});

// --- ECRITURES ---
app.get('/api/dossiers/:did/ecritures', (req, res) => {
  res.json(db.prepare('SELECT * FROM ecritures WHERE dossier_id = ? ORDER BY date_operation, journal_code').all(req.params.did));
});

app.post('/api/dossiers/:did/ecritures', (req, res) => {
  const b = req.body;
  const id = genId();
  db.prepare(`INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte_debit, compte_credit, montant, tresorerie, piece_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.params.did, b.societe_id, b.journal_code, b.date_operation, b.date_piece || null, b.numero_doc || null, b.libelle, b.compte_debit, b.compte_credit, b.montant, b.tresorerie || null, b.piece_id || null);
  db.prepare('UPDATE dossiers SET nb_ecritures = nb_ecritures + 1 WHERE id = ?').run(req.params.did);
  res.json({ id, ...b });
});

app.delete('/api/ecritures/:eid', (req, res) => {
  const e = db.prepare('SELECT * FROM ecritures WHERE id = ?').get(req.params.eid);
  if (e) {
    db.prepare('DELETE FROM ecritures WHERE id = ?').run(e.id);
    db.prepare('UPDATE dossiers SET nb_ecritures = MAX(0, nb_ecritures - 1) WHERE id = ?').run(e.dossier_id);
  }
  res.json({ ok: true });
});

// --- EXPORT CSV ---
app.get('/api/dossiers/:did/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM ecritures WHERE dossier_id = ? ORDER BY date_operation, journal_code').all(req.params.did);
  const header = 'Date operation;Date piece;Journal;N doc;Libelle;Compte debit;Compte credit;Montant;Sens;Tresorerie';
  const lines = rows.map(e => [
    e.date_operation, e.date_piece || '', e.journal_code, e.numero_doc || '',
    e.libelle, e.compte_debit, e.compte_credit, e.montant.toFixed(3),
    e.compte_debit.startsWith('5') ? 'T' : 'D', e.tresorerie || ''
  ].join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ecritures_${req.params.did}.csv"`);
  res.send([header, ...lines].join('\n'));
});

// --- FACTURES ---
app.get('/api/dossiers/:did/factures', (req, res) => {
  res.json(db.prepare('SELECT * FROM factures WHERE dossier_id = ? ORDER BY date_facture, numero_facture').all(req.params.did));
});

app.post('/api/dossiers/:did/factures', (req, res) => {
  const b = req.body;
  const id = genId();
  const d = db.prepare('SELECT societe_id FROM dossiers WHERE id = ?').get(req.params.did);
  if (!d) return res.status(404).json({ error: 'Dossier non trouve' });
  db.prepare('INSERT INTO factures (id, dossier_id, societe_id, date_facture, numero_facture, client, total_ht_0, total_ht_19, tva_19, timbre, total_ttc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.params.did, d.societe_id, b.date_facture, b.numero_facture, b.client || '', b.total_ht_0 || 0, b.total_ht_19 || 0, b.tva_19 || 0, b.timbre || 1, b.total_ttc || 0);
  res.json({ id, ...b }, 201);
});

app.delete('/api/factures/:fid', (req, res) => {
  db.prepare('DELETE FROM factures WHERE id = ?').run(req.params.fid);
  res.json({ ok: true });
});

// --- GENERATE VT J.C ---
app.post('/api/dossiers/:did/generate-vtjc', (req, res) => {
  const did = req.params.did;
  const d = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(did);
  if (!d) return res.status(404).json({ error: 'Dossier non trouve' });

  const factures = db.prepare('SELECT * FROM factures WHERE dossier_id = ? ORDER BY date_facture, numero_facture').all(did);
  if (!factures.length) return res.status(400).json({ error: 'Aucune facture' });

  db.prepare("DELETE FROM ecritures WHERE dossier_id = ? AND journal_code = 'VT J.C'").run(did);

  const byDay = {};
  for (const f of factures) {
    if (!byDay[f.date_facture]) byDay[f.date_facture] = [];
    byDay[f.date_facture].push(f);
  }

  const allEntries = [];
  for (const [date, dayFactures] of Object.entries(byDay)) {
    const nums = dayFactures.map(f => f.numero_facture.replace(/[^0-9]/g, '')).sort((a, b) => a - b);
    const numPiece = nums.length === 1 ? 'FAC N' + nums[0] + '-26' : 'FAC N' + nums.join('-') + '-26';

    const clients = [...new Set(dayFactures.map(f => f.client).filter(Boolean))];
    const hasNamed = clients.length > 0 && !(clients.length === 1 && clients[0] === '');
    const libelle = hasNamed ? 'CLTS PASSAGERS/' + clients.join('/') : 'CLTS PASSAGERS';

    const totalHT0 = dayFactures.reduce((s, f) => s + (f.total_ht_0 || 0), 0);
    const totalHT19 = dayFactures.reduce((s, f) => s + (f.total_ht_19 || 0), 0);
    const tva19 = dayFactures.reduce((s, f) => s + (f.tva_19 || 0), 0);
    const timbres = dayFactures.length;
    const totalTTC = dayFactures.reduce((s, f) => s + (f.total_ttc || 0), 0);

    const modes = (req.body.modes && req.body.modes[date]) || { especes: totalTTC, tpe: 0, cheques: 0, avoirs: 0 };

    const debitSum = (modes.especes || 0) + (modes.tpe || 0) + (modes.cheques || 0);
    const creditSum = (modes.avoirs || 0) + tva19 + timbres + totalHT0 + totalHT19;
    const ecart = Math.round((debitSum - creditSum) * 1000) / 1000;

    const ecrId = genId();
    db.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte_debit, compte_credit, montant, tresorerie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(ecrId, did, d.societe_id, 'VT J.C', date, date, numPiece, libelle, '411004', '411004', 0, null);

    const lines = [];
    if (modes.especes > 0) lines.push(['411004', modes.especes, 'D']);
    if (modes.tpe > 0) lines.push(['411005', modes.tpe, 'D']);
    if (modes.cheques > 0) lines.push(['411003', modes.cheques, 'D']);
    if (modes.avoirs > 0) lines.push(['709500', modes.avoirs, 'C']);
    lines.push(['436711', tva19, 'C']);
    lines.push(['437500', timbres, 'C']);
    if (totalHT0 > 0) lines.push(['707200', totalHT0, 'C']);
    if (totalHT19 > 0) lines.push(['707219', totalHT19, 'C']);
    if (ecart !== 0) lines.push(['634500', Math.abs(ecart), ecart > 0 ? 'C' : 'D']);

    for (const [compte, montant, sens] of lines) {
      const lid = genId();
      if (sens === 'D') {
        db.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte_debit, compte_credit, montant, tresorerie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(lid, did, d.societe_id, 'VT J.C', date, date, numPiece, libelle, compte, '411004', montant, null);
      } else {
        db.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte_debit, compte_credit, montant, tresorerie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(lid, did, d.societe_id, 'VT J.C', date, date, numPiece, libelle, '411004', compte, montant, null);
      }
    }

    allEntries.push({ date, numPiece, libelle, totalHT0, totalHT19, tva19, timbres, totalTTC, modes, ecart, lignes: lines });
  }

  db.prepare('UPDATE dossiers SET nb_ecritures = (SELECT COUNT(*) FROM ecritures WHERE dossier_id = ?) WHERE id = ?').run(did, did);
  res.json({ days: allEntries.length, entries: allEntries });
});

// --- DASHBOARD ---
app.get('/api/dashboard', (req, res) => {
  const s = db.prepare('SELECT COUNT(*) as c FROM societes').get();
  const d = db.prepare('SELECT COUNT(*) as c FROM dossiers').get();
  const e = db.prepare('SELECT COUNT(*) as c FROM ecritures').get();
  const recent = db.prepare('SELECT d.*, s.raison_sociale FROM dossiers d LEFT JOIN societes s ON d.societe_id = s.id ORDER BY d.created_at DESC LIMIT 10').all();
  const animal = db.prepare('SELECT id FROM dossiers WHERE nom = ?').get('ANIMAL');
  res.json({ stats: { societes: s.c, dossiers: d.c, ecritures: e.c }, recentDossiers: recent, animalDossierId: animal?.id || null });
});

// SPA fallback
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'web/dist/index.html'));
  } else {
    next();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ComptaFlow tourne sur http://localhost:${PORT}`);
});
