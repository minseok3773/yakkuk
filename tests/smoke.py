"""Fictional browser integration checks. Server must already run on port 8000."""
import json
from playwright.sync_api import sync_playwright, expect
URL='http://127.0.0.1:8000'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 # Reproduce the public website workflow: no window.claude and an actual submit click.
 web=browser.new_page();web_errors=[];web_requests=[]
 web.on('pageerror',lambda e:web_errors.append(str(e)))
 web.on('request',lambda r:web_requests.append(r.url))
 web.goto(URL);expect(web.locator('#run')).to_be_enabled()
 assert 'AI 없음' in web.locator('#run').inner_text()
 web.locator('#drugs').fill('');web.locator('#run').click()
 assert '복용 중인 약을' in web.locator('#status').inner_text()
 web.locator('#drugs').fill('가상 약 A 1mg 하루 1회')
 web.locator('#obs').fill('가상: 활동 후 졸림을 호소함')
 web.locator('#run').click();assert '가상 사례 확인란' in web.locator('#status').inner_text()
 web.locator('#fictional').check();web.locator('#medTimeline').fill('가상: 11월 1일 변경')
 web.locator('#symTimeline').fill('가상: 11월 2일 시작, 3일 호전')
 web.locator('#conditionsText').fill('가상 검사 10 단위, 출처 미확인')
 web.locator('#rehabNotes').fill('가상: 휴식 후 참여를 희망함')
 web.locator('#run').click()
 report=web.get_by_role('textbox',name='입력 내용 정리 결과',exact=True)
 assert '가상 약 A 1mg' in report.input_value() and '활동 후 졸림' in report.input_value()
 assert '외부 전송 없음' in web.locator('#status').inner_text()
 assert web.evaluate('lastData') is None
 web.get_by_role('button',name='AI 설명용 요청문 보기').click()
 expect(web.locator('#altPrompt')).to_be_visible()
 prompt=web.locator('#altPrompt').input_value()
 for fragment in ['가상 약 A','활동 후 졸림','11월 1일 변경','3일 호전','가상 검사 10','휴식 후 참여']:
  assert fragment in prompt
 web.evaluate("() => {Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied')}}});}")
 web.locator('#altCopy').click();expect(web.locator('#altCopy')).to_have_text('아래 내용을 직접 복사하세요')
 web.locator('#caseSave').click();web.reload();web.locator('#caseList').select_option(index=1);web.locator('#caseLoad').click()
 assert '활동 후 졸림' in web.get_by_role('textbox',name='입력 내용 정리 결과',exact=True).input_value()
 assert web.evaluate('lastData') is None
 assert not web_errors,web_errors
 assert all(u.startswith(URL) for u in web_requests),web_requests
 web.close()
 # Keep the existing Claude artifact path working, with a mock platform only.
 artifact=browser.new_page()
 artifact.add_init_script("""window.aiCalls=0; window.claude={use:async(kind)=>{
  if(kind!=='sample')return null;
  const fn=async()=>{window.aiCalls++;return {text:JSON.stringify({drugs:[{input:'가상 약'}]})};};
  fn.limits=async()=>({images:false});return fn;
 }};""")
 artifact.goto(URL);expect(artifact.locator('#run')).to_have_text('AI로 정리하기')
 artifact.locator('#run').click();assert artifact.evaluate('aiCalls')==0
 artifact.locator('#fictional').check();artifact.locator('#run').click()
 expect(artifact.locator('#status')).to_contain_text('정리를 마쳤습니다')
 assert artifact.evaluate('aiCalls')==1
 artifact.locator('#obs').fill('가상: 한도 초과 검증용 관찰')
 artifact.evaluate("() => {sample=async()=>{window.aiCalls++;throw Object.assign(new Error('quota'),{status:429});};}")
 artifact.locator('#run').click();expect(artifact.locator('#status')).to_contain_text('AI 요청 한도')
 artifact.locator('#run').click();expect(artifact.locator('#status')).to_contain_text('AI 요청 한도')
 assert artifact.evaluate('aiCalls')==2
 artifact.locator('#caseSummary').click()
 assert '한도 초과 검증용 관찰' in artifact.locator('#summaryText').input_value()
 artifact.close()
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
 expect(page.locator('#caseStatus')).to_contain_text('손상된');assert page.locator('#caseList option').count()==2
 page.locator('#caseImport').set_input_files({'name':'same.json','mimeType':'application/json','buffer':json.dumps(exported).encode()});expect(page.locator('#caseStatus')).to_contain_text('동일 ID')
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
 print('PASS: public-site submit without AI, input validation, prompt context and clipboard fallback, local summary restore, Claude artifact submit, consent, legacy rendering/rules, memo, export/import, AI cache, 429 pause, errors, mobile, no external requests')
