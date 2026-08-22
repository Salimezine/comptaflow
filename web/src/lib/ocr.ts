import Tesseract from 'tesseract.js';

export interface ExtractedInvoice {
  date_facture: string;
  numero_facture: string;
  client: string;
  total_ht_0: number;
  total_ht_19: number;
  tva_19: number;
  timbre: number;
  total_ttc: number;
  raw_text: string;
}

async function extractTextFromImage(file: File): Promise<string> {
  const result = await Tesseract.recognize(file, 'fra+eng', {
    logger: (m: any) => console.log(m),
  });
  return result.data.text;
}

async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const viewport = page.getViewport({ scale: 2 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await (page as any).render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    const text = await extractTextFromImage(new File([blob], 'page.png', { type: 'image/png' }));
    fullText += text + '\n\n';
  }

  return fullText;
}

function parseInvoice(text: string): ExtractedInvoice {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Extract invoice number
  let numero = '';
  const numPatterns = [
    /(?:FACTURE\s*N[°o]?\s*:?)(\S+)/i,
    /(?:N[°o]\s*facture\s*:?)(\S+)/i,
    /(?:Facture)\s*(\S+)/i,
    /(\d{4}\/\d{2,4})/,
  ];
  for (const p of numPatterns) {
    const m = text.match(p);
    if (m) { numero = m[1]; break; }
  }

  // Extract date
  let date = '';
  const datePatterns = [
    /(\d{2}\/\d{2}\/\d{4})/,
    /(\d{4}-\d{2}-\d{2})/,
    /(?:Date\s*:?)(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
  ];
  for (const p of datePatterns) {
    const m = text.match(p);
    if (m) {
      date = m[1].replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
      if (date.match(/^\d{4}-\d{2}-\d{2}$/)) break;
    }
  }

  // Extract client
  let client = '';
  const clientPatterns = [
    /(?:Client\s*:?|Clientel\s*:?|Denomination\s*:?)\s*(.+)/i,
    /(?:Mr|Mme|SARL|SA|SAS|COOP)\s+(.+)/i,
  ];
  for (const p of clientPatterns) {
    const m = text.match(p);
    if (m) { client = m[1].trim().substring(0, 50); break; }
  }

  // Extract amounts
  let ht0 = 0, ht19 = 0, tva19 = 0, ttc = 0, timbre = 1;

  // Try to find HT 0% and HT 19%
  const ht0Match = text.match(/(?:HT\s*0%?|Base\s*0%)\s*[:=]?\s*([\d\s.,]+)/i);
  const ht19Match = text.match(/(?:HT\s*19%?|Base\s*19%)\s*[:=]?\s*([\d\s.,]+)/i);

  if (ht0Match) ht0 = parseNumber(ht0Match[1]);
  if (ht19Match) ht19 = parseNumber(ht19Match[1]);

  // Try to find TVA
  const tvaMatch = text.match(/(?:TVA\s*19%?|TVA\s*:?)\s*[:=]?\s*([\d\s.,]+)/i);
  if (tvaMatch) tva19 = parseNumber(tvaMatch[1]);

  // Try to find TTC
  const ttcPatterns = [
    /(?:Net\s*TTC|Total\s*TTC|Montant\s*net|A\s*payer)\s*[:=]?\s*([\d\s.,]+)/i,
    /(?:TOTAL\s*HT)\s*[:=]?\s*[\d\s.,]+\s*.*?(?:TTC)\s*[:=]?\s*([\d\s.,]+)/is,
  ];
  for (const p of ttcPatterns) {
    const m = text.match(p);
    if (m) { ttc = parseNumber(m[1]); break; }
  }

  // If TTC not found, calculate
  if (ttc === 0 && (ht0 + ht19 + tva19) > 0) {
    ttc = ht0 + ht19 + tva19 + timbre;
  }

  // If no specific HT found, try to find any amount
  if (ht0 === 0 && ht19 === 0) {
    const allAmounts = [...text.matchAll(/(\d{1,6}[.,]\d{2,3})/g)].map(m => parseNumber(m[1]));
    if (allAmounts.length > 0) {
      // Heuristic: largest amount might be TTC
      const sorted = [...allAmounts].sort((a, b) => b - a);
      ttc = sorted[0];
    }
  }

  return {
    date_facture: date || new Date().toISOString().split('T')[0],
    numero_facture: numero || 'INCONNU',
    client,
    total_ht_0: ht0,
    total_ht_19: ht19,
    tva_19: tva19,
    timbre,
    total_ttc: ttc,
    raw_text: text,
  };
}

function parseNumber(s: string): number {
  return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0;
}

export async function processFile(file: File): Promise<ExtractedInvoice> {
  const isImage = file.type.startsWith('image/');
  const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');

  let text = '';
  if (isImage) {
    text = await extractTextFromImage(file);
  } else if (isPDF) {
    text = await extractTextFromPDF(file);
  } else {
    throw new Error('Format non supporte. Utilisez PDF ou image.');
  }

  return parseInvoice(text);
}
