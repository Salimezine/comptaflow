import { Env } from '../types';
import { json } from '../utils';

export async function handleDashboard(method: string, env: Env): Promise<Response> {
  if (method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const societes = await env.DB.prepare('SELECT COUNT(*) as count FROM societes').first();
  const dossiers = await env.DB.prepare('SELECT COUNT(*) as count FROM dossiers').first();
  const ecritures = await env.DB.prepare('SELECT COUNT(*) as count FROM ecritures').first();
  const anomalies = await env.DB.prepare('SELECT COUNT(*) as count FROM logs_anomalies').first();
  const recentDossiers = await env.DB.prepare('SELECT d.*, s.raison_sociale FROM dossiers d LEFT JOIN societes s ON d.societe_id = s.id ORDER BY d.created_at DESC LIMIT 10').all();

  return json({
    stats: {
      societes: (societes as any)?.count || 0,
      dossiers: (dossiers as any)?.count || 0,
      ecritures: (ecritures as any)?.count || 0,
      anomalies: (anomalies as any)?.count || 0,
    },
    recentDossiers: recentDossiers.results,
  });
}
