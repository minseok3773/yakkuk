// 성분별 의약품안전나라 검색 건수만 센다(규모 가늠용).
import fs from 'node:fs';
const T = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).targets;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = {};
for (const t of T) {
  out[t.id] = {};
  for (const ko of t.ko) {
    const u = `https://nedrug.mfds.go.kr/searchDrug?searchYn=true&page=1&searchDivision=detail&itemName=&entpName=&ingrName1=${encodeURIComponent(ko)}&cancelYn=N`;
    const h = await (await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const m = h.match(/총 <strong>([0-9,]+)/);
    out[t.id][ko] = m ? +m[1].replace(/,/g, '') : -1;
    await sleep(1100);
  }
  console.log(t.id, t.kind, JSON.stringify(out[t.id]));
}
fs.writeFileSync('raw/totals.json', JSON.stringify(out, null, 1));
