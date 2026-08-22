import { Env, PlanCompte } from '../types';
import { json, error, generateId } from '../utils';

export async function handlePlansComptes(method: string, request: Request, env: Env, path: string): Promise<Response> {
  const parts = path.split('/');
  const societeId = parts[3];

  if (method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM plans_comptes WHERE societe_id = ? ORDER BY numero')
      .bind(societeId).all<PlanCompte>();
    return json(results);
  }

  if (method === 'POST') {
    const body = await request.json() as { comptes: Array<{ numero: string; libelle: string; classe?: number }> };
    if (!body.comptes?.length) return error('Aucun compte fourni');
    const stmts = body.comptes.map(c =>
      env.DB.prepare('INSERT OR REPLACE INTO plans_comptes (id, societe_id, numero, libelle, classe) VALUES (?, ?, ?, ?, ?)')
        .bind(generateId(), societeId, c.numero, c.libelle, c.classe || parseInt(c.numero.charAt(0)) || null)
    );
    await env.DB.batch(stmts);
    return json({ imported: body.comptes.length }, 201);
  }

  if (method === 'DELETE' && parts.length > 5) {
    const id = parts[parts.length - 1];
    await env.DB.prepare('DELETE FROM plans_comptes WHERE id = ?').bind(id).run();
    return json({ success: true });
  }

  return error('Méthode non supportée', 405);
}
