import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../browser-runtime.js', import.meta.url), 'utf8');
function setup(claude) {
  const blobs = [], links = [], revoked = [], timers = [];
  const elements = Object.fromEntries(['localRun', 'alt', 'backup', 'desk'].map(id => [id, {
    children: [], detail: {}, append(...items) { this.children.push(...items); },
    querySelector() { return this.detail; }
  }]));
  const originalAsk = async () => 'Claude response';
  const context = vm.createContext({
    window: claude ? { claude } : {}, downloads: null, sample: null, ask: originalAsk,
    runBtn: { disabled: true }, $: id => elements[id], status: '',
    setStatus(message) { context.status = message; },
    Blob, ArrayBuffer, Uint8Array, TypeError,
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:download-' + blobs.length; },
      revokeObjectURL(url) { revoked.push(url); } },
    setTimeout(fn) { timers.push(fn); },
    document: { body: { append(link) { links.push(link); } },
      createElement() { return { clicked: false, removed: false,
        click() { this.clicked = true; }, remove() { this.removed = true; } }; } },
    el(tag, attrs) { return { tag, ...attrs, addEventListener() {} }; },
    copyText() {}
  });
  vm.runInContext(source, context);
  return { context, elements, blobs, links, revoked, timers, originalAsk };
}

test('browser export preserves Korean TXT, JSON and binary ZIP contents', async () => {
  const state = setup();
  const txt = '\ufeff약국이 저장 기록\r\n회원 1\r\n메모: 시험 기록';
  const json = JSON.stringify({ app: '약국이', v: 1, list: [{ label: '시험 회원' }] });
  const zip = new Uint8Array([80, 75, 3, 4, 0, 255, 128]);
  await state.context.downloads.save({ filename: '약국이.txt', data: txt });
  await state.context.downloads.save({ filename: '백업.json', data: json });
  await state.context.downloads.save({ filename: '아이콘.zip', data: zip });
  assert.deepEqual(new Uint8Array(await state.blobs[0].arrayBuffer()), new TextEncoder().encode(txt));
  assert.equal(await state.blobs[1].text(), json);
  assert.deepEqual(new Uint8Array(await state.blobs[2].arrayBuffer()), zip);
  assert.deepEqual(state.links.map(link => link.download), ['약국이.txt', '백업.json', '아이콘.zip']);
  assert.ok(state.links.every(link => link.clicked && link.removed));
  assert.equal(state.blobs[2].type, 'application/zip');
  state.timers.forEach(fn => fn());
  assert.equal(state.revoked.length, 3);
});

test('browser startup offers local analysis without claiming an AI connection', () => {
  const { context, elements } = setup();
  assert.equal(context.runBtn.disabled, false);
  assert.equal(context.runBtn.textContent, '내장 자료로 정리하기');
  assert.equal(elements.localRun.hidden, true);
  assert.equal(context.sample, null);
  assert.match(context.status, /AI 자동설명과 사진 읽기는 연결되어 있지 않습니다/);
  assert.match(elements.backup.children[0].text, /자동으로 옮겨지지 않습니다/);
});

test('the existing Claude integration is left intact', () => {
  const { context, originalAsk, elements } = setup({ use() {} });
  assert.equal(context.downloads, null);
  assert.equal(context.ask, originalAsk);
  assert.equal(context.runBtn.disabled, true);
  assert.equal(elements.backup.children.length, 0);
});
