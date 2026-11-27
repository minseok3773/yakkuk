// products/, labels/, dur/를 훑어 summary.json을 만든다. 사용: node scripts/make_summary.mjs <mfds_targets.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).targets;
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };
const DUR_KEYS = ['contraindicated_with', 'age', 'pregnancy', 'elderly', 'dose', 'duration', 'class_duplication', 'sr_split'];

const failed = read('raw/failed.json') || [];
const rows = [];
let nP = 0, nL = 0, nD = 0;
for (const t of targets) {
  const p = read(`products/${t.id}.json`), l = read(`labels/${t.id}.json`), d = read(`dur/${t.id}.json`);
  const label = !!(l && l.itemSeq), dur = !!(d && DUR_KEYS.some(k => d[k] && d[k].length));
  if (p) nP++; if (label) nL++; if (d) nD++;
  const notes = [];
  if (!p) notes.push('제품 목록을 받지 못했습니다.');
  else if (!p.total) notes.push(`의약품안전나라에서 정상 품목을 찾지 못했습니다(검색: ${p.query.join(', ')}).`);
  else if (p.total > p.kept) notes.push(`전체 ${p.total}개 중 ${p.kept}개만 저장했습니다.`);
  if (l && l.note) notes.push(l.note);
  if (d && !dur) notes.push('DUR 공개 파일에 해당 항목이 없습니다.');
  rows.push({ id: t.id, kind: t.kind, products: p ? p.kept : 0, label, dur,
    mfdsName: p && p.mfdsName && p.mfdsName.length ? p.mfdsName[0] : null, note: notes.join(' ') });
  if (!p && !failed.some(f => f.id === t.id)) failed.push({ id: t.id, reason: '제품 목록 파일이 없습니다(받기가 끝나지 않았거나 실패).' });
  else if (p && !p.total && !failed.some(f => f.id === t.id)) failed.push({ id: t.id, reason: '의약품안전나라에 이 성분의 정상 품목이 없습니다.' });
}
const summary = { fetched: new Date().toISOString().slice(0, 10),
  counts: { targets: targets.length, products: nP, labels: nL, dur: nD }, targets: rows, failed };
fs.writeFileSync(path.join(ROOT, 'summary.json'), JSON.stringify(summary, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(summary.counts), '실패/없음', failed.length);
