import { Env, Societe } from '../types';
import { json, error, generateId } from '../utils';

export async function handleSocietes(method: string, request: Request, env: Env, path?: string): Promise<Response> {
  if (method === 'GET' && !path) {
    const { results } = await env.DB.prepare('SELECT * FROM societes ORDER BY raison_sociale').all<Societe>();
    return json(results);
  }

  if (method === 'POST' && !path) {
    const body = await request.json() as { raison_sociale: string; matricule_fiscal?: string };
    if (!body.raison_sociale) return error('raison_sociale requise');
    const id = generateId();
    await env.DB.prepare('INSERT INTO societes (id, raison_sociale, matricule_fiscal) VALUES (?, ?, ?)')
      .bind(id, body.raison_sociale, body.matricule_fiscal || null).run();

    const journaux = [
      { code: 'VE', libelle: 'Ventes', compte: '411100' },
      { code: 'AC', libelle: 'Achats', compte: '401100' },
      { code: 'BQ', libelle: 'Banque', compte: '521100' },
      { code: 'CA', libelle: 'Caisse', compte: '531100' },
      { code: 'OD', libelle: 'Opérations Diverses', compte: null },
    ];
    for (const j of journaux) {
      await env.DB.prepare('INSERT INTO journaux (id, societe_id, code, libelle, compte_contrepartie) VALUES (?, ?, ?, ?, ?)')
        .bind(generateId(), id, j.code, j.libelle, j.compte).run();
    }
    return json({ id, raison_sociale: body.raison_sociale, matricule_fiscal: body.matricule_fiscal || null }, 201);
  }

  if (path) {
    const id = path.split('/').pop()!;
    if (method === 'GET') {
      const s = await env.DB.prepare('SELECT * FROM societes WHERE id = ?').bind(id).first<Societe>();
      return s ? json(s) : error('Non trouvée', 404);
    }
    if (method === 'PUT') {
      const body = await request.json() as { raison_sociale?: string; matricule_fiscal?: string };
      const sets: string[] = [];
      const binds: any[] = [];
      if (body.raison_sociale) { sets.push('raison_sociale = ?'); binds.push(body.raison_sociale); }
      if (body.matricule_fiscal !== undefined) { sets.push('matricule_fiscal = ?'); binds.push(body.matricule_fiscal); }
      if (!sets.length) return error('Rien à modifier');
      sets.push("updated_at = datetime('now')");
      binds.push(id);
      await env.DB.prepare(`UPDATE societes SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ success: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM societes WHERE id = ?').bind(id).run();
      return json({ success: true });
    }
  }

  return error('Méthode non supportée', 405);
}
