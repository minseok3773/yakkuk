// 의약품안전나라(nedrug.mfds.go.kr)에서 성분별 제품 목록(products/)과 대표 제품 허가사항(labels/)을 받는다.
// 사용: node scripts/fetch_mfds.mjs <mfds_targets.json> [id,id,...]
// - 요청 사이 1.1초 이상 쉰다. 접속 차단·보안문자·연속 오류가 나면 멈춘다(종료 코드 3).
// - 이미 받은 성분(products/<id>.json, 필요하면 labels/<id>.json)은 건너뛴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://nedrug.mfds.go.kr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const GAP_MS = 1100;
const MAX_KEEP = 500;
const today = new Date().toISOString().slice(0, 10);

const targets = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).targets;
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;

const dir = p => (fs.mkdirSync(path.join(ROOT, p), { recursive: true }), path.join(ROOT, p));
const D = {
  products: dir('products'), labels: dir('labels'),
  rawSearch: dir('raw/search'), rawDetail: dir('raw/detail'), rawLabel: dir('raw/label'),
  cache: dir('raw/ingr_cache'), log: path.join(ROOT, 'raw/fetch.log'),
};
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(D.log, `${new Date().toISOString()} ${s}\n`); };
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n', 'utf8');

class Stop extends Error {}
let last = 0, errStreak = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, opt = {}) {
  for (let attempt = 1; ; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let res, buf;
    try {
      res = await fetch(url.startsWith('http') ? url : BASE + url, {
        ...opt, headers: { 'User-Agent': UA, Referer: BASE + '/searchDrug', ...(opt.headers || {}) },
        signal: AbortSignal.timeout(60000),
      });
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) { res = null; buf = Buffer.from(String(e)); }
    const text = buf.toString('utf8');
    if (res && (res.status === 403 || res.status === 429)) throw new Stop(`접속 차단(HTTP ${res.status}): ${url}`);
    if (/captcha|보안문자|자동입력\s*방지/i.test(text.slice(0, 20000)) && !/\.xml|getExcel/.test(url)) throw new Stop(`보안문자 요구: ${url}`);
    if (res && res.ok) { errStreak = 0; return { buf, text, res }; }
    errStreak++;
    log(`  오류 ${res ? res.status : 'network'} (${attempt}회) ${url}`);
    if (errStreak >= 8) throw new Stop(`오류가 계속됨: ${url}`);
    if (attempt >= 3) return null;
    await sleep(5000 * attempt);
  }
}

// ---------- xlsx(인라인 문자열) 읽기 ----------
import zlib from 'node:zlib';
function unzipEntry(buf, name) {
  // 중앙 디렉터리에서 항목을 찾아 압축을 푼다.
  let eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdCount = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
  let p = cdOff;
  for (let i = 0; i < cdCount; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42), fname = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (fname === name) {
      const ln = buf.readUInt16LE(lho + 26), lx = buf.readUInt16LE(lho + 28);
      const data = buf.subarray(lho + 30 + ln + lx, lho + 30 + ln + lx + csize);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}
const xmlDecode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
function readXlsx(buf) {
  const xml = unzipEntry(buf, 'xl/worksheets/sheet1.xml');
  if (!xml) return [];
  const rows = [];
  for (const r of xml.split('<row ').slice(1)) {
    const row = {};
    for (const m of r.matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const t = m[2] ? [...m[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('') : '';
      row[m[1]] = xmlDecode(t).trim();
    }
    rows.push(row);
  }
  const head = rows.shift() || {};
  const cols = Object.fromEntries(Object.entries(head).map(([k, v]) => [v, k]));
  return rows.map(r => new Proxy(r, { get: (o, k) => o[cols[k]] ?? '' }));
}

// ---------- 제품 검색(엑셀 내려받기) ----------
async function searchExcel(field, value, id) {
  const form = new URLSearchParams({
    searchYn: 'true', page: '1', searchDivision: 'detail', itemName: '', entpName: '', [field]: value,
    cancelYn: 'N', ExcelRowdata: '0', ExcelRowdata1: '0', ExcelRowdata2: '0', excelSearchCnt: '10000', ExcelRowdataSB: '0',
  });
  const r = await get('/searchDrug/getExcel', { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!r) throw new Error(`검색 실패: ${value}`);
  fs.mkdirSync(path.join(D.rawSearch, id), { recursive: true });
  fs.writeFileSync(path.join(D.rawSearch, id, `${field}_${value}.xlsx`), r.buf);
  return readXlsx(r.buf);
}

const norm = s => s.replace(/\s+/g, '').toLowerCase();
function matches(row, t) {
  const ko = row['주성분'].split('/').map(norm), en = row['주성분영문'].split('/').map(norm);
  const kos = t.ko.map(norm), ens = t.k.map(norm);
  const hit = ko.filter(p => kos.some(k => p.startsWith(k)));
  const hitEn = en.map((p, i) => ens.some(k => p.startsWith(k)) ? i : -1).filter(i => i >= 0);
  const names = row['주성분'].split('/').map(s => s.trim());
  return hit.length || hitEn.length ? [...new Set([...names.filter(n => kos.some(k => norm(n).startsWith(k))), ...hitEn.map(i => names[i]).filter(Boolean)])] : null;
}

// ---------- 상세 페이지(원료약품 및 분량, 변경이력) ----------
const stripTags = s => xmlDecode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t ]+/g, ' ').trim();
async function detail(itemSeq, keepFull) {
  const cf = path.join(D.cache, `${itemSeq}.json`);
  if (fs.existsSync(cf)) {
    const c = JSON.parse(fs.readFileSync(cf, 'utf8'));
    if (!keepFull || fs.existsSync(path.join(D.rawLabel, `${itemSeq}.html`))) return c;
  }
  const r = await get(`/pbp/CCBBB01/getItemDetail?itemSeq=${itemSeq}`);
  if (!r) return null;
  const h = r.text;
  const a = h.indexOf('id="scroll_02"'), b = h.indexOf('id="scroll_03"', a);
  const sec = a >= 0 ? h.slice(a, b > a ? b : a + 200000) : '';
  fs.writeFileSync(path.join(D.rawDetail, `${itemSeq}.html`), sec.replace(/<script>[\s\S]*?<\/script>/g, ''));
  if (keepFull) fs.writeFileSync(path.join(D.rawLabel, `${itemSeq}.html`), h);
  const ingredients = [];
  for (const tb of sec.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)) {
    for (const tr of tb[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const td = [...tr[1].replace(/<script>[\s\S]*?<\/script>/g, '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => stripTags(m[1]));
      if (td.length >= 4 && /^\d+$/.test(td[0])) ingredients.push({ name: td[1], amount: td[2], unit: td[3], ...(td[5] ? { info: td[5] } : {}) });
    }
  }
  const basis = [...sec.matchAll(/<h3 class="cont_title3[^"]*"[^>]*>([\s\S]*?)<\/h3>/g)].map(m => stripTags(m[1]));
  const changes = [];
  const ch = h.indexOf('id="tblChf"');
  if (ch >= 0) for (const tr of h.slice(ch, h.indexOf('</table>', ch)).matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const sp = [...tr[1].matchAll(/<span>([\s\S]*?)<\/span>/g)].map(m => stripTags(m[1]));
    if (sp.length >= 3) changes.push({ date: sp[1], item: sp[2] });
  }
  const c = { itemSeq, ingredients, basis, changes };
  writeJson(cf, c);
  return c;
}

// ---------- 허가사항 XML(효능효과 EE, 용법용량 UD, 사용상의주의사항 NB) ----------
function cdataText(s) {
  const raw = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return xmlDecode(raw.replace(/<\/(td|th)>/gi, '\t').replace(/<\/tr>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[  ]+/g, ' ').replace(/\t+\n/g, '\n').trim();
}
function parseDoc(xml) {
  const out = [];
  for (const sec of xml.matchAll(/<SECTION([^>]*)>([\s\S]*?)<\/SECTION>/g)) {
    const st = xmlDecode((sec[1].match(/title="([^"]*)"/) || [])[1] || '');
    const arts = [...sec[2].matchAll(/<ARTICLE([^>]*?)(?:\/>|>([\s\S]*?)<\/ARTICLE>)/g)];
    for (const art of arts) {
      const at = xmlDecode((art[1].match(/title="([^"]*)"/) || [])[1] || '');
      const paras = [...(art[2] || '').matchAll(/<PARAGRAPH[^>]*>([\s\S]*?)<\/PARAGRAPH>/g)].map(m => cdataText(m[1])).filter(Boolean);
      out.push({ title: [st, at].filter(Boolean).join(' / '), text: paras.join('\n') });
    }
    if (!arts.length) {
      const paras = [...sec[2].matchAll(/<PARAGRAPH[^>]*>([\s\S]*?)<\/PARAGRAPH>/g)].map(m => cdataText(m[1])).filter(Boolean);
      out.push({ title: st, text: paras.join('\n') });
    }
  }
  return out;
}
const docText = parts => parts.map(p => [p.title, p.text].filter(Boolean).join('\n')).join('\n');
async function labelDocs(itemSeq) {
  const res = {};
  for (const ty of ['EE', 'UD', 'NB']) {
    const r = await get(`/pbp/cmn/xml/drb/${itemSeq}/${ty}`);
    const xml = r ? r.text : '';
    fs.writeFileSync(path.join(D.rawLabel, `${itemSeq}_${ty}.xml`), xml);
    res[ty] = xml.includes('<DOC') ? parseDoc(xml) : null;
  }
  return res;
}

// ---------- 성분 하나 처리 ----------
async function doTarget(t) {
  const pf = path.join(D.products, `${t.id}.json`), lf = path.join(D.labels, `${t.id}.json`);
  const needLabel = t.kind !== 'rule';
  if (fs.existsSync(pf) && (!needLabel || fs.existsSync(lf))) return 'skip';

  const query = [], found = new Map(), names = new Map();
  const run = async (field, value) => {
    query.push(value);
    for (const row of await searchExcel(field, value, t.id)) {
      if (row['취소/취하'] !== '정상' || row['완제/원료'] === '원료의약품') continue;
      const m = matches(row, t);
      if (!m) continue;
      m.forEach(n => names.set(n, (names.get(n) || 0) + 1));
      found.set(row['품목기준코드'], row);
    }
  };
  for (const ko of t.ko) await run('ingrName1', ko);
  if (!found.size) for (const k of t.k) await run('ingrEngName', k);

  const items = [...found.values()].map(r => ({
    itemSeq: r['품목기준코드'], name: r['제품명'], company: r['업체명'],
    type: r['전문의약품'] === '전문의약품' ? '전문' : r['전문의약품'] === '일반의약품' ? '일반' : r['전문의약품'],
    single: !r['주성분'].includes('/'), permitDate: r['허가일'],
  }));
  items.sort((a, b) => (b.single - a.single) || ((a.type === '전문' ? 0 : 1) - (b.type === '전문' ? 0 : 1)) || a.permitDate.localeCompare(b.permitDate));
  const kept = items.slice(0, MAX_KEEP);
  const mfdsName = [...names.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);

  // 대표 제품: 단일 성분 전문의약품 가운데 가장 먼저 허가된 정상 품목
  let rep = null, note = '';
  if (needLabel && kept.length) {
    const byDate = (a, b) => a.permitDate.localeCompare(b.permitDate);
    rep = kept.filter(i => i.single && i.type === '전문').sort(byDate)[0];
    if (!rep) { rep = kept.filter(i => i.single).sort(byDate)[0]; if (rep) note = `단일 성분 전문의약품이 없어 단일 성분 ${rep.type}의약품 중 가장 먼저 허가된 품목을 골랐습니다.`; }
    if (!rep) { rep = [...kept].sort(byDate)[0]; note = '단일 성분 제품이 없어 이 성분이 든 복합제 중 가장 먼저 허가된 품목을 골랐습니다.'; }
  }

  log(`${t.id}: 찾음 ${items.length}, 저장 ${kept.length}, 식약처 표기 ${mfdsName.slice(0, 3).join(', ')}`);
  const out = [];
  let i = 0;
  for (const it of kept) {
    const d = await detail(it.itemSeq, rep && rep.itemSeq === it.itemSeq);
    if (++i % 50 === 0) log(`  ${t.id}: 상세 ${i}/${kept.length}`);
    out.push({
      itemSeq: it.itemSeq, name: it.name, company: it.company, type: it.type,
      ingredients: d ? d.ingredients.map(({ name, amount, unit }) => ({ name, amount, unit })) : [],
      permitDate: it.permitDate, url: `${BASE}/pbp/CCBBB01/getItemDetail?itemSeq=${it.itemSeq}`,
    });
  }
  writeJson(pf, { id: t.id, query, fetched: today, total: items.length, kept: kept.length, mfdsName, items: out });

  if (needLabel) {
    if (!rep) { writeJson(lf, { id: t.id, itemSeq: null, fetched: today, note: '의약품안전나라에서 정상 품목을 찾지 못했습니다.' }); return 'nolabel'; }
    const d = await detail(rep.itemSeq, true);
    const docs = await labelDocs(rep.itemSeq);
    const ch = (d && d.changes) || [];
    const rel = ch.filter(c => /효능|용법|주의|허가사항/.test(c.item));
    const revised = (rel[0] || ch[0] || {}).date || null;
    writeJson(lf, {
      id: t.id, itemSeq: rep.itemSeq, name: rep.name, company: rep.company,
      url: `${BASE}/pbp/CCBBB01/getItemDetail?itemSeq=${rep.itemSeq}`, fetched: today, revised,
      efficacy: docs.EE ? docText(docs.EE) : null, dosage: docs.UD ? docText(docs.UD) : null,
      precautions: docs.NB || [],
      note: [note, !docs.NB ? '사용상의주의사항 XML을 받지 못했습니다.' : ''].filter(Boolean).join(' '),
    });
  }
  return 'ok';
}

const failed = [];
try {
  for (const t of targets) {
    if (only && !only.has(t.id)) continue;
    try { await doTarget(t); }
    catch (e) { if (e instanceof Stop) throw e; log(`실패 ${t.id}: ${e.message}`); failed.push({ id: t.id, reason: e.message }); }
  }
} catch (e) {
  if (e instanceof Stop) { log(`멈춤: ${e.message}`); writeJson(path.join(ROOT, 'raw/failed.json'), failed); process.exit(3); }
  throw e;
}
writeJson(path.join(ROOT, 'raw/failed.json'), failed);
log('완료');
