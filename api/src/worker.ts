import { Env, Societe, Journal, Dossier, Piece, Ecriture } from './types';
import { json, error, generateId } from './utils';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const p = url.pathname;
    const m = request.method;

    if (m === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': 'Content-Type' } });

    try {
      // --- SOCIETES ---
      if (p === '/api/societes' && m === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM societes ORDER BY raison_sociale').all();
        return json(results);
      }
      if (p === '/api/societes' && m === 'POST') {
        const b = await request.json() as any;
        const id = generateId();
        await env.DB.prepare('INSERT INTO societes (id, raison_sociale, matricule_fiscal) VALUES (?, ?, ?)').bind(id, b.raison_sociale, b.matricule_fiscal || null).run();
        for (const j of [{ c: 'VE', l: 'Ventes' }, { c: 'AC', l: 'Achats' }, { c: 'BQ', l: 'Banque' }, { c: 'CA', l: 'Caisse' }, { c: 'OD', l: 'Operations Diverses' }]) {
          await env.DB.prepare('INSERT INTO journaux (id, societe_id, code, libelle) VALUES (?, ?, ?, ?)').bind(generateId(), id, j.c, j.l).run();
        }
        return json({ id, ...b }, 201);
      }
      if (p.match(/^\/api\/societes\/[^/]+$/) && m === 'DELETE') {
        await env.DB.prepare('DELETE FROM societes WHERE id = ?').bind(p.split('/').pop()!).run();
        return json({ ok: true });
      }

      // --- JOURNAUX ---
      if (p.match(/^\/api\/societes\/[^/]+\/journaux$/) && m === 'GET') {
        const sid = p.split('/')[3];
        const { results } = await env.DB.prepare('SELECT * FROM journaux WHERE societe_id = ?').bind(sid).all();
        return json(results);
      }
      if (p.match(/^\/api\/societes\/[^/]+\/journaux$/) && m === 'POST') {
        const sid = p.split('/')[3];
        const b = await request.json() as any;
        const id = generateId();
        await env.DB.prepare('INSERT INTO journaux (id, societe_id, code, libelle) VALUES (?, ?, ?, ?)').bind(id, sid, b.code, b.libelle).run();
        return json({ id, ...b }, 201);
      }

      // --- DOSSIERS ---
      if (p.match(/^\/api\/societes\/[^/]+\/dossiers$/) && m === 'GET') {
        const sid = p.split('/')[3];
        const { results } = await env.DB.prepare('SELECT * FROM dossiers WHERE societe_id = ? ORDER BY created_at DESC').bind(sid).all();
        return json(results);
      }
      if (p.match(/^\/api\/societes\/[^/]+\/dossiers$/) && m === 'POST') {
        const sid = p.split('/')[3];
        const b = await request.json() as any;
        const id = generateId();
        await env.DB.prepare('INSERT INTO dossiers (id, societe_id, nom) VALUES (?, ?, ?)').bind(id, sid, b.nom).run();
        return json({ id, nom: b.nom, statut: 'brouillon' }, 201);
      }
      if (p.match(/^\/api\/dossiers\/[^/]+$/) && m === 'GET') {
        const d = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(p.split('/').pop()!).first();
        return d ? json(d) : error('Non trouve', 404);
      }
      if (p.match(/^\/api\/dossiers\/[^/]+$/) && m === 'DELETE') {
        await env.DB.prepare('DELETE FROM dossiers WHERE id = ?').bind(p.split('/').pop()!).run();
        return json({ ok: true });
      }

      // --- UPLOAD PIECES ---
      if (p.match(/^\/api\/dossiers\/[^/]+\/upload$/) && m === 'POST') {
        const did = p.split('/')[3];
        const d = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(did).first() as Dossier;
        if (!d) return error('Dossier non trouve', 404);
        const fd = await request.formData();
        const files = fd.getAll('files') as File[];
        const created = [];
        for (const f of files) {
          const id = generateId();
          const key = `${d.societe_id}/${did}/${id}_${f.name}`;
          await env.PDF_BUCKET.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type || 'application/pdf' } });
          await env.DB.prepare('INSERT INTO pieces (id, dossier_id, societe_id, nom_fichier, r2_key) VALUES (?, ?, ?, ?, ?)').bind(id, did, d.societe_id, f.name, key).run();
          created.push({ id, nom_fichier: f.name });
        }
        await env.DB.prepare("UPDATE dossiers SET nb_pieces = nb_pieces + ? WHERE id = ?").bind(created.length, did).run();
        return json({ uploaded: created.length, pieces: created }, 201);
      }

      // --- LIST PIECES ---
      if (p.match(/^\/api\/dossiers\/[^/]+\/pieces$/) && m === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM pieces WHERE dossier_id = ? ORDER BY created_at').bind(p.split('/')[3]).all();
        return json(results);
      }

      // --- ECRITURES ---
      if (p.match(/^\/api\/dossiers\/[^/]+\/ecritures$/) && m === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM ecritures WHERE dossier_id = ? ORDER BY date_operation, journal_code').bind(p.split('/')[3]).all();
        return json(results);
      }
      if (p.match(/^\/api\/dossiers\/[^/]+\/ecritures$/) && m === 'POST') {
        const did = p.split('/')[3];
        const b = await request.json() as any;
        const id = generateId();
        await env.DB.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, compte_debit, compte_credit, montant, tresorerie, piece_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, did, b.societe_id, b.journal_code, b.date_operation, b.date_piece || null, b.numero_doc || null, b.libelle, b.compte_debit, b.compte_credit, b.montant, b.tresorerie || null, b.piece_id || null).run();
        await env.DB.prepare('UPDATE dossiers SET nb_ecritures = nb_ecritures + 1 WHERE id = ?').bind(did).run();
        return json({ id, ...b }, 201);
      }
      if (p.match(/^\/api\/ecritures\/[^/]+$/) && m === 'DELETE') {
        const ecr = await env.DB.prepare('SELECT * FROM ecritures WHERE id = ?').bind(p.split('/').pop()!).first() as Ecriture;
        if (ecr) {
          await env.DB.prepare('DELETE FROM ecritures WHERE id = ?').bind(ecr.id).run();
          await env.DB.prepare('UPDATE dossiers SET nb_ecritures = MAX(0, nb_ecritures - 1) WHERE id = ?').bind(ecr.dossier_id).run();
        }
        return json({ ok: true });
      }

      // --- EXPORT CSV ---
      if (p.match(/^\/api\/dossiers\/[^/]+\/export$/) && m === 'GET') {
        const did = p.split('/')[3];
        const { results: ecritures } = await env.DB.prepare('SELECT * FROM ecritures WHERE dossier_id = ? ORDER BY date_operation, journal_code').bind(did).all();
        const header = 'Date operation;Date piece;Journal;N doc;Libelle;Compte debit;Compte credit;Montant;Sens;Tresorerie';
        const rows = ecritures.map((e: any) => [
          e.date_operation, e.date_piece || '', e.journal_code, e.numero_doc || '',
          e.libelle, e.compte_debit, e.compte_credit, e.montant.toFixed(3),
          e.compte_debit.startsWith('5') ? 'T' : (e.compte_debit.startsWith('6') || e.compte_debit.startsWith('7') ? 'D' : 'D'),
          e.tresorerie || ''
        ].join(';'));
        return new Response([header, ...rows].join('\n'), {
          headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ecritures_${did}.csv"`, 'Access-Control-Allow-Origin': '*' },
        });
      }

      // --- DASHBOARD ---
      if (p === '/api/dashboard' && m === 'GET') {
        const s = await env.DB.prepare('SELECT COUNT(*) as c FROM societes').first() as any;
        const d = await env.DB.prepare('SELECT COUNT(*) as c FROM dossiers').first() as any;
        const e = await env.DB.prepare('SELECT COUNT(*) as c FROM ecritures').first() as any;
        const recent = await env.DB.prepare('SELECT d.*, s.raison_sociale FROM dossiers d LEFT JOIN societes s ON d.societe_id = s.id ORDER BY d.created_at DESC LIMIT 10').all();
        return json({ stats: { societes: s?.c || 0, dossiers: d?.c || 0, ecritures: e?.c || 0 }, recentDossiers: recent.results });
      }

      return error('Not found', 404);
    } catch (e: any) {
      return error(e.message || 'Erreur serveur', 500);
    }
  },
};
