const BASE = import.meta.env.VITE_API_URL || 'https://comptaflow-fajt.onrender.com/api';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...opts?.headers }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('text/csv')) return r.text() as any;
  return r.json();
}

export const api = {
  dashboard: () => req<any>('/dashboard'),
  getSocietes: () => req<any[]>('/societes'),
  createSociete: (d: any) => req<any>('/societes', { method: 'POST', body: JSON.stringify(d) }),
  deleteSociete: (id: string) => req<any>(`/societes/${id}`, { method: 'DELETE' }),
  getJournaux: (sid: string) => req<any[]>(`/societes/${sid}/journaux`),
  getDossiers: (sid: string) => req<any[]>(`/societes/${sid}/dossiers`),
  createDossier: (sid: string, d: any) => req<any>(`/societes/${sid}/dossiers`, { method: 'POST', body: JSON.stringify(d) }),
  getDossier: (did: string) => req<any>(`/dossiers/${did}`),
  deleteDossier: (did: string) => req<any>(`/dossiers/${did}`, { method: 'DELETE' }),
  upload: async (did: string, files: File[]) => {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    const r = await fetch(`${BASE}/dossiers/${did}/upload`, { method: 'POST', body: fd });
    return r.json();
  },
  getPieces: (did: string) => req<any[]>(`/dossiers/${did}/pieces`),
  getEcritures: (did: string) => req<any[]>(`/dossiers/${did}/ecritures`),
  addEcriture: (did: string, d: any) => req<any>(`/dossiers/${did}/ecritures`, { method: 'POST', body: JSON.stringify(d) }),
  deleteEcriture: (eid: string) => req<any>(`/ecritures/${eid}`, { method: 'DELETE' }),
  exportCSV: (did: string) => req<string>(`/dossiers/${did}/export`),
  getFactures: (did: string) => req<any[]>(`/dossiers/${did}/factures`),
  addFacture: (did: string, d: any) => req<any>(`/dossiers/${did}/factures`, { method: 'POST', body: JSON.stringify(d) }),
  deleteFacture: (fid: string) => req<any>(`/factures/${fid}`, { method: 'DELETE' }),
  generateVTJC: (did: string, modes?: any) => req<any>(`/dossiers/${did}/generate-vtjc`, { method: 'POST', body: JSON.stringify({ modes: modes || {} }) }),
  process: async (did: string, files: File[]) => {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    const r = await fetch(`${BASE}/dossiers/${did}/process`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
    return r.json();
  },
};
