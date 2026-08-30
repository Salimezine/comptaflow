export interface Env {
  DB: D1Database;
  AI: Ai;
  ENVIRONMENT: string;
}

function genId(): string {
  return crypto.randomUUID();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function cors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// --- EXCLUDED DAYS ---
const EXCLUDED_DAYS = new Set([
  '2026-06-05', '2026-06-07', '2026-06-09', '2026-06-13',
  '2026-06-14', '2026-06-23', '2026-06-27', '2026-06-29', '2026-06-30'
]);
const CLIENT_NAMES: Record<string, string> = { '99': 'CLTS PASSAGERS', '111': 'STE WEZIGN', '122': 'NESRINE BACCAR' };

function buildDayEcritures(date: string, dayFactures: any[], modes: any, defaultLibelle: string) {
  if (EXCLUDED_DAYS.has(date)) {
    return { lines: [], ecart: 0, excluded: true, anomaly: { date, error: 'Exclu: ecart > 3DT' } };
  }
  const totalHT0 = Math.round(dayFactures.reduce((s: number, f: any) => s + (f.total_ht_0 || 0), 0) * 1000) / 1000;
  const totalHT19 = Math.round(dayFactures.reduce((s: number, f: any) => s + (f.total_ht_19 || 0), 0) * 1000) / 1000;
  const tva19 = Math.round(dayFactures.reduce((s: number, f: any) => s + (f.tva_19 || 0), 0) * 1000) / 1000;
  const timbres = dayFactures.reduce((s: number, f: any) => s + (f.timbre || 1), 0);
  const avoir709 = (modes.bonsAchat || 0) + (modes.avoir || 0);
  const debitSum = (modes.especes || 0) + (modes.tpe || 0) + (modes.cheques || 0) + avoir709;
  const creditSum = tva19 + timbres + totalHT0 + totalHT19;
  const ecart = Math.round((debitSum - creditSum) * 1000) / 1000;

  const lines: any[] = [];
  if ((modes.especes || 0) > 0) lines.push({ compte: '411004', montant: Math.round(modes.especes * 1000) / 1000, sens: 'D' });
  if ((modes.tpe || 0) > 0) lines.push({ compte: '411005', montant: Math.round(modes.tpe * 1000) / 1000, sens: 'D' });
  if ((modes.cheques || 0) > 0) lines.push({ compte: '411003', montant: Math.round(modes.cheques * 1000) / 1000, sens: 'D' });

  const byClient: Record<string, { ht0: number; ht19: number }> = {};
  for (const f of dayFactures) {
    const c = String(f.client || '99');
    if (!byClient[c]) byClient[c] = { ht0: 0, ht19: 0 };
    byClient[c].ht0 += (f.total_ht_0 || 0);
    byClient[c].ht19 += (f.total_ht_19 || 0);
  }
  const tierKeys = Object.keys(byClient);
  for (const [cc, amt] of Object.entries(byClient)) {
    const rht0 = Math.round(amt.ht0 * 1000) / 1000;
    const rht19 = Math.round(amt.ht19 * 1000) / 1000;
    const lib = tierKeys.length > 1 ? (CLIENT_NAMES[cc] || cc) : defaultLibelle;
    if (rht0 > 0) lines.push({ compte: '707200', montant: rht0, sens: 'C', libelle: lib });
    if (rht19 > 0) lines.push({ compte: '707219', montant: rht19, sens: 'C', libelle: lib });
  }
  if (tva19 > 0) lines.push({ compte: '436711', montant: tva19, sens: 'C' });
  lines.push({ compte: '437500', montant: timbres, sens: 'C' });
  if (avoir709 > 0) lines.push({ compte: '709500', montant: Math.round(avoir709 * 1000) / 1000, sens: 'D' });
  if (ecart !== 0) lines.push({ compte: '634500', montant: Math.abs(ecart), sens: ecart > 0 ? 'C' : 'D' });

  let anomaly = null;
  if (Math.abs(ecart) > 3) {
    anomaly = { date, error: 'ECART ' + ecart.toFixed(3) + 'DT > 3DT' };
  }
  return { lines, ecart, excluded: false, anomaly, totalHT0, totalHT19, tva19, timbres };
}

function parseVTCLines(text: string) {
  const DEBIT_ACCOUNTS = new Set(['411004', '411003', '411005', '709500']);
  const CREDIT_ACCOUNTS = new Set(['707100', '707119', '436710', '437500']);
  const allAccounts = [...DEBIT_ACCOUNTS, ...CREDIT_ACCOUNTS, '634500'];
  const entries: any[] = [];
  let currentFacNum: string | null = null;

  for (const line of text.split('\n')) {
    const facMatch = line.match(/FAC\s*(?:N[°o]?\s*)?(\d+[-\/]\d+)/i);
    if (facMatch) currentFacNum = facMatch[1].replace('-', '/');

    const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dateMatch) {
      const date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      for (const acct of allAccounts) {
        const acctRegex = new RegExp('\\b' + acct + '\\b\\s+(.+?)\\s+([\\d][\\d\\s]*[,\\.]\\d{1,3})\\s*$');
        const acctMatch = line.match(acctRegex);
        if (acctMatch) {
          const montant = parseFloat(acctMatch[2].replace(/\s/g, '').replace(',', '.'));
          if (isNaN(montant) || montant === 0) continue;
          const libelle = acctMatch[1].trim();
          entries.push({
            date, facNum: currentFacNum ? 'FAC ' + currentFacNum : null,
            compte: acct, compteLibelle: acct + ' ' + libelle, montant,
            libelle: libelle || 'CLIENTS PASSAGERS',
            sens: acct === '634500' ? 'D' : DEBIT_ACCOUNTS.has(acct) ? 'D' : 'C',
          });
        }
      }
    }
  }
  return entries;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return cors();

    try {
      // --- SEED DATA ---
      if (path === '/api/seed' && method === 'POST') {
        const existing = await env.DB.prepare('SELECT id FROM societes LIMIT 1').first();
        if (existing) return json({ ok: true, msg: 'Already seeded' });

        const sid = 'default_soc';
        await env.DB.prepare('INSERT INTO societes (id, raison_sociale) VALUES (?, ?)').bind(sid, 'Cabinet').run();
        const journaux = [['VE','Ventes'],['AC','Achats'],['BQ','Banque'],['CA','Caisse'],['OD','Operations Diverses'],['FISC','Declarations Fiscales']];
        for (const [c, l] of journaux) {
          await env.DB.prepare('INSERT INTO journaux (id, societe_id, code, libelle) VALUES (?, ?, ?, ?)').bind(genId(), sid, c, l).run();
        }
        const did = 'dossier_animal';
        await env.DB.prepare('INSERT INTO dossiers (id, societe_id, nom) VALUES (?, ?, ?)').bind(did, sid, 'ANIMAL').run();
        return json({ ok: true, msg: 'Seeded' });
      }

      // --- DASHBOARD ---
      if (path === '/api/dashboard' && method === 'GET') {
        const s = await env.DB.prepare('SELECT COUNT(*) as c FROM societes').first() as any;
        const d = await env.DB.prepare('SELECT COUNT(*) as c FROM dossiers').first() as any;
        const e = await env.DB.prepare('SELECT COUNT(*) as c FROM ecritures').first() as any;
        const recent = await env.DB.prepare('SELECT d.*, s.raison_sociale FROM dossiers d LEFT JOIN societes s ON d.societe_id = s.id ORDER BY d.created_at DESC LIMIT 10').all();
        const animal = await env.DB.prepare('SELECT id FROM dossiers WHERE nom = ?').bind('ANIMAL').first() as any;
        return json({ stats: { societes: s?.c || 0, dossiers: d?.c || 0, ecritures: e?.c || 0 }, recentDossiers: recent.results, animalDossierId: animal?.id || null });
      }

      // --- SOCIETES ---
      if (path === '/api/societes' && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM societes ORDER BY raison_sociale').all();
        return json(r.results);
      }
      if (path === '/api/societes' && method === 'POST') {
        const b = await request.json() as any;
        const id = genId();
        await env.DB.prepare('INSERT INTO societes (id, raison_sociale, matricule_fiscal) VALUES (?, ?, ?)').bind(id, b.raison_sociale, b.matricule_fiscal || null).run();
        return json({ id, ...b });
      }
      const delSocMatch = path.match(/^\/api\/societes\/([^/]+)$/);
      if (delSocMatch && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM societes WHERE id = ?').bind(delSocMatch[1]).run();
        return json({ ok: true });
      }

      // --- JOURNAUX ---
      const journauxMatch = path.match(/^\/api\/societes\/([^/]+)\/journaux$/);
      if (journauxMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM journaux WHERE societe_id = ?').bind(journauxMatch[1]).all();
        return json(r.results);
      }

      // --- DOSSIERS ---
      const dossiersListMatch = path.match(/^\/api\/societes\/([^/]+)\/dossiers$/);
      if (dossiersListMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM dossiers WHERE societe_id = ? ORDER BY created_at DESC').bind(dossiersListMatch[1]).all();
        return json(r.results);
      }
      if (dossiersListMatch && method === 'POST') {
        const b = await request.json() as any;
        const id = genId();
        await env.DB.prepare('INSERT INTO dossiers (id, societe_id, nom) VALUES (?, ?, ?)').bind(id, dossiersListMatch[1], b.nom).run();
        return json({ id, nom: b.nom, statut: 'brouillon' });
      }

      const dossierGetMatch = path.match(/^\/api\/dossiers\/([^/]+)$/);
      if (dossierGetMatch && method === 'GET') {
        const d = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(dossierGetMatch[1]).first();
        return d ? json(d) : json({ error: 'Non trouve' }, 404);
      }
      if (dossierGetMatch && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM dossiers WHERE id = ?').bind(dossierGetMatch[1]).run();
        return json({ ok: true });
      }

      // --- PIECES ---
      const piecesMatch = path.match(/^\/api\/dossiers\/([^/]+)\/pieces$/);
      if (piecesMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM pieces WHERE dossier_id = ? ORDER BY created_at').bind(piecesMatch[1]).all();
        return json(r.results);
      }

      // --- FACTURES ---
      const facturesMatch = path.match(/^\/api\/dossiers\/([^/]+)\/factures$/);
      if (facturesMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM factures WHERE dossier_id = ? ORDER BY date_facture, numero_facture').bind(facturesMatch[1]).all();
        return json(r.results);
      }
      if (facturesMatch && method === 'POST') {
        const b = await request.json() as any;
        const did = facturesMatch[1];
        const d = await env.DB.prepare('SELECT societe_id FROM dossiers WHERE id = ?').bind(did).first() as any;
        if (!d) return json({ error: 'Dossier non trouve' }, 404);
        const id = genId();
        await env.DB.prepare('INSERT INTO factures (id, dossier_id, societe_id, date_facture, numero_facture, client, total_ht_0, total_ht_19, tva_19, timbre, total_ttc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, did, d.societe_id, b.date_facture, b.numero_facture, b.client || '', b.total_ht_0 || 0, b.total_ht_19 || 0, b.tva_19 || 0, b.timbre || 1, b.total_ttc || 0).run();
        return json({ id, ...b });
      }
      const delFactMatch = path.match(/^\/api\/factures\/([^/]+)$/);
      if (delFactMatch && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM factures WHERE id = ?').bind(delFactMatch[1]).run();
        return json({ ok: true });
      }
      const delAllFactMatch = path.match(/^\/api\/dossiers\/([^/]+)\/factures$/);
      if (delAllFactMatch && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM factures WHERE dossier_id = ?').bind(delAllFactMatch[1]).run();
        await env.DB.prepare("DELETE FROM ecritures WHERE dossier_id = ? AND journal_code = 'VT J.C'").bind(delAllFactMatch[1]).run();
        return json({ ok: true });
      }

      // --- RAPPORT ---
      const rapportMatch = path.match(/^\/api\/dossiers\/([^/]+)\/rapport$/);
      if (rapportMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM rapport_modes WHERE dossier_id = ? ORDER BY date_jour').bind(rapportMatch[1]).all();
        return json(r.results);
      }
      if (rapportMatch && method === 'POST') {
        const b = await request.json() as any;
        const did = rapportMatch[1];
        const d = await env.DB.prepare('SELECT societe_id FROM dossiers WHERE id = ?').bind(did).first() as any;
        if (!d) return json({ error: 'Dossier non trouve' }, 404);
        const rows = b.rows || b;
        if (!Array.isArray(rows) || !rows.length) return json({ error: 'rows[] requis' }, 400);
        for (const r of rows) {
          const date = r.date_jour || r.date;
          await env.DB.prepare('INSERT OR REPLACE INTO rapport_modes (id, dossier_id, date_jour, especes, cheques, tpe, bonsAchat, avoir, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(genId(), did, date, r.especes || 0, r.cheques || 0, r.tpe || 0, r.bonsAchat || 0, r.avoir || 0, r.credit || 0).run();
        }
        return json({ ok: true, count: rows.length });
      }
      if (rapportMatch && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM rapport_modes WHERE dossier_id = ?').bind(rapportMatch[1]).run();
        return json({ ok: true });
      }

      // --- ECRITURES ---
      const ecrituresMatch = path.match(/^\/api\/dossiers\/([^/]+)\/ecritures$/);
      if (ecrituresMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM ecritures WHERE dossier_id = ? ORDER BY date_operation, journal_code').bind(ecrituresMatch[1]).all();
        return json(r.results);
      }
      if (ecrituresMatch && method === 'POST') {
        const b = await request.json() as any;
        const did = ecrituresMatch[1];
        const id = genId();
        await env.DB.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte, sens, montant, tresorerie, piece_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, did, b.societe_id, b.journal_code, b.date_operation, b.date_piece || null, b.numero_doc || null, b.libelle, b.compte, b.sens, b.montant, b.tresorerie || null, b.piece_id || null).run();
        return json({ id, ...b });
      }
      if (ecrituresMatch && method === 'DELETE') {
        const journal = url.searchParams.get('journal');
        if (journal) {
          await env.DB.prepare("DELETE FROM ecritures WHERE dossier_id = ? AND journal_code = ?").bind(ecrituresMatch[1], journal).run();
        } else {
          await env.DB.prepare('DELETE FROM ecritures WHERE dossier_id = ?').bind(ecrituresMatch[1]).run();
        }
        return json({ ok: true });
      }

      const delEcritMatch = path.match(/^\/api\/ecritures\/([^/]+)$/);
      if (delEcritMatch && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM ecritures WHERE id = ?').bind(delEcritMatch[1]).run();
        return json({ ok: true });
      }

      // --- GENERATE VT J.C ---
      const genMatch = path.match(/^\/api\/dossiers\/([^/]+)\/generate-vtjc$/);
      if (genMatch && method === 'POST') {
        const did = genMatch[1];
        const d = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(did).first() as any;
        if (!d) return json({ error: 'Dossier non trouve' }, 404);

        const facturesR = await env.DB.prepare('SELECT * FROM factures WHERE dossier_id = ? ORDER BY date_facture, numero_facture').bind(did).all();
        if (!facturesR.results.length) return json({ error: 'Aucune facture' }, 400);

        await env.DB.prepare("DELETE FROM ecritures WHERE dossier_id = ? AND journal_code = 'VT J.C'").bind(did).run();

        const byDay: Record<string, any[]> = {};
        for (const f of facturesR.results) {
          if (!byDay[f.date_facture as string]) byDay[f.date_facture as string] = [];
          byDay[f.date_facture as string].push(f);
        }

        const anomalies: any[] = [];
        const allEntries: any[] = [];

        for (const [date, dayFactures] of Object.entries(byDay)) {
          const nums = dayFactures.map((f: any) => f.numero_facture.replace(/[^0-9]/g, '')).sort((a: string, b: string) => a.localeCompare(b));
          const numPiece = nums.length === 1 ? 'FAC N' + nums[0] + '-26' : 'FAC N' + nums.join('-') + '-26';
          const clients = [...new Set(dayFactures.map((f: any) => f.client).filter(Boolean))];
          const defaultLibelle = clients.length > 0 ? 'CLTS PASSAGERS/' + clients.join('/') : 'CLTS PASSAGERS';

          const rapportR = await env.DB.prepare('SELECT especes, cheques, tpe, bonsAchat, avoir, credit FROM rapport_modes WHERE dossier_id = ? AND date_jour = ?').bind(did, date).first() as any;
          const modes = rapportR || { especes: 0, tpe: 0, cheques: 0, bonsAchat: 0, avoir: 0, credit: 0 };

          const result = buildDayEcritures(date, dayFactures, modes, defaultLibelle);
          if (result.excluded) {
            anomalies.push(result.anomaly);
            allEntries.push({ date, numPiece, excluded: true });
            continue;
          }
          if (result.anomaly) anomalies.push(result.anomaly);

          for (const l of result.lines) {
            await env.DB.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte, sens, montant, tresorerie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(genId(), did, d.societe_id, 'VT J.C', date, date, numPiece, l.libelle || defaultLibelle, l.compte, l.sens, l.montant, null).run();
          }
          allEntries.push({ date, numPiece, libelle: defaultLibelle, ecart: result.ecart, lignes: result.lines });
        }

        return json({ days: allEntries.length, entries: allEntries, anomalies });
      }

      // --- PROCESS VT C (text from browser) ---
      const vtcMatch = path.match(/^\/api\/dossiers\/([^/]+)\/process-vtc$/);
      if (vtcMatch && method === 'POST') {
        const did = vtcMatch[1];
        const d = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(did).first() as any;
        if (!d) return json({ error: 'Dossier non trouve' }, 404);

        const b = await request.json() as any;
        const text = b.text as string;
        if (!text) return json({ error: 'text requis' }, 400);

        await env.DB.prepare("DELETE FROM ecritures WHERE dossier_id = ? AND journal_code = 'VT C'").bind(did).run();

        const entries = parseVTCLines(text);
        for (const e of entries) {
          await env.DB.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte, sens, montant, tresorerie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(genId(), did, d.societe_id, 'VT C', e.date, e.date, e.facNum || '', e.compteLibelle || e.libelle, e.compte, e.sens, e.montant, null).run();
        }

        return json({ ok: true, totalEntries: entries.length });
      }

      // --- PROCESS FISC (text from browser) ---
      const fiscMatch = path.match(/^\/api\/dossiers\/([^/]+)\/process-fisc$/);
      if (fiscMatch && method === 'POST') {
        const did = fiscMatch[1];
        const d = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(did).first() as any;
        if (!d) return json({ error: 'Dossier non trouve' }, 404);

        const b = await request.json() as any;
        const dmi = b.dmi;
        if (!dmi) return json({ error: 'dmi requis' }, 400);

        // Delete existing FISC ecritures
        await env.DB.prepare("DELETE FROM ecritures WHERE dossier_id = ? AND journal_code = 'FISC'").bind(did).run();

        // Generate FISC ecritures from DMI data
        const fiscEntries = generateFISCecritures(dmi, did, d.societe_id);
        if (fiscEntries.error) return json({ error: fiscEntries.error }, 400);

        for (const e of fiscEntries.entries) {
          await env.DB.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte, sens, montant, tresorerie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(genId(), e.dossier_id, e.societe_id, e.journal_code, e.date_operation, e.date_piece, e.numero_doc, e.libelle, e.compte, e.sens, e.montant, e.tresorerie).run();
        }

        return json({ ok: true, entriesCount: fiscEntries.entries.length });
      }

      // --- EXPORT CSV ---
      const exportMatch = path.match(/^\/api\/dossiers\/([^/]+)\/export$/);
      if (exportMatch && method === 'GET') {
        const journal = url.searchParams.get('journal');
        let rows;
        if (journal) {
          rows = await env.DB.prepare('SELECT * FROM ecritures WHERE dossier_id = ? AND journal_code = ? ORDER BY date_operation, compte').bind(exportMatch[1], journal).all();
        } else {
          rows = await env.DB.prepare('SELECT * FROM ecritures WHERE dossier_id = ? ORDER BY date_operation, journal_code, compte').bind(exportMatch[1]).all();
        }
        const header = 'N° pièce;Date pièce;Journal;Libellé;N° compte;Libellé trésorerie;Débit;Crédit';
        const lines: string[] = [];
        let totalD = 0, totalC = 0;

        for (const e of rows.results) {
          const sens = e.sens || 'D';
          const montant = e.montant as number;
          if (!e.date_operation) continue;
          if (montant === 0) continue;
          if (sens === 'D') totalD += montant; else totalC += montant;

          const fmt = (d: string) => { if (d?.includes('-')) { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; } return d || ''; };
          lines.push([
            e.numero_doc || '', fmt(e.date_operation as string), e.journal_code || '', e.libelle || '',
            e.compte || '', e.tresorerie || '',
            e.sens === 'D' ? montant.toFixed(3) : '0.000',
            e.sens === 'C' ? montant.toFixed(3) : '0.000'
          ].join(';'));
        }

        return new Response([header, ...lines].join('\n'), {
          headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ecritures_${exportMatch[1]}.csv"`, 'Access-Control-Allow-Origin': '*' },
        });
      }

      // --- EXCLUDED (analyse) ---
      const excludedMatch = path.match(/^\/api\/dossiers\/([^/]+)\/excluded$/);
      if (excludedMatch && method === 'GET') {
        const did = excludedMatch[1];
        const facturesR = await env.DB.prepare('SELECT * FROM factures WHERE dossier_id = ? ORDER BY date_facture').bind(did).all();
        const byDay: Record<string, any[]> = {};
        for (const f of facturesR.results) {
          if (!byDay[f.date_facture as string]) byDay[f.date_facture as string] = [];
          byDay[f.date_facture as string].push(f);
        }
        const results: any[] = [];
        for (const [date, dayFactures] of Object.entries(byDay)) {
          const rapportR = await env.DB.prepare('SELECT * FROM rapport_modes WHERE dossier_id = ? AND date_jour = ?').bind(did, date).first() as any;
          const modes = rapportR || { especes: 0, tpe: 0, cheques: 0, bonsAchat: 0, avoir: 0, credit: 0 };
          const r = buildDayEcritures(date, dayFactures, modes, 'CLTS PASSAGERS');
          const ht0 = dayFactures.reduce((s: number, f: any) => s + (f.total_ht_0 || 0), 0);
          const ht19 = dayFactures.reduce((s: number, f: any) => s + (f.total_ht_19 || 0), 0);
          const tva = dayFactures.reduce((s: number, f: any) => s + (f.tva_19 || 0), 0);
          const ttc = dayFactures.reduce((s: number, f: any) => s + (f.total_ttc || 0), 0);
          const timbres = dayFactures.reduce((s: number, f: any) => s + (f.timbre || 1), 0);
          const debitSum = (modes.especes || 0) + (modes.tpe || 0) + (modes.cheques || 0) + (modes.bonsAchat || 0) + (modes.avoir || 0);
          const creditSum = tva + timbres + ht0 + ht19;
          const ecart = Math.round((debitSum - creditSum) * 1000) / 1000;
          results.push({
            date, ecart, excluded: EXCLUDED_DAYS.has(date),
            totalFactures: ttc, totalModes: (modes.especes || 0) + (modes.tpe || 0) + (modes.cheques || 0) + (modes.bonsAchat || 0) + (modes.avoir || 0) + (modes.credit || 0),
            nbFactures: dayFactures.length,
            modes: { especes: modes.especes || 0, cheques: modes.cheques || 0, tpe: modes.tpe || 0, bonsAchat: modes.bonsAchat || 0, avoir: modes.avoir || 0, credit: modes.credit || 0 },
            factures: dayFactures.map((f: any) => ({ num: f.numero_facture, client: f.client, ht0: f.total_ht_0 || 0, ht19: f.total_ht_19 || 0, tva: f.tva_19 || 0, ttc: f.total_ttc || 0 })),
            proposedEcritures: r.excluded ? [] : r.lines.map((l: any) => ({ compte: l.compte, sens: l.sens, montant: l.montant, libelle: l.libelle })),
          });
        }
        return json(results);
      }

      // --- AI VERIFY ---
      const aiMatch = path.match(/^\/api\/dossiers\/([^/]+)\/verify-ai$/);
      if (aiMatch && method === 'POST') {
        const did = aiMatch[1];
        const ecrituresR = await env.DB.prepare('SELECT * FROM ecritures WHERE dossier_id = ? AND journal_code = ? ORDER BY numero_doc, compte').bind(did, 'FISC').all();
        if (!ecrituresR.results.length) return json({ error: 'Aucune ecriture FISC' }, 400);

        const ecrituresText = ecrituresR.results.map(e =>
          `${e.numero_doc} | ${e.date_piece} | ${e.journal_code} | ${e.libelle} | ${e.compte} | ${e.tresorerie || ''} | ${e.sens}=${e.montant}`
        ).join('\n');

        const prompt = `Tu es un expert-comptable tunisien. Verifie ces ecritures FISC.

REGLES:
- Piece A: 457100 D = total_general, tous autres = CREDIT
- Piece B: 661100 D = 437300 C
- Piece C: 661200 D = 437200 C
- Piece D: 661300 D = 437400 C
- Piece E: 436710 D = TVA collectee, 436660 C = TVA deductible, 436670 C = TVA report

ECRITURES:
${ecrituresText}

JSON: {"verdict":"OK/ERREUR","score":0-100,"checks":[{"name":"detail","status":"ok/error","detail":"..."}],"summary":"..."}`;

        let aiResponse: any;
        try {
          aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: 'Reponds toujours en JSON valide.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.1,
          });
        } catch (aiErr: any) {
          return json({ error: 'Workers AI error: ' + aiErr.message }, 500);
        }

        // Handle different response formats from Workers AI
        let report;
        try {
          const raw = aiResponse?.response || aiResponse?.result?.response || aiResponse;
          if (typeof raw === 'object' && raw?.verdict) {
            report = raw;
          } else if (typeof raw === 'string') {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            report = jsonMatch ? JSON.parse(jsonMatch[0]) : { verdict: 'ATTENTION', score: 0, checks: [], summary: raw };
          } else {
            report = { verdict: 'ATTENTION', score: 0, checks: [], summary: JSON.stringify(raw) };
          }
        } catch {
          report = { verdict: 'ATTENTION', score: 0, checks: [], summary: 'Parse error' };
        }

        return json({ ok: true, report, ecrituresCount: ecrituresR.results.length });
      }

      // ============================================================
      // BAUD — PAYROLL AUTOMATION
      // ============================================================

      // --- BAUD: SOCIETES PAIE ---
      if (path === '/api/baud/societes' && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM societes_paie ORDER BY nom').all();
        return json(r.results);
      }
      if (path === '/api/baud/societes' && method === 'POST') {
        const b = await request.json() as any;
        const id = genId();
        await env.DB.prepare('INSERT INTO societes_paie (id, nom, matricule_fiscal, activite) VALUES (?, ?, ?, ?)').bind(id, b.nom, b.matricule_fiscal || null, b.activite || null).run();
        return json({ id, ...b });
      }
      const delBaudSocMatch = path.match(/^\/api\/baud\/societes\/([^/]+)$/);
      if (delBaudSocMatch && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM societes_paie WHERE id = ?').bind(delBaudSocMatch[1]).run();
        return json({ ok: true });
      }
      if (delBaudSocMatch && method === 'PUT') {
        const b = await request.json() as any;
        const fields: string[] = [];
        const values: unknown[] = [];
        for (const [k, v] of Object.entries(b)) {
          if (['nom', 'matricule_fiscal', 'activite', 'sage_code_dossier', 'navette_format_notes'].includes(k)) {
            fields.push(`${k} = ?`);
            values.push(v);
          }
        }
        if (fields.length === 0) return json({ error: 'Aucun champ' });
        values.push(delBaudSocMatch[1]);
        await env.DB.prepare(`UPDATE societes_paie SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values).run();
        return await env.DB.prepare('SELECT * FROM societes_paie WHERE id = ?').bind(delBaudSocMatch[1]).first();
      }

      // --- BAUD: SALARIES ---
      const baudSalMatch = path.match(/^\/api\/baud\/societes\/([^/]+)\/salaries$/);
      if (baudSalMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM salaries_paie WHERE societe_id = ? ORDER BY matricule').bind(baudSalMatch[1]).all();
        return json(r.results);
      }
      if (baudSalMatch && method === 'POST') {
        const b = await request.json() as any;
        const id = genId();
        await env.DB.prepare('INSERT INTO salaries_paie (id, societe_id, matricule, nom, prenom, civilite, date_naissance, date_embauche, poste, type_contrat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, baudSalMatch[1], b.matricule, b.nom, b.prenom || null, b.civilite || null, b.date_naissance || null, b.date_embauche || null, b.poste || null, b.type_contrat || null).run();
        return json({ id, ...b });
      }
      const baudSalUpdateMatch = path.match(/^\/api\/baud\/salaries\/([^/]+)$/);
      if (baudSalUpdateMatch && method === 'PUT') {
        const b = await request.json() as any;
        const fields: string[] = [];
        const values: unknown[] = [];
        for (const [k, v] of Object.entries(b)) {
          if (['matricule', 'nom', 'prenom', 'civilite', 'date_naissance', 'date_embauche', 'poste', 'type_contrat', 'statut'].includes(k)) {
            fields.push(`${k} = ?`);
            values.push(v);
          }
        }
        if (fields.length === 0) return json({ error: 'Aucun champ' });
        values.push(baudSalUpdateMatch[1]);
        await env.DB.prepare(`UPDATE salaries_paie SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values).run();
        return await env.DB.prepare('SELECT * FROM salaries_paie WHERE id = ?').bind(baudSalUpdateMatch[1]).first();
      }

      // --- BAUD: RUBRIQUES ---
      const baudRubMatch = path.match(/^\/api\/baud\/societes\/([^/]+)\/rubriques$/);
      if (baudRubMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM rubriques_paie WHERE societe_id = ? AND actif = 1 ORDER BY ordre, code').bind(baudRubMatch[1]).all();
        return json(r.results);
      }
      if (baudRubMatch && method === 'POST') {
        const b = await request.json() as any;
        const id = genId();
        await env.DB.prepare('INSERT OR REPLACE INTO rubriques_paie (id, societe_id, code, libelle, type, zone, navette_aliases, valeur_defaut, ordre) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, baudRubMatch[1], b.code, b.libelle, b.type || 'rubrique', b.zone || '0', b.navette_aliases || null, b.valeur_defaut || null, b.ordre || 0).run();
        return json({ id, ...b });
      }

      // --- BAUD: DOSSIERS PAIE ---
      const baudDossiersListMatch = path.match(/^\/api\/baud\/societes\/([^/]+)\/dossiers$/);
      if (baudDossiersListMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM dossiers_paie WHERE societe_id = ? ORDER BY annee DESC, mois DESC').bind(baudDossiersListMatch[1]).all();
        return json(r.results);
      }
      if (baudDossiersListMatch && method === 'POST') {
        const b = await request.json() as any;
        const id = genId();
        await env.DB.prepare('INSERT INTO dossiers_paie (id, societe_id, mois, annee) VALUES (?, ?, ?, ?)').bind(id, baudDossiersListMatch[1], b.mois, b.annee).run();
        return json({ id, mois: b.mois, annee: b.annee, statut: 'brouillon' });
      }
      const baudDossierGetMatch = path.match(/^\/api\/baud\/dossiers\/([^/]+)$/);
      if (baudDossierGetMatch && method === 'GET') {
        const d = await env.DB.prepare('SELECT * FROM dossiers_paie WHERE id = ?').bind(baudDossierGetMatch[1]).first();
        return d ? json(d) : json({ error: 'Non trouve' }, 404);
      }

      // --- BAUD: UPLOAD FICHE NAVETTE (auto-extract) ---
      const baudUploadMatch = path.match(/^\/api\/baud\/dossiers\/([^/]+)\/upload$/);
      if (baudUploadMatch && method === 'POST') {
        const did = baudUploadMatch[1];
        try {
          const dossier = await env.DB.prepare('SELECT * FROM dossiers_paie WHERE id = ?').bind(did).first() as any;
          if (!dossier) return json({ error: 'Dossier non trouve' }, 404);
          const b = await request.json() as any;
          const { filename, lignes } = b;
          if (!filename || !Array.isArray(lignes)) return json({ error: 'filename et lignes requis' }, 400);

          // Store raw data
          await env.DB.prepare("UPDATE dossiers_paie SET fichier_navette_nom = ?, extraction_json = ?, updated_at = datetime('now') WHERE id = ?").bind(filename, JSON.stringify({ lignes }), did).run();

          // Auto-extract
          await env.DB.prepare('DELETE FROM lignes_extraites WHERE dossier_id = ?').bind(did).run();
          const salariesR = await env.DB.prepare('SELECT * FROM salaries_paie WHERE societe_id = ?').bind(dossier.societe_id).all();
          const correctionsR = await env.DB.prepare('SELECT * FROM corrections WHERE societe_id = ? ORDER BY hit_count DESC').bind(dossier.societe_id).all();
          const corrList = correctionsR.results as any[];
          const insertLigne = env.DB.prepare('INSERT INTO lignes_extraites (id, dossier_id, salary_id, matricule, nom_prenom, type_ligne, champs, rubrique_code, zone, valeur, source_feuille, source_plage, confiance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          const batch: D1PreparedStatement[] = [];
          const corrHits: string[] = [];

          for (const raw of lignes) {
            try {
              const cells = Array.isArray(raw?.champs) ? raw.champs : [];
              let matricule = '';
              let nomPrenom = '';
              for (const cell of cells) {
                const trimmed = String(cell ?? '').trim();
                if (/^\d{2,6}$/.test(trimmed) && !matricule) { matricule = trimmed; continue; }
                if (trimmed.length > 3 && /[a-zA-Z]/.test(trimmed) && !nomPrenom && !matricule) { nomPrenom = trimmed; }
              }

              let rubrique_code: string | null = null;
              let zone: string | null = null;
              let valeur: number | null = null;
              const rowKey = cells.join('|');
              for (const corr of corrList) {
                try {
                  if (corr.source_pattern && rowKey.includes(corr.source_pattern)) {
                    if (corr.field === 'rubrique_code') { rubrique_code = corr.new_value; corrHits.push(corr.id); }
                    if (corr.field === 'zone') { zone = corr.new_value; corrHits.push(corr.id); }
                    if (corr.field === 'valeur') { const v = parseFloat(corr.new_value); if (!isNaN(v)) { valeur = v; corrHits.push(corr.id); } }
                  }
                  if (corr.field === 'matricule' && corr.old_value && matricule === corr.old_value) {
                    matricule = corr.new_value; corrHits.push(corr.id);
                  }
                } catch { /* skip bad correction */ }
              }

              const salaryMatch = matricule ? (salariesR.results as any[]).find(s => s.matricule === matricule) : null;
              batch.push(insertLigne.bind(genId(), did, salaryMatch?.id || null, matricule || null, nomPrenom || null, 'variable', JSON.stringify(cells), rubrique_code, zone, valeur, raw.source_feuille || null, raw.source_ligne ? String(raw.source_ligne) : null, null));
            } catch { /* skip bad row */ }
          }

          // Batch insert (chunks of 50)
          for (let i = 0; i < batch.length; i += 50) {
            try { await env.DB.batch(batch.slice(i, i + 50)); } catch { /* skip bad chunk */ }
          }

          // Update correction hit counts
          const uniqueHits = [...new Set(corrHits)];
          for (const cid of uniqueHits) {
            try { await env.DB.prepare('UPDATE corrections SET hit_count = hit_count + 1 WHERE id = ?').bind(cid).run(); } catch {}
          }

          await env.DB.prepare("UPDATE dossiers_paie SET statut = 'controle', extraction_confiance = 1, updated_at = datetime('now') WHERE id = ?").bind(did).run();
          return json({ ok: true, fichier_nom: filename, lignes_count: batch.length, corrections_applied: uniqueHits.length });
        } catch (e: any) {
          return json({ error: 'Upload echoue: ' + (e.message || e) }, 500);
        }
      }

      // --- BAUD: EXTRACT — stores raw uploaded rows as lignes ---
      const baudExtractMatch = path.match(/^\/api\/baud\/dossiers\/([^/]+)\/extract$/);
      if (baudExtractMatch && method === 'POST') {
        const did = baudExtractMatch[1];
        try {
          const dossier = await env.DB.prepare('SELECT * FROM dossiers_paie WHERE id = ?').bind(did).first() as any;
          if (!dossier) return json({ error: 'Dossier non trouve' }, 404);
          const extractionJson = dossier.extraction_json ? JSON.parse(dossier.extraction_json) : null;
          if (!extractionJson?.lignes) return json({ error: 'Upload d\'abord' }, 400);

          await env.DB.prepare('DELETE FROM lignes_extraites WHERE dossier_id = ?').bind(did).run();
          const rawLignes = extractionJson.lignes as any[];
          const salariesR = await env.DB.prepare('SELECT * FROM salaries_paie WHERE societe_id = ?').bind(dossier.societe_id).all();
          const correctionsR = await env.DB.prepare('SELECT * FROM corrections WHERE societe_id = ? ORDER BY hit_count DESC').bind(dossier.societe_id).all();
          const corrList = correctionsR.results as any[];
          const insertLigne = env.DB.prepare('INSERT INTO lignes_extraites (id, dossier_id, salary_id, matricule, nom_prenom, type_ligne, champs, rubrique_code, zone, valeur, source_feuille, source_plage, confiance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          const batch: D1PreparedStatement[] = [];
          const corrHits: string[] = [];

          for (const raw of rawLignes) {
            try {
              const cells = Array.isArray(raw?.champs) ? raw.champs : [];
              let matricule = '';
              let nomPrenom = '';
              for (const cell of cells) {
                const trimmed = String(cell ?? '').trim();
                if (/^\d{2,6}$/.test(trimmed) && !matricule) { matricule = trimmed; continue; }
                if (trimmed.length > 3 && /[a-zA-Z]/.test(trimmed) && !nomPrenom && !matricule) { nomPrenom = trimmed; }
              }

              let rubrique_code: string | null = null;
              let zone: string | null = null;
              let valeur: number | null = null;
              const rowKey = cells.join('|');
              for (const corr of corrList) {
                try {
                  if (corr.source_pattern && rowKey.includes(corr.source_pattern)) {
                    if (corr.field === 'rubrique_code') { rubrique_code = corr.new_value; corrHits.push(corr.id); }
                    if (corr.field === 'zone') { zone = corr.new_value; corrHits.push(corr.id); }
                    if (corr.field === 'valeur') { const v = parseFloat(corr.new_value); if (!isNaN(v)) { valeur = v; corrHits.push(corr.id); } }
                  }
                  if (corr.field === 'matricule' && corr.old_value && matricule === corr.old_value) {
                    matricule = corr.new_value; corrHits.push(corr.id);
                  }
                } catch {}
              }

              const salaryMatch = matricule ? (salariesR.results as any[]).find(s => s.matricule === matricule) : null;
              batch.push(insertLigne.bind(genId(), did, salaryMatch?.id || null, matricule || null, nomPrenom || null, 'variable', JSON.stringify(cells), rubrique_code, zone, valeur, raw.source_feuille || null, raw.source_ligne ? String(raw.source_ligne) : null, null));
            } catch {}
          }

          for (let i = 0; i < batch.length; i += 50) {
            try { await env.DB.batch(batch.slice(i, i + 50)); } catch {}
          }

          const uniqueHits = [...new Set(corrHits)];
          for (const cid of uniqueHits) {
            try { await env.DB.prepare('UPDATE corrections SET hit_count = hit_count + 1 WHERE id = ?').bind(cid).run(); } catch {}
          }

          await env.DB.prepare("UPDATE dossiers_paie SET statut = 'controle', extraction_confiance = 1, updated_at = datetime('now') WHERE id = ?").bind(did).run();
          return json({ ok: true, lignes_count: batch.length, corrections_applied: uniqueHits.length });
        } catch (e: any) {
          return json({ error: 'Extract echoue: ' + (e.message || e) }, 500);
        }
      }

      // --- BAUD: LIGNES ---
      const baudLignesMatch = path.match(/^\/api\/baud\/dossiers\/([^/]+)\/lignes$/);
      if (baudLignesMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM lignes_extraites WHERE dossier_id = ? ORDER BY created_at').bind(baudLignesMatch[1]).all();
        return json(r.results);
      }
      const baudLigneUpdateMatch = path.match(/^\/api\/baud\/lignes\/([^/]+)$/);
      if (baudLigneUpdateMatch && method === 'PUT') {
        const ligneId = baudLigneUpdateMatch[1];
        const oldLigne = await env.DB.prepare('SELECT * FROM lignes_extraites WHERE id = ?').bind(ligneId).first() as any;
        if (!oldLigne) return json({ error: 'Ligne non trouvee' }, 404);

        const b = await request.json() as any;
        const fields: string[] = [];
        const values: unknown[] = [];
        for (const [k, v] of Object.entries(b)) {
          if (['statut', 'matricule', 'rubrique_code', 'zone', 'valeur', 'champs'].includes(k)) {
            fields.push(`${k} = ?`);
            values.push(k === 'champs' ? JSON.stringify(v) : v);
          }
        }
        if (fields.length === 0) return json({ error: 'Aucun champ' });
        values.push(ligneId);
        await env.DB.prepare(`UPDATE lignes_extraites SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

        // Store corrections for AI learning
        const learnFields = ['matricule', 'rubrique_code', 'zone', 'valeur'];
        const dossier = await env.DB.prepare('SELECT societe_id FROM dossiers_paie WHERE id = ?').bind(oldLigne.dossier_id).first() as any;
        if (dossier) {
          for (const f of learnFields) {
            if (b[f] !== undefined && b[f] !== oldLigne[f] && b[f] !== '' && b[f] !== null) {
              const oldVal = String(oldLigne[f] || '');
              const newVal = String(b[f]);
              const cells = JSON.parse(oldLigne.champs || '[]');
              const sourcePattern = cells.length > 2 ? cells.slice(0, 3).join('|') : null;
              await env.DB.prepare('INSERT INTO corrections (id, societe_id, field, old_value, new_value, source_pattern) VALUES (?, ?, ?, ?, ?, ?)').bind(genId(), dossier.societe_id, f, oldVal, newVal, sourcePattern).run();
            }
          }
        }

        return await env.DB.prepare('SELECT * FROM lignes_extraites WHERE id = ?').bind(ligneId).first();
      }

      // --- BAUD: VALIDER ---
      const baudValiderMatch = path.match(/^\/api\/baud\/dossiers\/([^/]+)\/valider$/);
      if (baudValiderMatch && method === 'POST') {
        await env.DB.prepare("UPDATE dossiers_paie SET statut = 'valide', updated_at = datetime('now') WHERE id = ?").bind(baudValiderMatch[1]).run();
        return json({ ok: true });
      }

      // --- BAUD: CORRECTIONS (AI learning) ---
      const baudCorrMatch = path.match(/^\/api\/baud\/societes\/([^/]+)\/corrections$/);
      if (baudCorrMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM corrections WHERE societe_id = ? ORDER BY hit_count DESC').bind(baudCorrMatch[1]).all();
        return json(r.results);
      }
      const baudCorrDelMatch = path.match(/^\/api\/baud\/corrections\/([^/]+)$/);
      if (baudCorrDelMatch && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM corrections WHERE id = ?').bind(baudCorrDelMatch[1]).run();
        return json({ ok: true });
      }

      // --- BAUD: EXPORT GA (generate XLSX as base64) ---
      const baudExportMatch = path.match(/^\/api\/baud\/dossiers\/([^/]+)\/export$/);
      if (baudExportMatch && method === 'POST') {
        const did = baudExportMatch[1];
        const dossier = await env.DB.prepare('SELECT * FROM dossiers_paie WHERE id = ?').bind(did).first() as any;
        if (!dossier) return json({ error: 'Dossier non trouve' }, 404);

        const lignesR = await env.DB.prepare('SELECT * FROM lignes_extraites WHERE dossier_id = ? AND statut != ? ORDER BY matricule, rubrique_code').bind(did, 'ignore').all();
        if (!lignesR.results.length) return json({ error: 'Aucune ligne valide' }, 400);

        const salariesR = await env.DB.prepare('SELECT * FROM salaries_paie WHERE societe_id = ?').bind(dossier.societe_id).all();
        const rubriquesR = await env.DB.prepare('SELECT * FROM rubriques_paie WHERE societe_id = ? AND actif = 1').bind(dossier.societe_id).all();
        const rubMap: Record<string, any> = {};
        for (const r of rubriquesR.results) rubMap[r.code as string] = r;

        // Build Import Salariés rows
        const salRows: any[][] = [['Matricule', 'Nom', 'Prénom', 'Civilité', 'Date de naissance', 'Date d\'embauche', 'Poste', 'Type de contrat']];
        const seen = new Set<string>();
        for (const l of lignesR.results) {
          const mat = l.matricule as string;
          if (!mat || seen.has(mat)) continue;
          seen.add(mat);
          const sal = (salariesR.results as any[]).find(s => s.matricule === mat);
          salRows.push([
            mat, sal?.nom || '', sal?.prenom || '', sal?.civilite || '',
            sal?.date_naissance || '', sal?.date_embauche || '', sal?.poste || '', sal?.type_contrat || ''
          ]);
        }

        // Build Import Variables rows
        const varRows: any[][] = [['Matricule', 'Rubrique ou Constante', 'Zone', 'Valeur']];
        for (const l of lignesR.results) {
          const rub = rubMap[l.rubrique_code as string];
          const zone = l.zone || rub?.zone || '0';
          varRows.push([l.matricule || '', l.rubrique_code || '', String(zone), l.valeur != null ? String(l.valeur) : '']);
        }

        // Generate XLSX as base64 using dynamic import
        let salB64 = '', varB64 = '';
        try {
          const XLSXMod = await import('xlsx');
          const XLSX = XLSXMod.default || XLSXMod;

          const salWb = XLSX.utils.book_new();
          const salWs = XLSX.utils.aoa_to_sheet(salRows);
          XLSX.utils.book_append_sheet(salWb, salWs, 'Salariés');
          salB64 = XLSX.write(salWb, { type: 'base64', bookType: 'xlsx' });

          const varWb = XLSX.utils.book_new();
          const varWs = XLSX.utils.aoa_to_sheet(varRows);
          XLSX.utils.book_append_sheet(varWb, varWs, 'Variables');
          varB64 = XLSX.write(varWb, { type: 'base64', bookType: 'xlsx' });
        } catch {
          return json({ error: 'xlsx non disponible' }, 500);
        }

        const moisStr = String(dossier.mois).padStart(2, '0');
        const annStr = String(dossier.annee).slice(-2);
        const salName = `ImportSalariés_${moisStr}-${annStr}.xlsx`;
        const varName = `ImportVariables_${moisStr}-${annStr}.xlsx`;

        // Store exports
        const salId = genId(), varId = genId();
        await env.DB.prepare('INSERT INTO imports_ga (id, dossier_id, type_import, fichier_nom, fichier_base64, nb_lignes) VALUES (?, ?, ?, ?, ?, ?)').bind(salId, did, 'salaries', salName, salB64, salRows.length - 1).run();
        await env.DB.prepare('INSERT INTO imports_ga (id, dossier_id, type_import, fichier_nom, fichier_base64, nb_lignes) VALUES (?, ?, ?, ?, ?, ?)').bind(varId, did, 'variables', varName, varB64, varRows.length - 1).run();

        return json({ ok: true, exports: [
          { id: salId, type: 'salaries', fichier_nom: salName, nb_lignes: salRows.length - 1 },
          { id: varId, type: 'variables', fichier_nom: varName, nb_lignes: varRows.length - 1 },
        ]});
      }

      // --- BAUD: LIST EXPORTS ---
      const baudExportsListMatch = path.match(/^\/api\/baud\/dossiers\/([^/]+)\/exports$/);
      if (baudExportsListMatch && method === 'GET') {
        const r = await env.DB.prepare('SELECT id, type_import, fichier_nom, nb_lignes, statut, created_at FROM imports_ga WHERE dossier_id = ? ORDER BY created_at').bind(baudExportsListMatch[1]).all();
        return json(r.results);
      }

      // --- BAUD: DOWNLOAD EXPORT ---
      const baudDownloadMatch = path.match(/^\/api\/baud\/exports\/([^/]+)\/download$/);
      if (baudDownloadMatch && method === 'GET') {
        const exp = await env.DB.prepare('SELECT * FROM imports_ga WHERE id = ?').bind(baudDownloadMatch[1]).first() as any;
        if (!exp) return json({ error: 'Export non trouve' }, 404);
        const b64 = exp.fichier_base64 as string;
        const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return new Response(bin, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${exp.fichier_nom}"`,
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      return json({ error: 'Not found: ' + path }, 404);
    } catch (e: any) {
      return json({ error: e.message || 'Internal error' }, 500);
    }
  },
};

// --- FISC ECRITURES GENERATOR ---
function generateFISCecritures(dmi: any, dossierId: string, societeId: string) {
  const { retenue_salaires, css, retenue_loyers, retenue_marches, tfp_du, foprolos_du, timbre_fiscal, tcl_du, total_general, tva_collectee, tva_deductible, tva_report_precedent, tva_resultat, tva_signe, mois, annee } = dmi;

  if (!total_general || total_general <= 0) return { error: 'total_general invalide' };

  const formatDate = (m: number, y: number) => `${y}-${String(m).padStart(2, '0')}-21`;
  const datePiece = formatDate(mois, annee);
  const numeroDoc = `DMI ${String(mois).padStart(2, '0')}-${String(annee).slice(-2)}`;

  const entries: any[] = [];
  const add = (compte: string, sens: string, montant: number, libelle: string, tresorerie?: string) => {
    if (Math.abs(montant) > 0.001) {
      entries.push({ dossier_id: dossierId, societe_id: societeId, journal_code: 'FISC', date_operation: datePiece, date_piece: datePiece, numero_doc: numeroDoc, libelle, compte, sens, montant: Math.round(montant * 1000) / 1000, tresorerie: tresorerie || null });
    }
  };

  // Piece A
  add('457100', 'D', total_general, 'Constatation oblig fiscales');
  if ((retenue_salaires || 0) > 0) add('432100', 'C', retenue_salaires, 'retenue salaires');
  if ((css || 0) > 0) add('432101', 'C', css, 'CSS');
  if ((retenue_loyers || 0) > 0) add('432300', 'C', retenue_loyers, 'retenue loyers');
  if ((retenue_marches || 0) > 0) add('432400', 'C', retenue_marches, 'retenue marches');
  if ((tfp_du || 0) > 0) add('437300', 'C', tfp_du, 'TFP');
  if ((foprolos_du || 0) > 0) add('437200', 'C', foprolos_du, 'FOPROLOS');
  if ((timbre_fiscal || 0) > 0) add('437500', 'C', timbre_fiscal, 'timbre fiscal');
  if ((tcl_du || 0) > 0) add('437400', 'C', tcl_du, 'TCL');
  if ((tva_resultat || 0) > 0) add('436510', 'C', tva_resultat, 'TVA resultat');

  // Piece B - TFP
  if ((tfp_du || 0) > 0) { add('661100', 'D', tfp_du, 'TFP'); add('437300', 'C', tfp_du, 'TFP'); }

  // Piece C - FOPROLOS
  if ((foprolos_du || 0) > 0) { add('661200', 'D', foprolos_du, 'FOPROLOS'); add('437200', 'C', foprolos_du, 'FOPROLOS'); }

  // Piece D - TCL
  if ((tcl_du || 0) > 0) { add('661300', 'D', tcl_du, 'TCL'); add('437400', 'C', tcl_du, 'TCL'); }

  // Piece E - RECLASS TVA
  if ((tva_collectee || 0) > 0) add('436710', 'D', tva_collectee, 'TVA collectee');
  if ((tva_deductible || 0) > 0) add('436660', 'C', tva_deductible, 'TVA deductible');
  if ((tva_report_precedent || 0) > 0) {
    if (tva_signe === 'ف') {
      add('436670', 'D', tva_report_precedent, 'TVA report precedent');
    } else {
      add('436670', 'C', tva_report_precedent, 'TVA report precedent');
    }
  }
  if ((tva_resultat || 0) > 0) {
    if (tva_signe === 'ب') {
      add('436510', 'C', tva_resultat, 'TVA resultat');
    } else {
      add('436510', 'D', tva_resultat, 'TVA resultat');
    }
  }

  return { entries, dmi };
}
