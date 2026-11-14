"""Fictional browser integration checks. Server must already run on port 8000."""
import json
from playwright.sync_api import sync_playwright, expect
URL='http://127.0.0.1:8000'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 requests=[];page.on('request',lambda r:requests.append(r.url))
 page.goto(URL);page.locator('#caseSave').click();assert '가상 사례' in page.locator('#caseStatus').inner_text()
 page.locator('#fictional').check();page.locator('#caseTitle').fill('가상 사례 A');page.locator('#symTimeline').fill('가상: 11월 1일 보행 불편, 3일 호전')
 page.locator('#caseSummary').click();assert '자동으로 추정하지 않음' in page.locator('#summaryText').input_value()
 page.locator('#alt').evaluate('(e)=>e.open=true')
 payload={'drugs':[{'input':'가상 약 A','ingredient_en':['lorazepam']},{'input':'가상 약 B','ingredient_en':['lorazepam']}], 'checklist':[{'area':'가상 관찰','items':[{'sign':'가상 졸림','related':[]}]}]}
 page.locator('#altIn').fill(json.dumps(payload));page.locator('#altRun').click();assert '같은 성분' in page.locator('#result').inner_text()
 page.locator('#memo').fill('가상 지원 메모');page.locator('#caseSave').click();page.reload();page.locator('#caseList').select_option(index=1);page.locator('#caseLoad').click();assert page.locator('#memo').input_value()=='가상 지원 메모'
 assert '같은 성분' in page.locator('#result').inner_text();assert page.locator('#symTimeline').input_value().endswith('3일 호전')
 page.locator('#fictional').check()
 with page.expect_download() as d:page.locator('#caseExport').click()
 exported=json.load(open(d.value.path()));assert len(exported['records'])==1
 page.locator('#caseImport').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"version":1,"records":[{}]}'})
 assert '손상된' in page.locator('#caseStatus').inner_text();assert page.locator('#caseList option').count()==2
 page.locator('#caseImport').set_input_files({'name':'same.json','mimeType':'application/json','buffer':json.dumps(exported).encode()});assert '동일 ID' in page.locator('#caseStatus').inner_text()
 other=browser.new_page();other.goto(URL);other.locator('#fictional').check();other.locator('#caseImport').set_input_files({'name':'valid.json','mimeType':'application/json','buffer':json.dumps(exported).encode()});expect(other.locator('#caseList option')).to_have_count(2)
 # Mock only the platform AI boundary, never a real API request.
 page.evaluate('''() => { window.calls=0; sample=async()=>{window.calls++;return {text:'가상 설명'}}; }''')
 assert page.evaluate("guardedSample('가상 학습')")=={'text':'가상 설명'}
 assert page.evaluate("guardedSample('가상 학습')")=={'text':'가상 설명'};assert page.evaluate('calls')==1
 page.evaluate("() => {sample=async()=>{window.calls++;throw Object.assign(new Error('quota'),{status:429})};}")
 assert page.evaluate("guardedSample('다른 가상 질문').then(()=>false,()=>true)")
 assert page.evaluate("guardedSample('또 다른 질문').then(()=>false,()=>true)");assert page.evaluate('calls')==2
 assert page.evaluate("guardedSample('가상 학습')")=={'text':'가상 설명'}
 page.locator('#caseSave').click();assert '저장했습니다' in page.locator('#caseStatus').inner_text()
 page.evaluate("() => {localStorage.removeItem(LIMIT); sample=async()=>{throw new Error('network failure')};}")
 assert page.evaluate("guardedSample('통신 오류 질문').then(()=>false,e=>e.message)")=='network failure'
 page.evaluate("() => {sample=async()=>({oops:true});}")
 assert page.evaluate("guardedSample('형식 오류 질문').then(()=>false,e=>e.message)")=='AI 응답 형식 오류'
 # A failed local save must preserve previous persisted data.
 page.evaluate("() => {Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')};}")
 page.locator('#caseSave').click();assert '저장 실패' in page.locator('#caseStatus').inner_text()
 page.set_viewport_size({'width':390,'height':844});assert page.locator('h1').is_visible()
 assert not errors,errors
 assert all(u.startswith(URL) for u in requests),requests
 browser.close()
 print('PASS: consent, summary, legacy rendering/rules, persistence, memo, export/import validation, AI cache, 429 pause, offline/error responses, storage failure, mobile, no external requests')
