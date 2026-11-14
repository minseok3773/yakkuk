// Public Worker transport. No Cloudflare/Google credentials belong in the browser.
(function () {
  const configured = window.YAKKUK_AI?.endpoint;
  if (!configured || window.claude) return;
  function error(message, code, status) {
    return Object.assign(new Error(message), { code, status });
  }
  async function request(url, options = {}, timeout = 60000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    } catch (e) {
      throw error(e.name === 'AbortError' ? 'AI 서버 응답 시간이 초과되었습니다. 입력은 유지됩니다.' : 'AI 서버에 연결하지 못했습니다. 입력은 유지되며 자동 재시도하지 않습니다.', 'connection_error');
    } finally { clearTimeout(timer); }
  }
  async function initialize() {
    try {
      const endpoint = new URL(configured);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw error('AI 서버 주소 설정을 확인해 주세요.', 'invalid_config');
      $('connectionStatus').textContent = '무료 AI 서버 연결을 확인하는 중입니다. 분석 요청은 아직 전송하지 않았습니다.';
      const response = await request(new URL('/api/status', endpoint), {}, 8000);
      const status = await response.json();
      if (!response.ok || status.configured !== true || status.fictionalOnly !== true) throw error('AI 서버 설정을 확인하지 못했습니다. 요청문 복사와 입력 요약은 계속 사용할 수 있습니다.', 'not_configured');
      const worker = async function (prompt, options = {}) {
        if (options.images) throw error('웹 AI 연결은 사진 분석을 지원하지 않습니다. 약 이름을 직접 입력해 주세요.', 'unsupported');
        if (typeof prompt !== 'string' || prompt.length > 12000) throw error('요청 내용이 너무 깁니다. 약 목록과 관찰 내용을 줄여 다시 요청해 주세요.', 'invalid_input');
        const response = await request(new URL('/api/analyze', endpoint), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, kind: options.task || 'study', fictional: true }),
        });
        let out;
        try { out = await response.json(); }
        catch { throw error('AI 서버 응답 형식이 올바르지 않습니다. 기존 결과는 유지됩니다.', 'invalid_response', response.status); }
        if (!response.ok) throw error(out.error?.message || 'AI 응답을 받지 못했습니다.', out.error?.code || 'provider_error', response.status);
        if (typeof out.text !== 'string' || !out.text.trim()) throw error('AI 답이 비어 있어 결과를 적용하지 않았습니다.', 'invalid_response');
        if (options.onText) options.onText({ text: out.text });
        return out;
      };
      worker.cacheScope = endpoint.origin + '/' + status.model;
      worker.limits = async () => ({ images: false });
      sample = worker;
      runBtn.textContent = 'AI 자동 분석';
      runBtn.disabled = false;
      $('connectionStatus').textContent = '무료 AI 연결: Cloudflare Workers AI · Built with Llama. 가상 정보로만 이용하세요. 버튼을 눌렀을 때만 요청하며, 무료 한도에 도달하면 대기합니다.';
      setStatus('약과 증상을 입력한 뒤 ‘AI 자동 분석’을 눌러 주세요.');
    } catch (e) {
      // Manual prompting and local records remain usable if the server is unavailable.
      $('connectionStatus').textContent = (e.message || 'AI 서버 연결을 확인하지 못했습니다.') + ' 요청문 복사·답 붙여넣기를 이용할 수 있습니다.';
    }
  }
  initialize();
})();
