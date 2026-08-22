import { Env, Dossier, Piece, Ecriture, LigneEcriture, GeneratedEcriture } from '../types';
import { json, error, generateId } from '../utils';

export async function handleEcritures(method: string, request: Request, env: Env, path: string, ctx?: ExecutionContext): Promise<Response> {
  const parts = path.split('/');

  if (parts.includes('generate') && method === 'POST') {
    const dossierId = parts[3];
    const dossier = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(dossierId).first<Dossier>();
    if (!dossier) return error('Dossier non trouvé', 404);

    await env.DB.prepare("UPDATE dossiers SET statut = 'generation', updated_at = datetime('now') WHERE id = ?")
      .bind(dossierId).run();

    const { results: pieces } = await env.DB.prepare('SELECT * FROM pieces WHERE dossier_id = ? AND statut = ?')
      .bind(dossierId, 'extrait').all<Piece>();

    const ecrituresGenerees = await genererEcritures(env, pieces, dossier.societe_id);

    for (const ecr of ecrituresGenerees) {
      const ecrId = generateId();
      await env.DB.prepare('INSERT INTO ecritures (id, dossier_id, societe_id, journal_code, date_operation, date_piece, numero_doc, libelle, source_piece_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(ecrId, dossierId, dossier.societe_id, ecr.journal_code, ecr.date_operation, ecr.date_piece, ecr.numero_doc, ecr.libelle, ecr.source_piece_id || null).run();

      for (let i = 0; i < ecr.lignes.length; i++) {
        const l = ecr.lignes[i];
        await env.DB.prepare('INSERT INTO lignes_ecriture (id, ecriture_id, compte, libelle, montant_debit, montant_credit, tresorerie, ordre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(generateId(), ecrId, l.compte, l.libelle, l.montant_debit, l.montant_credit, l.tresorerie || null, i).run();
      }
    }

    const anomalies = detecterAnomalies(ecrituresGenerees, pieces);
    for (const a of anomalies) {
      await env.DB.prepare('INSERT INTO logs_anomalies (id, dossier_id, type_anomalie, description, montant_attendu, montant_trouve, ecart, severite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), dossierId, a.type_anomalie, a.description, a.montant_attendu || null, a.montant_trouve || null, a.ecart || null, a.severite).run();
    }

    await env.DB.prepare("UPDATE dossiers SET statut = 'valide', nb_ecritures = ?, nb_anomalies = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(ecrituresGenerees.length, anomalies.length, dossierId).run();

    return json({ ecritures: ecrituresGenerees.length, anomalies: anomalies.length });
  }

  if (parts[2] === 'dossiers' && parts[5] === 'ecritures' && method === 'GET') {
    const dossierId = parts[3];
    const { results } = await env.DB.prepare('SELECT * FROM ecritures WHERE dossier_id = ? ORDER BY date_operation')
      .bind(dossierId).all<Ecriture>();

    for (const e of results) {
      const { results: lignes } = await env.DB.prepare('SELECT * FROM lignes_ecriture WHERE ecriture_id = ? ORDER BY ordre')
        .bind(e.id).all<LigneEcriture>();
      (e as any).lignes = lignes;
    }
    return json(results);
  }

  if (parts[2] === 'ecritures' && parts.length === 4 && method === 'GET') {
    const id = parts[3];
    const e = await env.DB.prepare('SELECT * FROM ecritures WHERE id = ?').bind(id).first<Ecriture>();
    if (!e) return error('Non trouvée', 404);
    const { results: lignes } = await env.DB.prepare('SELECT * FROM lignes_ecriture WHERE ecriture_id = ? ORDER BY ordre')
      .bind(id).all<LigneEcriture>();
    (e as any).lignes = lignes;
    return json(e);
  }

  if (parts[2] === 'ecritures' && parts.length === 4 && method === 'PATCH') {
    const id = parts[3];
    const body = await request.json() as Partial<Ecriture>;
    const sets: string[] = [];
    const binds: any[] = [];
    if (body.journal_code) { sets.push('journal_code = ?'); binds.push(body.journal_code); }
    if (body.libelle) { sets.push('libelle = ?'); binds.push(body.libelle); }
    if (body.statut) { sets.push('statut = ?'); binds.push(body.statut); }
    if (!sets.length) return error('Rien à modifier');
    binds.push(id);
    await env.DB.prepare(`UPDATE ecritures SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
    return json({ success: true });
  }

  if (parts[2] === 'ecritures' && parts[5] === 'lignes' && method === 'PUT') {
    const ecritureId = parts[3];
    const body = await request.json() as { lignes: Array<{ compte: string; libelle: string; montant_debit: number; montant_credit: number; tresorerie?: string }> };
    await env.DB.prepare('DELETE FROM lignes_ecriture WHERE ecriture_id = ?').bind(ecritureId).run();
    for (let i = 0; i < body.lignes.length; i++) {
      const l = body.lignes[i];
      await env.DB.prepare('INSERT INTO lignes_ecriture (id, ecriture_id, compte, libelle, montant_debit, montant_credit, tresorerie, ordre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), ecritureId, l.compte, l.libelle, l.montant_debit, l.montant_credit, l.tresorerie || null, i).run();
    }
    return json({ success: true });
  }

  return error('Méthode non supportée', 405);
}

async function genererEcritures(env: Env, pieces: Piece[], societeId: string): Promise<GeneratedEcriture[]> {
  const { results: journaux } = await env.DB.prepare('SELECT * FROM journaux WHERE societe_id = ?').bind(societeId).all();
  const journalMap = new Map(journaux.map((j: any) => [j.code, j]));

  const ventesParJour = new Map<string, Piece[]>();
  const facturesIndividuelles: Piece[] = [];

  for (const p of pieces) {
    if (p.type_document === 'facture_vente') {
      const key = p.date_document || 'unknown';
      if (!ventesParJour.has(key)) ventesParJour.set(key, []);
      ventesParJour.get(key)!.push(p);
    } else {
      facturesIndividuelles.push(p);
    }
  }

  const ecritures: GeneratedEcriture[] = [];

  for (const [date, piecesVente] of ventesParJour) {
    const clientsNommes = piecesVente.filter(p => p.tiers && p.tiers !== 'Client/Démonstration' && p.tiers !== 'Client de passage');
    const clientsPassage = piecesVente.filter(p => !p.tiers || p.tiers === 'Client/Démonstration' || p.tiers === 'Client de passage');

    if (clientsPassage.length > 0) {
      const totalHT = clientsPassage.reduce((s, p) => s + p.montant_ht, 0);
      const totalTVA = clientsPassage.reduce((s, p) => s + p.montant_tva, 0);
      const totalTTC = clientsPassage.reduce((s, p) => s + p.montant_ttc, 0);
      const totalTimbre = clientsPassage.reduce((s, p) => s + (p.timbre_fiscal || 0), 0);

      const lignes: GeneratedEcriture['lignes'] = [
        { compte: '411100', libelle: 'Ventes clients de passage', montant_debit: totalTTC, montant_credit: 0 },
        { compte: '701100', libelle: 'Ventes de marchandises', montant_debit: 0, montant_credit: totalHT },
      ];

      const tauxMap = new Map<number, number>();
      for (const p of clientsPassage) {
        if (p.taux_tva > 0) {
          tauxMap.set(p.taux_tva, (tauxMap.get(p.taux_tva) || 0) + p.montant_tva);
        }
      }
      for (const [taux, montant] of tauxMap) {
        const compteTVA = taux === 19 ? '442619' : taux === 7 ? '44267' : '442600';
        lignes.push({ compte: compteTVA, libelle: `TVA ${taux}%`, montant_debit: 0, montant_credit: montant });
      }

      if (totalTimbre > 0) {
        lignes.push({ compte: '445310', libelle: 'Timbres fiscaux', montant_debit: 0, montant_credit: totalTimbre });
      }

      ecritures.push({
        journal_code: 'VE',
        date_operation: date,
        date_piece: date,
        numero_doc: `VEN-${date.replace(/-/g, '')}`,
        libelle: `Ventes du ${date} - ${clientsPassage.length} facture(s)`,
        lignes,
      });
    }

    for (const p of clientsNommes) {
      const lignes: GeneratedEcriture['lignes'] = [
        { compte: '411100', libelle: p.tiers || 'Client', montant_debit: p.montant_ttc, montant_credit: 0 },
        { compte: '701100', libelle: 'Ventes', montant_debit: 0, montant_credit: p.montant_ht },
      ];
      if (p.taux_tva > 0) {
        const compteTVA = p.taux_tva === 19 ? '442619' : p.taux_tva === 7 ? '44267' : '442600';
        lignes.push({ compte: compteTVA, libelle: `TVA ${p.taux_tva}%`, montant_debit: 0, montant_credit: p.montant_tva });
      }
      if (p.timbre_fiscal > 0) {
        lignes.push({ compte: '445310', libelle: 'Timbre fiscal', montant_debit: 0, montant_credit: p.timbre_fiscal });
      }

      ecritures.push({
        journal_code: 'VE',
        date_operation: date,
        date_piece: p.date_document || date,
        numero_doc: p.numero_facture || '',
        libelle: `Vente - ${p.tiers}`,
        lignes,
        source_piece_id: p.id,
      });
    }
  }

  for (const p of facturesIndividuelles) {
    const journal = p.type_document === 'facture_achat' ? 'AC' : 'OD';
    const date = p.date_document || new Date().toISOString().split('T')[0];

    if (p.type_document === 'facture_achat') {
      const lignes: GeneratedEcriture['lignes'] = [
        { compte: '601100', libelle: `Achat - ${p.tiers || 'Fournisseur'}`, montant_debit: p.montant_ht, montant_credit: 0 },
        { compte: '442619', libelle: 'TVA récupérable', montant_debit: p.montant_tva, montant_credit: 0 },
        { compte: '401100', libelle: p.tiers || 'Fournisseur', montant_debit: 0, montant_credit: p.montant_ttc },
      ];
      ecritures.push({
        journal_code: journal,
        date_operation: date,
        date_piece: p.date_document || date,
        numero_doc: p.numero_facture || '',
        libelle: `Achat - ${p.tiers || 'Fournisseur'}`,
        lignes,
        source_piece_id: p.id,
      });
    }
  }

  return ecritures;
}

function detecterAnomalies(ecritures: GeneratedEcriture[], pieces: Piece[]): any[] {
  const anomalies: any[] = [];

  for (const ecr of ecritures) {
    const totalDebit = ecr.lignes.reduce((s, l) => s + l.montant_debit, 0);
    const totalCredit = ecr.lignes.reduce((s, l) => s + l.montant_credit, 0);
    const ecart = Math.abs(totalDebit - totalCredit);

    if (ecart > 0.01) {
      anomalies.push({
        type_anomalie: 'desequilibre',
        description: `Écriture ${ecr.numero_doc}: Débit=${totalDebit.toFixed(3)} ≠ Crédit=${totalCredit.toFixed(3)}`,
        montant_attendu: totalDebit,
        montant_trouve: totalCredit,
        ecart,
        severite: 'error',
      });
    }
  }

  const totalPieces = pieces.reduce((s, p) => s + p.montant_ttc, 0);
  const totalEcritures = ecritures.reduce((s, e) => {
    return s + e.lignes.filter(l => l.compte.startsWith('411')).reduce((ss, l) => ss + l.montant_debit, 0);
  }, 0);

  if (Math.abs(totalPieces - totalEcritures) > 0.01) {
    anomalies.push({
      type_anomalie: 'ecart_total',
      description: `Écart global: Pièces=${totalPieces.toFixed(3)} vs Écritures=${totalEcritures.toFixed(3)}`,
      montant_attendu: totalPieces,
      montant_trouve: totalEcritures,
      ecart: Math.abs(totalPieces - totalEcritures),
      severite: 'warning',
    });
  }

  return anomalies;
}
