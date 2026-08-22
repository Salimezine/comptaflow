import { Env } from './types';
import { json, error, corsHeaders } from './utils';
import { handleSocietes } from './routes/societes';
import { handlePlansComptes } from './routes/plans_comptes';
import { handleJournaux } from './routes/journaux';
import { handleDossiers } from './routes/dossiers';
import { handlePieces } from './routes/pieces';
import { handleEcritures } from './routes/ecritures';
import { handleAnomalies } from './routes/anomalies';
import { handleExport } from './routes/export';
import { handleDashboard } from './routes/dashboard';

export async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    if (path === '/api/societes') return handleSocietes(method, request, env);
    if (path.match(/^\/api\/societes\/[^/]+$/)) return handleSocietes(method, request, env, path);
    if (path.match(/^\/api\/societes\/[^/]+\/plans-comptes$/)) return handlePlansComptes(method, request, env, path);
    if (path.match(/^\/api\/societes\/[^/]+\/plans-comptes\/[^/]+$/)) return handlePlansComptes(method, request, env, path);
    if (path.match(/^\/api\/societes\/[^/]+\/journaux$/)) return handleJournaux(method, request, env, path);
    if (path.match(/^\/api\/societes\/[^/]+\/journaux\/[^/]+$/)) return handleJournaux(method, request, env, path);
    if (path.match(/^\/api\/societes\/[^/]+\/dossiers$/)) return handleDossiers(method, request, env, path);
    if (path.match(/^\/api\/dossiers\/[^/]+$/)) return handleDossiers(method, request, env, path);
    if (path.match(/^\/api\/dossiers\/[^/]+\/pieces$/) && method === 'GET') return handlePieces(method, request, env, path);
    if (path.match(/^\/api\/dossiers\/[^/]+\/upload$/)) return handlePieces(method, request, env, path, ctx);
    if (path.match(/^\/api\/dossiers\/[^/]+\/extract$/)) return handlePieces(method, request, env, path, ctx);
    if (path.match(/^\/api\/dossiers\/[^/]+\/generate$/)) return handleEcritures(method, request, env, path, ctx);
    if (path.match(/^\/api\/dossiers\/[^/]+\/ecritures$/)) return handleEcritures(method, request, env, path);
    if (path.match(/^\/api\/dossiers\/[^/]+\/anomalies$/)) return handleAnomalies(method, request, env, path);
    if (path.match(/^\/api\/dossiers\/[^/]+\/export$/)) return handleExport(method, request, env, path);
    if (path.match(/^\/api\/pieces\/[^/]+$/)) return handlePieces(method, request, env, path);
    if (path.match(/^\/api\/ecritures\/[^/]+\/lignes$/)) return handleEcritures(method, request, env, path);
    if (path.match(/^\/api\/ecritures\/[^/]+$/)) return handleEcritures(method, request, env, path);
    if (path === '/api/dashboard') return handleDashboard(method, env);

    return error('Route not found', 404);
  } catch (e: any) {
    return error(e.message || 'Internal server error', 500);
  }
}
