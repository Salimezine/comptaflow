import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Building2, FolderOpen, FileText } from 'lucide-react';
import { api } from '../lib/api';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.dashboard().then(setData).catch(() => {}); }, []);
  const s = data?.stats || {};
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tableau de bord</h1>
        <Link to="/societes" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
          <Plus className="w-4 h-4" />Nouvelle societe
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { l: 'Societes', v: s.societes, ic: Building2, c: 'bg-blue-50 text-blue-600' },
          { l: 'Dossiers', v: s.dossiers, ic: FolderOpen, c: 'bg-emerald-50 text-emerald-600' },
          { l: 'Ecritures', v: s.ecritures, ic: FileText, c: 'bg-violet-50 text-violet-600' },
        ].map(x => (
          <div key={x.l} className="bg-white rounded-xl border p-5 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${x.c}`}><x.ic className="w-6 h-6" /></div>
            <div><p className="text-2xl font-bold">{x.v || 0}</p><p className="text-sm text-gray-500">{x.l}</p></div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold mb-3">Dossiers recents</h2>
        {(!data?.recentDossiers?.length) ? <p className="text-sm text-gray-400">Aucun dossier. Commencez par creer une societe.</p> : (
          <div className="space-y-2">
            {data.recentDossiers.map((d: any) => (
              <Link key={d.id} to={`/dossier/${d.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border">
                <div><p className="font-medium text-sm">{d.nom}</p><p className="text-xs text-gray-500">{d.raison_sociale}</p></div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>{d.nb_pieces} pieces</span><span>{d.nb_ecritures} ecritures</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${d.statut === 'valide' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100'}`}>{d.statut}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
