import { Env, Journal } from '../types';
import { json, error, generateId } from '../utils';

export async function handleJournaux(method: string, request: Request, env: Env, path: string): Promise<Response> {
  const parts = path.split('/');
  const societeId = parts[3];

  if (method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM journaux WHERE societe_id = ? ORDER BY code')
      .bind(societeId).all<Journal>();
    return json(results);
  }

  if (method === 'POST') {
    const body = await request.json() as { code: string; libelle: string; compte_contrepartie?: string };
    if (!body.code || !body.libelle) return error('code et libelle requis');
    const id = generateId();
    await env.DB.prepare('INSERT INTO journaux (id, societe_id, code, libelle, compte_contrepartie) VALUES (?, ?, ?, ?, ?)')
      .bind(id, societeId, body.code, body.libelle, body.compte_contrepartie || null).run();
    return json({ id }, 201);
  }

  if (parts.length > 5) {
    const id = parts[parts.length - 1];
    if (method === 'PUT') {
      const body = await request.json() as { libelle?: string; compte_contrepartie?: string };
      const sets: string[] = [];
      const binds: any[] = [];
      if (body.libelle) { sets.push('libelle = ?'); binds.push(body.libelle); }
      if (body.compte_contrepartie !== undefined) { sets.push('compte_contrepartie = ?'); binds.push(body.compte_contrepartie); }
      if (!sets.length) return error('Rien à modifier');
      binds.push(id);
      await env.DB.prepare(`UPDATE journaux SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ success: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM journaux WHERE id = ?').bind(id).run();
      return json({ success: true });
    }
  }

  return error('Méthode non supportée', 405);
}
