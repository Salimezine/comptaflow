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

// --- PDF TEXT EXTRACTION (server-side) ---
async function extractTextFromPDF(filePath) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Reconstruct lines using y-positions
    const items = content.items.filter(item => item.str.trim());
    if (items.length === 0) continue;
    // Sort by y (top to bottom), then x (left to right)
    items.sort((a, b) => {
      const ay = a.transform[5], by = b.transform[5];
      if (Math.abs(ay - by) > 2) return by - ay; // different lines: top first
      return a.transform[4] - b.transform[4]; // same line: left first
    });
    let lines = [];
    let currentLine = [items[0]];
    for (let j = 1; j < items.length; j++) {
      const prev = currentLine[currentLine.length - 1];
      const dy = Math.abs(items[j].transform[5] - prev.transform[5]);
      if (dy > 2) {
        lines.push(currentLine.map(x => x.str).join(' '));
        currentLine = [items[j]];
      } else {
        currentLine.push(items[j]);
      }
    }
    lines.push(currentLine.map(x => x.str).join(' '));
    fullText += lines.join('\n') + '\n';
  }
  return fullText;
}

function parseInvoice(text) {
  let numero = '';
  let m = text.match(/FACTURE\s*N[°�∞]?\s*:\s*(\d{4})\s*\/\s*(\d+)/);
  if (m) numero = m[1] + '/' + m[2];

  let date = '';
  m = text.match(/LE\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) date = m[3] + '-' + m[2] + '-' + m[1];

  let client = '';
  m = text.match(/(?<!Code )Client\s*:\s*(.+?)(?:\n|$)/);
  if (m) {
    const c = m[1].trim();
    client = c.toUpperCase().includes('PASSAGERS') ? 'CLIENTS PASSAGERS' : c;
  }

  let ht0 = 0, ht19 = 0, tva19 = 0, ttc = 0, timbre = 1.0;
  const lines = text.split('\n');

  for (const line of lines) {
    if (ht0 === 0) {
      m = line.match(/^([\d][\d ,.]+?)\s+0%\s/);
      if (m) { try { ht0 = parseFloat(m[1].trim().replace(/ /g, '').replace(',', '.')); } catch(e) {} }
    }
    if (ht19 === 0) {
      m = line.match(/^([\d][\d ,.]+?)\s+19%\s+([\d ,.]+)/);
      if (m) {
        try { ht19 = parseFloat(m[1].trim().replace(/ /g, '').replace(',', '.')); } catch(e) {}
        try { tva19 = parseFloat(m[2].trim().replace(/ /g, '').replace(',', '.')); } catch(e) {}
      }
    }
    if (timbre === 1.0) {
      m = line.match(/TIMBRE\s+FIS\.\s*:\s*([\d ,.]+)/);
      if (m) { try { timbre = parseFloat(m[1].trim().replace(/ /g, '').replace(',', '.')); } catch(e) {} }
    }
    if (ttc === 0) {
      m = line.match(/NET\s+T\.T\.C\.\s*([\d ,.]+)/);
      if (m) { try { ttc = parseFloat(m[1].trim().replace(/ /g, '').replace(',', '.')); } catch(e) {} }
    }
  }

  return { date, numero, client, ht0, ht19, tva19, timbre, ttc };
}

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

// --- PROCESS: Upload + OCR + Create factures ---
app.post('/api/dossiers/:did/process', upload.array('files', 50), async (req, res) => {
  const did = req.params.did;
  const d = db.prepare('SELECT * FROM dossiers WHERE id = ?').get(did);
  if (!d) return res.status(404).json({ error: 'Dossier non trouve' });

  const results = [];
  for (const f of req.files) {
    try {
      const text = await extractTextFromPDF(f.path);
      const inv = parseInvoice(text);
      if (!inv.numero) inv.numero = f.originalname.replace(/[^0-9]/g, '');

      const fid = genId();
      db.prepare('INSERT INTO factures (id, dossier_id, societe_id, date_facture, numero_facture, client, total_ht_0, total_ht_19, tva_19, timbre, total_ttc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(fid, did, d.societe_id, inv.date, inv.numero, inv.client, inv.ht0, inv.ht19, inv.tva19, inv.timbre, inv.ttc);

      db.prepare('INSERT INTO pieces (id, dossier_id, societe_id, nom_fichier, chemin) VALUES (?, ?, ?, ?, ?)')
        .run(genId(), did, d.societe_id, f.originalname, f.path);

      results.push({ file: f.originalname, numero: inv.numero, date: inv.date, client: inv.client, ht0: inv.ht0, ht19: inv.ht19, tva19: inv.tva19, ttc: inv.ttc, ok: true });
    } catch (e) {
      results.push({ file: f.originalname, error: e.message, ok: false });
    }
  }

  db.prepare('UPDATE dossiers SET nb_pieces = (SELECT COUNT(*) FROM pieces WHERE dossier_id = ?) WHERE id = ?').run(did, did);
  res.json({ processed: results.length, results });
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

// --- SEED JUNE 2026 ---
const JUIN_2026_DATA = [["2026/331","2026-06-01","99",3127.906,659.924,125.386,1.0,3914.22],["2026/333","2026-06-02","111",171.0,28.571,5.428,1.0,206.0],["2026/334","2026-06-02","99",3257.868,807.903,153.502,1.0,4220.27],["2026/336","2026-06-03","99",2391.302,698.74,132.761,1.0,3223.8],["2026/338","2026-06-04","99",2895.188,1215.378,230.922,1.0,4342.49],["2026/340","2026-06-05","99",3524.578,1030.509,195.797,1.0,4751.88],["2026/342","2026-06-06","99",3708.984,652.697,124.012,1.0,4486.69],["2026/344","2026-06-07","99",2898.148,1275.973,242.435,1.0,4417.56],["2026/347","2026-06-08","99",2879.048,479.414,91.089,1.0,3450.55],["2026/349","2026-06-09","99",2646.136,652.104,123.9,1.0,3423.14],["2026/351","2026-06-10","99",3536.484,652.523,123.979,1.0,4313.99],["2026/353","2026-06-11","99",2583.887,621.937,118.168,1.0,3324.99],["2026/356","2026-06-12","99",3969.01,801.939,152.368,1.0,4924.32],["2026/358","2026-06-13","99",3811.04,989.921,188.085,1.0,4990.05],["2026/360","2026-06-14","122",319.0,21.429,4.072,1.0,345.5],["2026/361","2026-06-14","99",2814.414,814.878,154.827,1.0,3785.12],["2026/363","2026-06-15","99",2452.36,1254.458,238.347,1.0,3946.17],["2026/364","2026-06-16","99",3485.033,661.094,125.608,1.0,4272.74],["2026/365","2026-06-17","99",4812.914,1037.571,197.138,1.0,6048.62],["2026/366","2026-06-18","102",717.0,0,0,1.0,718.0],["2026/367","2026-06-18","99",3110.988,926.051,175.95,1.0,4213.99],["2026/368","2026-06-19","99",3512.074,980.335,186.264,1.0,4679.67],["2026/369","2026-06-20","99",2989.332,923.702,175.503,1.0,4089.54],["2026/371","2026-06-21","99",3453.156,618.322,117.481,1.0,4189.96],["2026/373","2026-06-22","99",3291.031,863.538,164.072,1.0,4319.64],["2026/375","2026-06-23","99",2200.69,363.362,69.039,1.0,2634.09],["2026/377","2026-06-24","99",2838.909,868.238,164.965,1.0,3873.11],["2026/379","2026-06-25","99",2635.39,781.093,148.408,1.0,3565.89],["2026/381","2026-06-26","99",2447.91,654.201,124.298,1.0,3227.41],["2026/383","2026-06-27","99",3231.183,980.254,186.248,1.0,4398.69],["2026/385","2026-06-28","113",75.0,72.268,13.731,1.0,162.0],["2026/386","2026-06-28","99",3219.566,841.266,159.841,1.0,4221.67],["2026/388","2026-06-29","99",3856.605,688.152,130.749,1.0,4676.51],["2026/390","2026-06-30","99",2678.115,676.558,128.546,1.0,3484.22]];

app.post('/api/seed-juin-2026', (req, res) => {
  const d = db.prepare('SELECT id, societe_id FROM dossiers WHERE nom = ?').get('ANIMAL');
  if (!d) return res.status(404).json({ error: 'Dossier ANIMAL not found' });

  const existing = db.prepare('SELECT COUNT(*) as c FROM factures WHERE dossier_id = ?').get(d.id);
  if (existing.c > 0) return res.json({ ok: true, message: 'Already seeded', count: existing.c });

  const insertF = db.prepare('INSERT INTO factures (id, dossier_id, societe_id, date_facture, numero_facture, client, total_ht_0, total_ht_19, tva_19, timbre, total_ttc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertE = db.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte_debit, compte_credit, montant, tresorerie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  const txn = db.transaction(() => {
    for (const [num, date, client, ht0, ht19, tva, timbre, ttc] of JUIN_2026_DATA) {
      insertF.run(genId(), d.id, d.societe_id, date, num, client, ht0, ht19, tva, timbre, ttc);
    }

    const byDay = {};
    for (const [num, date, client, ht0, ht19, tva, timbre, ttc] of JUIN_2026_DATA) {
      if (!byDay[date]) byDay[date] = [];
      byDay[date].push({ num, client, ht0, ht19, tva, ttc });
    }

    for (const [date, dayF] of Object.entries(byDay)) {
      const nums = dayF.map(f => f.num.split('/')[1]).sort((a, b) => a - b);
      const numPiece = nums.length === 1 ? 'FAC N' + nums[0] + '-26' : 'FAC N' + nums.join('-') + '-26';
      const clients = [...new Set(dayF.map(f => f.client).filter(Boolean))];
      const libelle = clients.length > 0 ? 'CLTS PASSAGERS/' + clients.join('/') : 'CLTS PASSAGERS';
      const totalHT0 = dayF.reduce((s, f) => s + f.ht0, 0);
      const totalHT19 = dayF.reduce((s, f) => s + f.ht19, 0);
      const tva19 = dayF.reduce((s, f) => s + f.tva, 0);
      const timbres = dayF.length;
      const totalTTC = dayF.reduce((s, f) => s + f.ttc, 0);
      const especes = totalTTC;
      const creditSum = tva19 + timbres + totalHT0 + totalHT19;
      const ecart = Math.round((especes - creditSum) * 1000) / 1000;

      insertE.run(genId(), d.id, d.societe_id, 'VT J.C', date, date, numPiece, libelle, '411004', '411004', 0, null);
      if (especes > 0) insertE.run(genId(), d.id, d.societe_id, 'VT J.C', date, date, numPiece, libelle, '411004', '411004', especes, null);
      if (totalHT0 > 0) insertE.run(genId(), d.id, d.societe_id, 'VT J.C', date, date, numPiece, libelle, '411004', '707200', totalHT0, null);
      if (totalHT19 > 0) insertE.run(genId(), d.id, d.societe_id, 'VT J.C', date, date, numPiece, libelle, '411004', '707219', totalHT19, null);
      insertE.run(genId(), d.id, d.societe_id, 'VT J.C', date, date, numPiece, libelle, '411004', '436711', tva19, null);
      insertE.run(genId(), d.id, d.societe_id, 'VT J.C', date, date, numPiece, libelle, '411004', '437500', timbres, null);
      if (ecart !== 0) insertE.run(genId(), d.id, d.societe_id, 'VT J.C', date, date, numPiece, libelle, '411004', '634500', Math.abs(ecart), null);
    }

    db.prepare('UPDATE dossiers SET nb_ecritures = (SELECT COUNT(*) FROM ecritures WHERE dossier_id = ?) WHERE id = ?').run(d.id, d.id);
  });

  txn();
  res.json({ ok: true, factures: JUIN_2026_DATA.length });
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
