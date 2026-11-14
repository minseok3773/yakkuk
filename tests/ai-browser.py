"""Browser transport tests with a mocked HTTPS Worker; never calls a real model."""
import json
import os
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('YAKKUK_TEST_URL', 'http://127.0.0.1:8000').rstrip('/')
API = 'https://yakkuk-ai.example'
MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast'
ANALYSIS = {'urgent': [], 'drugs': [{'input': '가상 약 A', 'ingredient': '확인 필요', 'ingredient_en': [], 'unsure': True}],
            'combos': [], 'checklist': [], 'observations': [], 'questions': ['의료진 확인'], 'plan': [], 'member_talk': []}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    calls, errors = [], []
    page = browser.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    mode = {'value': 'normal'}
    def configured(route):
        route.fulfill(content_type='application/javascript', body='window.YAKKUK_AI = {endpoint: "' + API + '/"};')
    def service(route):
        if route.request.method == 'OPTIONS':
            route.fulfill(status=204, headers={'Access-Control-Allow-Origin': URL, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'})
            return
        if route.request.url.endswith('/api/status'):
            body = {'configured': True, 'model': MODEL, 'fictionalOnly': True, 'allowed': True}
            route.fulfill(json=body, headers={'Access-Control-Allow-Origin': URL})
            return
        payload = route.request.post_data_json
        calls.append(payload)
        assert payload['fictional'] is True and isinstance(payload['prompt'], str)
        assert set(payload) == {'prompt', 'kind', 'fictional'}
        if mode['value'] == 'quota':
            route.fulfill(status=429, json={'error': {'code': 'daily_quota', 'message': '무료 AI 한도 도달'}}, headers={'Access-Control-Allow-Origin': URL})
            return
        if mode['value'] == 'invalid':
            route.fulfill(status=502, json={'error': {'code': 'invalid_response', 'message': 'AI 답 형식 오류'}}, headers={'Access-Control-Allow-Origin': URL})
            return
        if mode['value'] == 'network':
            route.abort('failed')
            return
        if payload['kind'] == 'analysis':
            text = json.dumps(ANALYSIS, ensure_ascii=False)
        elif payload['kind'] == 'quiz':
            text = json.dumps([{'q': '가상 문제', 'options': ['A', 'B', 'C', 'D'], 'answer': 0, 'explain': '가상 해설'}])
        else:
            text = '가상 학습 설명입니다. 의료진에게 확인하세요.'
        route.fulfill(json={'text': text, 'model': MODEL}, headers={'Access-Control-Allow-Origin': URL})
    page.route('**/ai-config.js*', configured)
    page.route(API + '/**', service)
    page.goto(URL)
    expect(page.locator('#run')).to_have_text('AI 자동 분석')
    assert calls == []
    page.locator('#drugs').fill('가상 약 A')
    page.locator('#obs').fill('가상 졸림')
    page.locator('#run').click()
    assert calls == []
    page.locator('#fictional').check()
    page.locator('#run').click()
    expect(page.locator('#status')).to_contain_text('정리를 마쳤습니다')
    assert len(calls) == 1 and calls[0]['kind'] == 'analysis'
    assert page.evaluate('lastData.drugs[0].input') == '가상 약 A'
    page.locator('.chips button').first.click()
    expect(page.locator('#result')).to_contain_text('가상 학습 설명')
    assert len(calls) == 2 and calls[-1]['kind'] == 'study'
    page.get_by_role('button', name='이 약 목록으로 퀴즈 풀기', exact=True).click()
    expect(page.locator('.quiz-q')).to_be_visible()
    assert len(calls) == 3 and calls[-1]['kind'] == 'quiz'
    page.locator('.opt').first.click()
    expect(page.locator('.quiz-q')).to_contain_text('맞았습니다')
    page.locator('#run').click()
    expect(page.locator('#status')).to_contain_text('정리를 마쳤습니다')
    assert len(calls) == 3, 'Identical analysis must reuse the stored response.'
    # Invalid responses and connection failures leave the old valid result intact.
    mode['value'] = 'invalid'
    page.locator('#obs').fill('가상 형식 오류 시험')
    page.locator('#run').click()
    expect(page.locator('#status')).to_contain_text('AI 답 형식 오류')
    assert page.evaluate('lastData.drugs[0].input') == '가상 약 A'
    mode['value'] = 'network'
    page.locator('#obs').fill('가상 통신 오류 시험')
    page.locator('#run').click()
    expect(page.locator('#status')).to_contain_text('연결하지 못했습니다')
    assert page.evaluate('lastData.drugs[0].input') == '가상 약 A'
    mode['value'] = 'quota'
    page.locator('#obs').fill('가상 한도 초과 시험')
    page.locator('#run').click()
    expect(page.locator('#status')).to_contain_text('AI 요청 한도')
    before = len(calls)
    page.locator('#run').click()
    expect(page.locator('#status')).to_contain_text('AI 요청 한도')
    assert len(calls) == before
    page.locator('#inputSummary').click()
    assert '한도 초과 시험' in page.get_by_role('textbox', name='입력 내용 정리 결과', exact=True).input_value()
    page.locator('#labLink').click()
    page.locator('#caseSave').click()
    expect(page.locator('#caseStatus')).to_contain_text('저장했습니다')
    # A failed initial health check must restore the usable manual/local workflow.
    fallback = browser.new_page()
    fallback.route('**/ai-config.js*', configured)
    fallback.route(API + '/**', lambda route: route.fulfill(status=503,
        json={'error': {'code': 'unavailable'}}, headers={'Access-Control-Allow-Origin': URL}))
    fallback.goto(URL)
    expect(fallback.locator('#connectionStatus')).to_contain_text('확인하지 못했습니다')
    expect(fallback.locator('#run')).to_have_text('AI 분석 요청문 만들기')
    expect(fallback.locator('#run')).to_be_enabled()
    fallback.locator('#drugs').fill('가상 약')
    fallback.locator('#fictional').check()
    fallback.locator('#inputSummary').click()
    expect(fallback.get_by_role('textbox', name='입력 내용 정리 결과', exact=True)).to_be_visible()
    assert not errors, errors
    browser.close()
    print('PASS: automatic analysis/study/quiz via mocked HTTPS Worker, explicit consent, zero background inference, cache reuse, invalid response/network/quota handling, recording after quota')
