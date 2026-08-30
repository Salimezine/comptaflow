const BASE = import.meta.env.VITE_API_URL || 'https://eurex-api.ezzinesalim21.workers.dev/api';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...opts?.headers }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('text/csv')) return r.text() as any;
  return r.json();
}

export const api = {
  seed: () => req<any>('/seed', { method: 'POST' }),
  dashboard: () => req<any>('/dashboard'),
  getSocietes: () => req<any[]>('/societes'),
  createSociete: (d: any) => req<any>('/societes', { method: 'POST', body: JSON.stringify(d) }),
  deleteSociete: (id: string) => req<any>(`/societes/${id}`, { method: 'DELETE' }),
  getJournaux: (sid: string) => req<any[]>(`/societes/${sid}/journaux`),
  getDossiers: (sid: string) => req<any[]>(`/societes/${sid}/dossiers`),
  createDossier: (sid: string, d: any) => req<any>(`/societes/${sid}/dossiers`, { method: 'POST', body: JSON.stringify(d) }),
  getDossier: (did: string) => req<any>(`/dossiers/${did}`),
  deleteDossier: (did: string) => req<any>(`/dossiers/${did}`, { method: 'DELETE' }),
  getPieces: (did: string) => req<any[]>(`/dossiers/${did}/pieces`),
  getEcritures: (did: string, journal?: string) => req<any[]>(`/dossiers/${did}/ecritures${journal ? '?journal=' + encodeURIComponent(journal) : ''}`),
  addEcriture: (did: string, d: any) => req<any>(`/dossiers/${did}/ecritures`, { method: 'POST', body: JSON.stringify(d) }),
  deleteEcriture: (eid: string) => req<any>(`/ecritures/${eid}`, { method: 'DELETE' }),
  deleteAllEcritures: (did: string, journal?: string) => req<any>(`/dossiers/${did}/ecritures${journal ? '?journal=' + encodeURIComponent(journal) : ''}`, { method: 'DELETE' }),
  exportCSV: (did: string, journal?: string) => req<string>(`/dossiers/${did}/export${journal ? '?journal=' + encodeURIComponent(journal) : ''}`),
  getFactures: (did: string) => req<any[]>(`/dossiers/${did}/factures`),
  addFacture: (did: string, d: any) => req<any>(`/dossiers/${did}/factures`, { method: 'POST', body: JSON.stringify(d) }),
  deleteFacture: (fid: string) => req<any>(`/factures/${fid}`, { method: 'DELETE' }),
  deleteAllFactures: (did: string) => req<any>(`/dossiers/${did}/factures`, { method: 'DELETE' }),
  getExcluded: (did: string) => req<any[]>(`/dossiers/${did}/excluded`),
  generateVTJC: (did: string) => req<any>(`/dossiers/${did}/generate-vtjc`, { method: 'POST', body: '{}' }),
  getRapport: (did: string) => req<any[]>(`/dossiers/${did}/rapport`),
  deleteRapport: (did: string) => req<any>(`/dossiers/${did}/rapport`, { method: 'DELETE' }),
  uploadRapport: (did: string, rows: any[]) => req<any>(`/dossiers/${did}/rapport`, { method: 'POST', body: JSON.stringify({ rows }) }),

  // Client-side PDF processing: send extracted text to Worker
  processVTC: (did: string, text: string) => req<any>(`/dossiers/${did}/process-vtc`, { method: 'POST', body: JSON.stringify({ text }) }),
  processFISC: (did: string, dmi: any) => req<any>(`/dossiers/${did}/process-fisc`, { method: 'POST', body: JSON.stringify({ dmi }) }),

  verifyAI: (did: string) => req<any>(`/dossiers/${did}/verify-ai`, { method: 'POST', body: '{}' }),
};
