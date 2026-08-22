import { Env, Dossier } from '../types';
import { json, error, generateId } from '../utils';

export async function handleDossiers(method: string, request: Request, env: Env, path: string): Promise<Response> {
  const parts = path.split('/');

  if (path.includes('/societes/') && method === 'GET') {
    const societeId = parts[3];
    const { results } = await env.DB.prepare('SELECT * FROM dossiers WHERE societe_id = ? ORDER BY created_at DESC')
      .bind(societeId).all<Dossier>();
    return json(results);
  }

  if (path.includes('/societes/') && method === 'POST') {
    const societeId = parts[3];
    const body = await request.json() as { nom: string };
    if (!body.nom) return error('nom requis');
    const id = generateId();
    await env.DB.prepare('INSERT INTO dossiers (id, societe_id, nom) VALUES (?, ?, ?)')
      .bind(id, societeId, body.nom).run();
    return json({ id, nom: body.nom, statut: 'en_cours' }, 201);
  }

  if (parts[2] === 'dossiers' && parts.length === 4) {
    const id = parts[3];
    if (method === 'GET') {
      const d = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(id).first<Dossier>();
      return d ? json(d) : error('Non trouvé', 404);
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM dossiers WHERE id = ?').bind(id).run();
      return json({ success: true });
    }
  }

  return error('Méthode non supportée', 405);
}
