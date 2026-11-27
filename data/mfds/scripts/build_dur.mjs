// 한국의약품안전관리원 DUR 파일데이터(공공데이터포털, raw/dur_files/*.csv)에서 성분별 dur/<id>.json을 만든다.
// 먼저 scripts/fetch_dur_files.sh로 파일을 받는다. 사용: node scripts/build_dur.mjs <mfds_targets.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'raw/dur_files');
const OUT = path.join(ROOT, 'dur');
fs.mkdirSync(OUT, { recursive: true });
const targets = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).targets;
const today = new Date().toISOString().slice(0, 10);

// sources.txt: "<데이터번호> <종류> <파일 이름>"
const sources = Object.fromEntries(fs.readFileSync(path.join(SRC, 'sources.txt'), 'utf8').trim().split('\n')
  .map(l => l.trim().split(' ')).map(([pk, kind, ...name]) => [kind, { url: `https://www.data.go.kr/data/${pk}/fileData.do`, file: name.join(' ') }]));

// 따옴표 안 줄바꿈까지 처리하는 CSV 스트림 읽기
async function* csvRows(file) {
  let field = '', row = [], q = false, head = null, first = true;
  // 파일은 EUC-KR(CP949)로 되어 있다. UTF-8 BOM이 있으면 UTF-8로 읽는다.
  const fd = fs.openSync(file, 'r'), bom = Buffer.alloc(3);
  fs.readSync(fd, bom, 0, 3, 0); fs.closeSync(fd);
  const dec = new TextDecoder(bom.equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 'utf-8' : 'euc-kr');
  for await (const buf of fs.createReadStream(file, { highWaterMark: 1 << 20 })) {
    let s = dec.decode(buf, { stream: true });
    if (first) { s = s.replace(/^﻿/, ''); first = false; }
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') {
        row.push(field.replace(/\r$/, '')); field = '';
        if (!head) head = row.map(h => h.trim());
        else yield Object.fromEntries(head.map((h, j) => [h, (row[j] ?? '').trim()]));
        row = [];
      } else field += c;
    }
  }
  if (field || row.length) { row.push(field); if (head) yield Object.fromEntries(head.map((h, j) => [h, (row[j] ?? '').trim()])); }
}

// 영문 성분명이 대상 성분과 맞는지: 쉼표·+·/·괄호로 나눈 조각이 영문명으로 시작하면 맞음
const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
const parts = s => norm(s).split(/[,+/()·ㆍ;]| and /).map(x => x.trim()).filter(Boolean);
const keys = targets.map(t => ({ id: t.id, k: t.k.map(norm) }));
const cache = new Map();
function idsFor(name) {
  if (cache.has(name)) return cache.get(name);
  const ps = parts(name);
  const ids = keys.filter(t => t.k.some(k => ps.some(p => p === k || p.startsWith(k + ' ') || p.startsWith(k)))).map(t => t.id);
  cache.set(name, ids);
  return ids;
}

const D = Object.fromEntries(targets.map(t => [t.id, {
  contraindicated_with: new Map(), age: new Map(), pregnancy: new Map(), elderly: new Map(),
  dose: new Map(), duration: new Map(), class_duplication: new Map(), sr_split: new Map(), used: new Set(),
}]));
const add = (id, key, k, v, src) => { const d = D[id]; if (!d[key].has(k)) d[key].set(k, v); d.used.add(src); };

async function each(kind, fn) {
  const f = path.join(SRC, `${kind}.csv`);
  if (!fs.existsSync(f)) { console.log(`없음: ${kind}`); return; }
  let n = 0;
  for await (const r of csvRows(f)) { fn(r); n++; }
  console.log(`${kind}: ${n}줄`);
}

await each('병용금기', r => {
  for (const [me, other] of [['A', 'B'], ['B', 'A']])
    for (const id of idsFor(r['성분명' + me])) {
      const ing = r['성분명' + other], reason = r['금기사유'];
      add(id, 'contraindicated_with', `${ing}\u0000${reason}`, { ingredient: ing, reason, self: r['성분명' + me], ...(r['비고'] ? { remark: r['비고'] } : {}) }, '병용금기');
    }
});
await each('연령금기', r => {
  for (const id of idsFor(r['성분명'])) {
    const unit = r['특정연령단위'].replace(/\s*\(\d+\)/, ''), cond = r['연령처리조건'].replace(/\s*\(\d+\)/, '');
    const text = `${r['특정연령']}${unit} ${cond}: ${r['상세정보']}`.trim();
    add(id, 'age', text, { text, ingredient: r['성분명'] }, '연령금기');
  }
});
await each('임부금기', r => {
  for (const id of idsFor(r['성분명']))
    add(id, 'pregnancy', `${r['금기등급']}\u0000${r['상세정보']}`, { grade: r['금기등급'], reason: r['상세정보'], ingredient: r['성분명'] }, '임부금기');
});
await each('노인주의', r => {
  // 이 파일에는 사유 열이 없다(성분·제품 목록만 제공).
  for (const id of idsFor(r['성분명']))
    add(id, 'elderly', r['성분명'], { reason: r['상세정보'] || r['금기사유'] || '', ingredient: r['성분명'] }, '노인주의');
});
await each('용량주의', r => {
  for (const id of idsFor(r['일반명(복합제의 경우 1성분만 표시됨)'] || r['일반명'])) {
    const text = `1일 최대투여량: ${r['1일 최대투여량']}`;
    add(id, 'dose', text, { text }, '용량주의');
  }
});
await each('투여기간주의', r => {
  for (const id of idsFor(r['일반명'])) {
    const text = `최대투여기간: ${r['최대투여기간일수']}일${r['비고'] ? ` (${r['비고']})` : ''}`;
    add(id, 'duration', text, { text }, '투여기간주의');
  }
});
await each('효능군중복', r => {
  for (const id of idsFor(r['일반명']))
    add(id, 'class_duplication', `${r['효능군']}\u0000${r['그룹구분']}`, { group: r['효능군'], subgroup: r['그룹구분'], code: r['효능군중복점검코드'] }, '효능군중복');
});
await each('분할주의', r => {
  for (const id of idsFor(r['성분명'] || r['일반명'] || ''))
    add(id, 'sr_split', r['제품명'] || '', { text: [r['제품명'], r['상세정보'] || r['비고']].filter(Boolean).join(': ') }, '분할주의');
});

let withAny = 0;
for (const t of targets) {
  const d = D[t.id];
  if (d.used.size) withAny++;
  const out = { id: t.id, fetched: today,
    source: Object.entries(sources).map(([kind, s]) => `${kind}: ${s.url} (${s.file})`).join('; '),
    matchedBy: t.k };
  for (const key of ['contraindicated_with', 'age', 'pregnancy', 'elderly', 'dose', 'duration', 'class_duplication', 'sr_split'])
    out[key] = [...d[key].values()];
  if (!sources['분할주의']) out.note = '서방정 분할주의는 인증키 없이 받을 수 있는 공식 파일을 찾지 못해 비워 두었습니다.';
  fs.writeFileSync(path.join(OUT, `${t.id}.json`), JSON.stringify(out, null, 1) + '\n', 'utf8');
}
console.log(`dur 파일 ${targets.length}개 작성, DUR 항목이 하나라도 있는 성분 ${withAny}개`);
