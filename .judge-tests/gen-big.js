const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, 'files', 'big.csv');
const ws = fs.createWriteStream(out);
ws.write('Date,Source,Total\n');
const row = '2026-01-01,GoTab,' + '9'.repeat(50) + '\n';
let written = 20;
const target = 10 * 1024 * 1024;
function writeMore() {
  let ok = true;
  while (written < target && ok) {
    ok = ws.write(row);
    written += row.length;
  }
  if (written < target) {
    ws.once('drain', writeMore);
  } else {
    ws.end();
  }
}
writeMore();
ws.on('finish', () => console.log('wrote', written, 'bytes to', out));
