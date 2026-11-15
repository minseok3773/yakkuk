// The browser uses the existing public Worker; account tokens stay on Cloudflare.
(function () {
  if (window.claude || !window.YAKKUK_AI?.endpoint) return;
  const connection = $('connectionStatus');
  let endpoint, quota = null;
  function failure(message, code) { return Object.assign(new Error(message), { code }); }
  async function request(path, options = {}, timeout = 60000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(new URL(path, endpoint), { ...options, signal: controller.signal,
        credentials: 'omit', cache: 'no-store', redirect: 'error' });
    } catch (e) {
      throw failure(e.name === 'AbortError' ? 'AI 서버 응답 시간이 초과되었습니다. 기존 기록은 유지됩니다.' :
        'AI 서버에 연결하지 못했습니다. 기존 기록은 유지되며 자동 재시도하지 않습니다.', 'connection_error');
    } finally { clearTimeout(timer); }
  }
  async function worker(prompt, options = {}) {
    if (!$('fictional').checked) throw failure('현재 AI 서버는 가상 사례 전용입니다. 실제 회원자료를 보내지 말고, 가상 정보 확인란을 먼저 선택하세요.', 'not_granted');
    if (options.images) throw failure('현재 Cloudflare 연결은 사진 읽기를 지원하지 않습니다. 약 이름을 직접 입력해 주세요.', 'unsupported');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) throw failure('AI 요청이 비어 있거나 너무 깁니다. 입력을 줄여 다시 요청해 주세요.', 'invalid_input');
    if (quota && Date.now() < Date.parse(quota)) throw failure('오늘 AI 요청 한도에 도달했습니다. 내장 자료 정리와 기록·퀴즈는 계속 사용할 수 있습니다.', 'daily_quota');
    const response = await request('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, kind: options.task || 'study', fictional: true }) });
    let out;
    try { out = await response.json(); } catch { throw failure('AI 응답 형식을 읽지 못했습니다. 기존 결과는 유지됩니다.', 'invalid_response'); }
    if (!response.ok) {
      if (out.error?.code === 'daily_quota' && out.error.resetAt) quota = out.error.resetAt;
      throw failure(out.error?.message || 'AI 응답을 받지 못했습니다.', out.error?.code || 'provider_error');
    }
    if (typeof out.text !== 'string' || !out.text.trim()) throw failure('AI 답이 비어 있어 적용하지 않았습니다.', 'invalid_response');
    if (options.onText) options.onText({ text: out.text });
    return out;
  }
  worker.limits = async () => ({ images: false });
  async function connect() {
    try {
      endpoint = new URL(window.YAKKUK_AI.endpoint);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw failure('AI 서버 주소 설정을 확인해 주세요.', 'invalid_config');
      connection.textContent = 'Cloudflare AI 연결을 확인하는 중입니다. 분석 내용은 아직 보내지 않았습니다.';
      const response = await request('/api/status', {}, 8000);
      const status = await response.json();
      if (!response.ok || status.configured !== true || status.fictionalOnly !== true) throw failure('기존 AI 서버의 연결 설정을 확인하지 못했습니다.', 'not_configured');
      quota = status.allowed === false ? status.resetAt : null;
      sample = worker;
      runBtn.disabled = false;
      runBtn.textContent = 'AI 자동 분석';
      $('localRun').hidden = false;
      connection.textContent = 'Cloudflare Workers AI 연결됨 · Built with Llama · 가상 사례 전용' +
        (Number.isFinite(status.remaining) ? ' · 오늘 남은 요청 ' + status.remaining + '회' : '') +
        '. 버튼을 누르고 가상 정보 확인란을 선택했을 때만 입력을 전송합니다.';
      setStatus(quota ? '오늘 AI 한도에 도달했습니다. 내장 자료 정리는 계속 사용할 수 있습니다.' : '기존 Cloudflare AI가 연결되었습니다. AI 자동 분석 또는 내장 자료 정리를 선택하세요.');
    } catch (e) {
      sample = null;
      runBtn.disabled = false;
      runBtn.textContent = '내장 자료로 정리하기';
      $('localRun').hidden = true;
      connection.textContent = (e.message || 'Cloudflare AI 연결을 확인하지 못했습니다.') + ' 내장 자료·저장·요청문 복사는 계속 사용할 수 있습니다.';
    }
  }
  $('aiCheck').addEventListener('click', connect);
  connect();
})();
