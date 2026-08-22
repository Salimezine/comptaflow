import { Env, Ecriture, LigneEcriture } from '../types';
import { json } from '../utils';

export async function handleExport(method: string, request: Request, env: Env, path: string): Promise<Response> {
  const parts = path.split('/');
  const dossierId = parts[3];

  if (method === 'GET') {
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'csv';

    const { results: ecritures } = await env.DB.prepare('SELECT * FROM ecritures WHERE dossier_id = ? ORDER BY date_operation, journal_code')
      .bind(dossierId).all<Ecriture>();

    const lignes: Array<Ecriture & LigneEcriture> = [];
    for (const e of ecritures) {
      const { results: eLignes } = await env.DB.prepare('SELECT * FROM lignes_ecriture WHERE ecriture_id = ? ORDER BY ordre')
        .bind(e.id).all<LigneEcriture>();
      for (const l of eLignes) {
        lignes.push({ ...e, ...l });
      }
    }

    if (format === 'csv') {
      const header = 'Date opération;Date pièce;Journal;N° doc comptable;Libellé;Compte;Libellé ligne;Montant débit;Montant crédit;Trésorerie;Sens';
      const rows = lignes.map(l => {
        const sens = l.montant_debit > 0 ? 'D' : 'C';
        return [
          l.date_operation, l.date_piece || '', l.journal_code, l.numero_doc || '',
          l.libelle, l.compte, l.libelle || '', l.montant_debit.toFixed(3),
          l.montant_credit.toFixed(3), l.tresorerie || '', sens
        ].join(';');
      });
      return new Response([header, ...rows].join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ecritures_${dossierId}.csv"`,
        },
      });
    }

    return json({ format, lignes: lignes.length, data: lignes });
  }

  return json({ error: 'Méthode non supportée' }, 405);
}
