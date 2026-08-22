import { Env, LogAnomalie } from '../types';
import { json } from '../utils';

export async function handleAnomalies(method: string, request: Request, env: Env, path: string): Promise<Response> {
  const parts = path.split('/');
  const dossierId = parts[3];

  if (method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM logs_anomalies WHERE dossier_id = ? ORDER BY severite DESC, created_at DESC')
      .bind(dossierId).all<LogAnomalie>();
    return json(results);
  }

  return json({ error: 'Méthode non supportée' }, 405);
}
