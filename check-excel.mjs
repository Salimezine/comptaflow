import XLSX from 'xlsx';
import fs from 'fs';

const dir = 'D:\\base de paie\\';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xls') || f.endsWith('.xlsx'));

for (const f of files) {
  try {
    const wb = XLSX.readFile(dir + f);
    const ws = wb.Sheets['DP'];
    if (!ws) { console.log(f, 'NO DP SHEET'); continue; }
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const hdr = data[3] || [];
    let empCount = 0;
    for (let i = 4; i < data.length; i++) {
      if (data[i] && data[i][3]) empCount++;
    }
    console.log(f.substring(0, 50).padEnd(52), 'Sheets:', wb.SheetNames.length, 'HdrCols:', hdr.filter(c => c).length, 'Emps:', empCount);
  } catch (e) {
    console.log(f, 'ERROR:', e.message);
  }
}
