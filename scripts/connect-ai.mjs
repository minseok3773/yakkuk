// Run only after deploying the backend. Verifies a fictional inference before
// writing its public address into ai-config.js. Never writes authentication keys.
import { readFile, writeFile } from 'node:fs/promises';
const [raw] = process.argv.slice(2);
if (!raw) throw new Error('Usage: npm run connect:api -- https://yakkuk-ai.ACCOUNT.workers.dev/');
const endpoint = new URL(raw);
if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.workers.dev') || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('Use the HTTPS root address of the deployed Worker, without a token.');
const config = JSON.parse((await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')));
const headers = { 'Origin': config.vars.ALLOWED_ORIGIN, 'Content-Type': 'application/json' };
const status = await fetch(new URL('/api/status', endpoint), { headers, signal: AbortSignal.timeout(10000) });
if (!status.ok || !(await status.json()).configured) throw new Error('Backend status is not ready. Frontend configuration was not changed.');
const result = await fetch(new URL('/api/analyze', endpoint), { method: 'POST', headers, signal: AbortSignal.timeout(60000),
  body: JSON.stringify({ fictional: true, kind: 'study', prompt: '가상 정보로 기능을 확인합니다. 실제 의학적 판단은 하지 마세요. 약 이름이 불분명할 때 성분을 추측하지 않고 의료진에게 확인해야 한다는 학습 안내를 한국어 두 문장으로 작성해 주세요.' }) });
const output = await result.json();
if (!result.ok || typeof output.text !== 'string' || !/[가-힣]/.test(output.text)) throw new Error('The fictional study check failed: HTTP ' + result.status + ', ' + (output.error?.code || 'invalid_text') + '. Frontend configuration was not changed.');
const analysis = await fetch(new URL('/api/analyze', endpoint), { method: 'POST', headers, signal: AbortSignal.timeout(60000),
  body: JSON.stringify({ fictional: true, kind: 'analysis', prompt: `가상 사례 기능 검증이다. 실제 환자가 아니다. 가상약 A는 이름을 확인할 수 없는 약이므로 성분을 추측하지 말고 unsure=true, ingredient="확인 필요", ingredient_en=[]로 표시한다. 증상은 가상의 졸림이다. 원인을 진단하거나 약을 바꾸도록 권하지 않는다. 다음 JSON 하나만 한국어로 출력한다. 배열에는 필요한 내용만 넣고 없으면 빈 배열로 한다.
{"urgent":[],"drugs":[{"input":"가상약 A","ingredient":"확인 필요","ingredient_en":[],"unsure":true}],"combos":[],"checklist":[],"observations":[],"questions":["확인할 약 이름을 의료진에게 문의"],"plan":[],"member_talk":[]}` }) });
const analyzed = await analysis.json();
if (!analysis.ok || typeof analyzed.text !== 'string') throw new Error('The fictional analysis check failed: HTTP ' + analysis.status + ', ' + (analyzed.error?.code || 'invalid_text') + '. Frontend configuration was not changed.');
const parsed = JSON.parse(analyzed.text);
if (!Array.isArray(parsed.drugs) || parsed.drugs.length !== 1 || parsed.drugs[0].unsure !== true || parsed.drugs[0].ingredient_en?.length !== 0 || parsed.urgent?.length !== 0) throw new Error('The fictional unknown-drug safety check failed. Frontend configuration was not changed.');
await writeFile(new URL('../ai-config.js', import.meta.url), '// Public server address only. Never put account tokens or AI keys in this file.\nwindow.YAKKUK_AI = Object.freeze(' + JSON.stringify({ endpoint: endpoint.href }) + ');\n');
console.log('Backend status, fictional study and fictional analysis passed (two AI calls). Public endpoint saved; no credentials written. Publish the tested frontend to gh-pages.');
