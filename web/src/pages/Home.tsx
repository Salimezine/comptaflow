import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Home() {
  const nav = useNavigate();
  const [status, setStatus] = useState('Connexion au serveur...');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    api.dashboard().then((d: any) => {
      if (d.animalDossierId) {
        nav(`/dossier/${d.animalDossierId}`, { replace: true });
      }
    }).catch(() => {
      setStatus('Serveur en cours de demarrage, patientez...');
    });

    return () => clearInterval(timerRef.current);
  }, [nav]);

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      <p className="text-sm text-gray-500">{status}</p>
      {elapsed > 3 && <p className="text-xs text-gray-400">Premier chargement: {elapsed}s (Render free tier cold start)</p>}
    </div>
  );
}
