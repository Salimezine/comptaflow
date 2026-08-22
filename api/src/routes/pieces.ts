import { Env, Dossier, Piece, ExtractedInvoice } from '../types';
import { json, error, generateId } from '../utils';

export async function handlePieces(method: string, request: Request, env: Env, path: string, ctx?: ExecutionContext): Promise<Response> {
  const parts = path.split('/');
  const dossierId = parts[3];

  if (parts.includes('pieces') && method === 'GET' && !parts.includes('upload') && !parts.includes('extract')) {
    const { results } = await env.DB.prepare('SELECT * FROM pieces WHERE dossier_id = ? ORDER BY created_at')
      .bind(dossierId).all<Piece>();
    return json(results);
  }

  if (parts.includes('upload') && method === 'POST') {
    const dossier = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(dossierId).first<Dossier>();
    if (!dossier) return error('Dossier non trouvé', 404);

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    if (!files.length) return error('Aucun fichier fourni');

    const created: Piece[] = [];
    for (const file of files) {
      const id = generateId();
      const r2Key = `${dossier.societe_id}/${dossierId}/${id}_${file.name}`;
      const buffer = await file.arrayBuffer();
      await env.PDF_BUCKET.put(r2Key, buffer, {
        httpMetadata: { contentType: file.type || 'application/pdf' },
      });
      await env.DB.prepare('INSERT INTO pieces (id, dossier_id, societe_id, nom_fichier, r2_key) VALUES (?, ?, ?, ?, ?)')
        .bind(id, dossierId, dossier.societe_id, file.name, r2Key).run();
      created.push({ id, nom_fichier: file.name } as Piece);
    }

    await env.DB.prepare("UPDATE dossiers SET nb_pieces = nb_pieces + ?, updated_at = datetime('now') WHERE id = ?")
      .bind(created.length, dossierId).run();

    return json({ uploaded: created.length, pieces: created }, 201);
  }

  if (parts.includes('extract') && method === 'POST') {
    const dossier = await env.DB.prepare('SELECT * FROM dossiers WHERE id = ?').bind(dossierId).first<Dossier>();
    if (!dossier) return error('Dossier non trouvé', 404);

    await env.DB.prepare("UPDATE dossiers SET statut = 'extraction', updated_at = datetime('now') WHERE id = ?")
      .bind(dossierId).run();

    const { results: pieces } = await env.DB.prepare('SELECT * FROM pieces WHERE dossier_id = ? AND statut = ?')
      .bind(dossierId, 'en_attente').all<Piece>();

    const extractionResults: any[] = [];
    for (const piece of pieces) {
      try {
        const obj = await env.PDF_BUCKET.get(piece.r2_key);
        if (!obj) continue;
        const pdfBytes = await obj.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
        const extracted = await callClaudeForExtraction(env, base64, piece.nom_fichier);
        extractionResults.push({ piece_id: piece.id, extracted });

        await env.DB.prepare(`UPDATE pieces SET statut = 'extrait', type_document = ?, date_document = ?,
          numero_facture = ?, tiers = ?, montant_ht = ?, montant_tva = ?, montant_ttc = ?,
          taux_tva = ?, timbre_fiscal = ?, mode_reglement = ?, confiance_ocr = ?, donnees_extraites = ?
          WHERE id = ?`).bind(
          extracted.type_document, extracted.date_document, extracted.numero_facture,
          extracted.tiers, extracted.montant_ht, extracted.montant_tva_total, extracted.montant_ttc,
          extracted.taux_tva || 0, extracted.timbre_fiscal || 0, extracted.mode_reglement || null,
          extracted.confiance, JSON.stringify(extracted), piece.id
        ).run();
      } catch (e: any) {
        await env.DB.prepare("UPDATE pieces SET statut = 'erreur' WHERE id = ?").bind(piece.id).run();
        extractionResults.push({ piece_id: piece.id, error: e.message });
      }
    }

    await env.DB.prepare("UPDATE dossiers SET statut = 'controle', updated_at = datetime('now') WHERE id = ?")
      .bind(dossierId).run();

    return json({ extracted: extractionResults.length, results: extractionResults });
  }

  if (parts[2] === 'pieces' && parts.length === 4) {
    const id = parts[3];
    if (method === 'GET') {
      const p = await env.DB.prepare('SELECT * FROM pieces WHERE id = ?').bind(id).first<Piece>();
      return p ? json(p) : error('Non trouvé', 404);
    }
    if (method === 'PATCH') {
      const body = await request.json() as Partial<Piece>;
      const sets: string[] = [];
      const binds: any[] = [];
      const fields = ['type_document', 'date_document', 'numero_facture', 'tiers', 'montant_ht', 'montant_tva', 'montant_ttc', 'taux_tva', 'timbre_fiscal', 'mode_reglement', 'confiance_ocr', 'statut'];
      for (const f of fields) {
        if ((body as any)[f] !== undefined) { sets.push(`${f} = ?`); binds.push((body as any)[f]); }
      }
      if (!sets.length) return error('Rien à modifier');
      binds.push(id);
      await env.DB.prepare(`UPDATE pieces SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ success: true });
    }
  }

  return error('Méthode non supportée', 405);
}

async function callClaudeForExtraction(env: Env, pdfBase64: string, filename: string): Promise<ExtractedInvoice> {
  if (!env.CLAUDE_API_KEY) {
    return mockExtraction(filename);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: `Extrait les données de cette facture/document comptable tunisien. Retourne un JSON avec:
{
  "type_document": "facture_vente|facture_achat|rapport_vente|releve_bancaire|autre",
  "date_document": "YYYY-MM-DD",
  "numero_facture": "string",
  "tiers": "nom du client/fournisseur",
  "lignes": [{"designation": "string", "quantite": number, "prix_unitaire": number, "montant_ht": number, "taux_tva": number, "montant_tva": number}],
  "montant_ht": number,
  "montant_tva_total": number,
  "montant_ttc": number,
  "timbre_fiscal": number,
  "mode_reglement": "especes|TPE|cheque|virement|null",
  "devise": "TND",
  "confiance": 0.0-1.0
}
Ne retourne QUE le JSON, sans texte supplémentaire.` }
        ]
      }]
    }),
  });

  const data = await response.json() as any;
  const text = data.content?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : mockExtraction(filename);
}

function mockExtraction(filename: string): ExtractedInvoice {
  return {
    type_document: filename.toLowerCase().includes('vente') ? 'facture_vente' : 'facture_achat',
    date_document: new Date().toISOString().split('T')[0],
    numero_facture: `FV-${Date.now().toString().slice(-6)}`,
    tiers: 'Client/Démonstration',
    lignes: [{ designation: 'Prestation de service', quantite: 1, prix_unitaire: 1000, montant_ht: 1000, taux_tva: 19, montant_tva: 190 }],
    montant_ht: 1000,
    montant_tva_total: 190,
    montant_ttc: 1190,
    timbre_fiscal: 1,
    mode_reglement: 'especes',
    devise: 'TND',
    confiance: 0.85,
  };
}
