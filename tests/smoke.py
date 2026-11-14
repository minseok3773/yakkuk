"""Fictional browser integration checks; run a static server before this suite."""
import json
import os
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('YAKKUK_TEST_URL', 'http://127.0.0.1:8000').rstrip('/')
errors, requests = [], []


def watch(page):
    # Exercise the no-server workflow even when production has a configured backend.
    page.route('**/ai-config.js*', lambda route: route.fulfill(
        content_type='application/javascript', body='window.YAKKUK_AI = {endpoint: ""};'))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: requests.append(r.url))
    return page


def lab(page):
    page.locator('#labLink').click()
    expect(page.locator('#labView')).to_be_visible()
    expect(page.locator('#mainView')).to_be_hidden()


def main(page):
    page.locator('#mainLink').click()
    expect(page.locator('#mainView')).to_be_visible()
    expect(page.locator('#labView')).to_be_hidden()


def additional(page):
    if not page.locator('#additionalFields').evaluate('(e)=>e.open'):
        page.locator('#additionalFields > summary').click()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    web = watch(browser.new_page())
    web.goto(URL)
    expect(web.locator('#mainView')).to_be_visible()
    expect(web.locator('#labView')).to_be_hidden()
    expect(web.locator('#additionalFields')).not_to_have_attribute('open', '')
    expect(web.locator('#run')).to_be_enabled()
    expect(web.locator('#run')).to_have_text('AI 분석 요청문 만들기')
    assert web.locator('#drugs').input_value() == ''
    web.locator('#run').click()
    expect(web.locator('#status')).to_contain_text('복용 중인 약을')
    web.locator('#drugs').fill('가상 약 A 1mg 하루 1회')
    web.locator('#obs').fill('가상: 활동 후 졸림을 호소함')
    web.locator('#run').click()
    expect(web.locator('#status')).to_contain_text('가상 사례 확인란')
    web.locator('#fictional').check()
    additional(web)
    extras = {'medTimeline': '가상: 11월 1일 변경', 'symTimeline': '가상: 11월 2일 시작, 3일 호전',
              'conditionsText': '가상 검사 10 단위, 출처 미확인', 'rehabNotes': '가상: 휴식 후 참여를 희망함'}
    for field, value in extras.items():
        web.locator('#' + field).fill(value)
    web.locator('#run').click()
    expect(web.locator('#altPrompt')).to_be_visible()
    prompt = web.locator('#altPrompt').input_value()
    for fragment in ['가상 약 A', '활동 후 졸림', *extras.values()]:
        assert fragment in prompt
    assert web.evaluate('lastData') is None
    assert '아직 분석 결과가 없습니다' in web.locator('#result').inner_text()
    web.evaluate("() => {Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied')}}});}")
    web.locator('#altCopy').click()
    expect(web.locator('#altCopy')).to_have_text('아래 내용을 직접 복사하세요')
    # A separate action creates an input summary without presenting it as AI analysis.
    web.locator('#inputSummary').click()
    report = web.get_by_role('textbox', name='입력 내용 정리 결과', exact=True)
    assert '가상 약 A 1mg' in report.input_value() and '활동 후 졸림' in report.input_value()
    lab(web)
    expect(web.locator('#labFictional')).to_be_checked()
    assert '가상 약 A' in web.locator('#labContext').inner_text()
    web.locator('#caseTitle').fill('가상 저장·화면 전환 시험')
    web.locator('#caseSave').click()
    expect(web.locator('#caseStatus')).to_contain_text('저장했습니다')
    stored = web.evaluate('localStorage.getItem(STORE)')
    main(web)
    assert web.locator('#obs').input_value() == '가상: 활동 후 졸림을 호소함'
    assert report.input_value() == web.locator('#summaryText').input_value()
    lab(web)
    assert web.evaluate('localStorage.getItem(STORE)') == stored
    web.reload()
    expect(web.locator('#labView')).to_be_visible()
    web.locator('#caseList').select_option(index=1)
    web.locator('#caseLoad').click()
    expect(web.locator('#mainView')).to_be_visible()
    assert '활동 후 졸림' in report.input_value()
    assert web.evaluate('lastData') is None
    assert web.locator('#symTimeline').input_value() == extras['symTimeline']
    web.set_viewport_size({'width': 390, 'height': 844})
    assert web.evaluate('document.documentElement.scrollWidth <= innerWidth')
    web.locator('#clear').click()
    assert web.locator('#medTimeline').input_value() == ''
    assert web.evaluate('localStorage.getItem(STORE)') == stored
    web.screenshot(path='/tmp/yakkuk-main-mobile.png', full_page=True)
    web.close()

    # Existing artifact AI still requires an explicit request and honors quota errors.
    artifact = watch(browser.new_page())
    artifact.add_init_script("""window.aiCalls=0; window.claude={use:async(kind)=>{
      if(kind!=='sample')return null;
      const fn=async()=>{window.aiCalls++;return {text:JSON.stringify({drugs:[{input:'가상 약'}]})};};
      fn.limits=async()=>({images:false});return fn;
    }};""")
    artifact.goto(URL)
    expect(artifact.locator('#run')).to_have_text('AI 분석 요청')
    artifact.locator('#drugs').fill('가상 약')
    artifact.locator('#run').click()
    assert artifact.evaluate('aiCalls') == 0
    artifact.locator('#fictional').check()
    artifact.locator('#run').click()
    expect(artifact.locator('#status')).to_contain_text('정리를 마쳤습니다')
    assert artifact.evaluate('aiCalls') == 1
    artifact.locator('#obs').fill('가상: 한도 초과 검증용 관찰')
    artifact.evaluate("() => {sample=async()=>{window.aiCalls++;throw Object.assign(new Error('quota'),{status:429});};}")
    artifact.locator('#run').click()
    expect(artifact.locator('#status')).to_contain_text('AI 요청 한도')
    artifact.locator('#run').click()
    expect(artifact.locator('#status')).to_contain_text('AI 요청 한도')
    assert artifact.evaluate('aiCalls') == 2
    artifact.locator('#inputSummary').click()
    assert '한도 초과 검증용 관찰' in artifact.get_by_role('textbox', name='입력 내용 정리 결과', exact=True).input_value()
    artifact.close()

    page = watch(browser.new_page())
    page.goto(URL)
    page.locator('#fillExample').click()
    page.locator('#fictional').check()
    additional(page)
    page.locator('#symTimeline').fill('가상: 11월 1일 보행 불편, 3일 호전')
    page.locator('#run').click()
    payload = {'drugs': [{'input': '가상 약 A', 'ingredient_en': ['lorazepam']},
                         {'input': '가상 약 B', 'ingredient_en': ['lorazepam']}],
               'checklist': [{'area': '가상 관찰', 'items': [{'sign': '가상 졸림', 'related': []}]}]}
    page.locator('#altIn').fill(json.dumps(payload))
    page.locator('#altRun').click()
    assert '같은 성분' in page.locator('#result').inner_text()
    page.locator('#memo').fill('가상 지원 메모')
    lab(page)
    page.locator('#caseTitle').fill('가상 사례 A')
    page.locator('#caseSave').click()
    page.reload()
    page.locator('#caseList').select_option(index=1)
    page.locator('#caseLoad').click()
    expect(page.locator('#mainView')).to_be_visible()
    assert page.locator('#memo').input_value() == '가상 지원 메모'
    assert '같은 성분' in page.locator('#result').inner_text()
    assert page.locator('#symTimeline').input_value().endswith('3일 호전')
    lab(page)
    page.locator('#labFictional').check()
    with page.expect_download() as download:
        page.locator('#caseExport').click()
    with open(download.value.path()) as f:
        exported = json.load(f)
    assert len(exported['records']) == 1
    page.locator('#caseImport').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{"version":1,"records":[{}]}'})
    expect(page.locator('#caseStatus')).to_contain_text('손상된')
    assert page.locator('#caseList option').count() == 2
    page.locator('#caseImport').set_input_files({'name': 'same.json', 'mimeType': 'application/json', 'buffer': json.dumps(exported).encode()})
    expect(page.locator('#caseStatus')).to_contain_text('동일 ID')
    other = watch(browser.new_page())
    other.goto(URL + '/#lab')
    other.locator('#labFictional').check()
    other.locator('#caseImport').set_input_files({'name': 'valid.json', 'mimeType': 'application/json', 'buffer': json.dumps(exported).encode()})
    expect(other.locator('#caseList option')).to_have_count(2)
    other.locator('#caseList').select_option(index=1)
    other.locator('#caseLoad').click()
    expect(other.locator('#mainView')).to_be_visible()
    assert other.locator('#memo').input_value() == '가상 지원 메모'
    assert '같은 성분' in other.locator('#result').inner_text()
    # Changing screens never starts inference; mock only the original platform boundary.
    main(page)
    page.evaluate("() => {window.calls=0;sample=async()=>{window.calls++;return {text:'가상 설명'}};}")
    assert page.evaluate("guardedSample('가상 학습')") == {'text': '가상 설명'}
    assert page.evaluate("guardedSample('가상 학습')") == {'text': '가상 설명'}
    assert page.evaluate('calls') == 1
    lab(page)
    main(page)
    assert page.evaluate('calls') == 1
    page.evaluate("() => {sample=async()=>{window.calls++;throw Object.assign(new Error('quota'),{status:429})};}")
    assert page.evaluate("guardedSample('다른 가상 질문').then(()=>false,()=>true)")
    assert page.evaluate("guardedSample('또 다른 질문').then(()=>false,()=>true)")
    assert page.evaluate('calls') == 2
    assert page.evaluate("guardedSample('가상 학습')") == {'text': '가상 설명'}
    lab(page)
    page.locator('#caseSave').click()
    expect(page.locator('#caseStatus')).to_contain_text('저장했습니다')
    page.evaluate("() => {localStorage.removeItem(LIMIT);sample=async()=>{throw new Error('network failure')};}")
    assert page.evaluate("guardedSample('통신 오류 질문').then(()=>false,e=>e.message)") == 'network failure'
    page.evaluate("() => {sample=async()=>({oops:true});}")
    assert page.evaluate("guardedSample('형식 오류 질문').then(()=>false,e=>e.message)") == 'AI 응답 형식 오류'
    page.evaluate("() => {Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')};}")
    page.locator('#caseSave').click()
    expect(page.locator('#caseStatus')).to_contain_text('저장 실패')
    assert not errors, errors
    assert all(url.startswith(URL) for url in requests), requests
    browser.close()
    print('PASS: focused main flow, separate lab view, hash navigation and draft preservation, stored summary/result/memo restoration, JSON backup compatibility, explicit AI requests, cache/quota/error handling, mobile layout, no external requests')
