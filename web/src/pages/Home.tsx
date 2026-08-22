import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Home() {
  const nav = useNavigate();

  useEffect(() => {
    api.dashboard().then((d: any) => {
      if (d.animalDossierId) {
        nav(`/dossier/${d.animalDossierId}`, { replace: true });
      }
    });
  }, [nav]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );
}
