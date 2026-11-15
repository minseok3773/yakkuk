// Browser-only compatibility for the latest Claude source. No API calls or keys.
(function () {
  if (window.claude) return;

  downloads = {
    async save({ filename, data }) {
      if (typeof filename !== 'string' || !filename) throw new TypeError('파일 이름이 필요합니다.');
      if (typeof data !== 'string' && !(data instanceof Blob) &&
          !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
        throw new TypeError('저장할 파일 내용을 확인해 주세요.');
      }
      const type = filename.endsWith('.json') ? 'application/json;charset=utf-8' :
        filename.endsWith('.zip') ? 'application/zip' : 'text/plain;charset=utf-8';
      const blob = data instanceof Blob ? data : new Blob([data], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      try { link.click(); }
      finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    }
  };

  runBtn.disabled = false;
  runBtn.textContent = '내장 자료로 정리하기';
  $('localRun').hidden = true;
  $('alt').querySelector('summary').textContent = 'AI로 추가 정리하기 (요청문 복사·답 붙여넣기)';
  setStatus('내장 자료로 정리·회원 저장·파일 내려받기를 사용할 수 있습니다. AI 자동설명과 사진 읽기는 연결되어 있지 않습니다.');

  const backupHelp = el('p', { class: 'hint', text: '이전 Claude 주소의 회원 기록은 이 웹주소로 자동으로 옮겨지지 않습니다. 옮길 기록이 있으면 이전 약국이에서 백업한 뒤 이곳에서 직접 불러오세요.' });
  $('backup').append(backupHelp);
  $('desk').querySelector('p.what').textContent = '이 웹 실행본을 여는 바로가기와 아이콘 그림을 내려받습니다. 기존 Claude 바로가기는 직접 바꾸기 전까지 그대로 열립니다. 윈도우 컴퓨터 기준입니다.';

  // Keep study prompts usable without pretending an AI is connected.
  const claudeAsk = ask;
  ask = async function (prompt, target, quiet, title) {
    if (sample) return claudeAsk(prompt, target, quiet, title);
    target.textContent = 'AI 자동설명은 연결되어 있지 않습니다. 아래 요청문을 복사해 이용 중인 AI 서비스에 직접 물어볼 수 있습니다. 입력한 내용은 자동 전송하지 않습니다.';
    const box = el('textarea', { readonly: '', rows: '5', 'aria-label': '공부 요청문' });
    box.value = prompt;
    const copy = el('button', { type: 'button', class: 'mini', text: '공부 요청문 복사' });
    copy.addEventListener('click', () => copyText(prompt, copy, box));
    target.append(copy, box);
    return null;
  };
})();
