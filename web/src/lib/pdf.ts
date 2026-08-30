import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs`;

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.filter((item: any) => 'str' in item && item.str.trim());
    if (items.length === 0) continue;

    (items as any[]).sort((a: any, b: any) => {
      const ay = a.transform[5], by = b.transform[5];
      if (Math.abs(ay - by) > 2) return by - ay;
      return a.transform[4] - b.transform[4];
    });

    let lines: string[] = [];
    let currentLine: any[] = [items[0]];
    for (let j = 1; j < items.length; j++) {
      const prev = currentLine[currentLine.length - 1];
      const dy = Math.abs((items[j] as any).transform[5] - prev.transform[5]);
      if (dy > 2) {
        lines.push(currentLine.map((x: any) => x.str).join(' '));
        currentLine = [items[j]];
      } else {
        currentLine.push(items[j]);
      }
    }
    lines.push(currentLine.map((x: any) => x.str).join(' '));
    fullText += lines.join('\n') + '\n';
  }
  return fullText;
}

export async function extractTextItemsFromPDF(file: File): Promise<any[]> {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allItems: any[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        allItems.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          page: i,
        });
      }
    }
  }
  return allItems;
}
