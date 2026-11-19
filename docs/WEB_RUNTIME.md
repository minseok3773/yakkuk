# 약국이 웹사이트판

배포 주소: https://minseok3773.github.io/yakkuk/

이 가지(`gh-pages`)의 `index.html`은 개발 가지 `claude/funny-shannon-e3jdl2`의 `index.html`과 같은 파일입니다. 같은 파일이 Claude 안에서 열리면 Claude판(AI 정리), Claude 밖에서 열리면 웹사이트판으로 동작합니다. 제목 옆에 "웹사이트판" 딱지가 붙습니다.

## 웹사이트판에서 되는 일 (2026-11-19부터)

- 내장 자료 정리(미국 FDA 허가사항 요약), 병용·누적 부담 규칙 점검, 건강 개입 기본 지침, 공통으로 먹는 약, 회원별 저장, 오답노트, 백업·복원, 메모장 파일 저장, 바탕화면 아이콘 그림 내려받기
- AI가 필요한 일(정리, "왜 그런가요?", 질문, 약 설명, 종합 퀴즈)은 요청문을 복사해 ChatGPT에 붙여 넣고, 받은 답을 다시 붙여 넣는 방식입니다. 자동으로 AI를 부르지 않습니다.
- 약 봉투 사진 읽기는 없습니다.

## Cloudflare AI 연결을 뺀 일

2026-11-19 사용자가 "최신 약국이 + ChatGPT 방식만"을 골라, 웹사이트가 Cloudflare Workers AI(가상 사례 전용)를 부르던 연결을 뺐습니다.

- 지운 파일: `browser-runtime.js`, `ai-client.js`, `ai-config.js`, 그리고 이들을 시험하던 `tests/browser-runtime.test.mjs`, `tests/ai-client.test.mjs`, `tests/ai-browser.py`, `tests/smoke.py`. 이전 시제품 파일 `workspace.js`, `browser-downloads.js`도 쓰이지 않아 지웠습니다. 모두 git 기록에 남아 있습니다.
- 남긴 파일: Worker 원본(`server/`, `wrangler.jsonc`, `package.json`, `scripts/connect-ai.mjs`, `tests/worker.test.mjs`, `docs/AI_SETUP.md`, `docs/licenses/`). 다시 연결할 때 참고합니다.
- Cloudflare에 배포된 Worker는 그대로 있지만 웹사이트에서 부르지 않습니다. 필요 없으면 Cloudflare 대시보드에서 지울 수 있습니다.

## 저장

회원 기록은 `localStorage`의 `yakkuk.members.v1`, 오답노트는 `yakkuk.wrong.v1`, 붙여 둔 약 사진은 IndexedDB `yakkuk-photos`에 둡니다. 서버로 보내지 않습니다. 저장 형식이 이전 웹사이트판과 같아서 이 주소에 저장해 둔 기록은 그대로 열립니다. Claude판과 웹사이트판은 저장 공간이 달라 기록을 옮기려면 백업 파일을 씁니다.

ChatGPT에 요청문을 붙여 넣으면 회원의 약과 관찰 내용이 ChatGPT로 보내집니다. 회원 실명·주민번호·연락처는 입력하지 않습니다.

## 갱신

개발 가지의 `index.html`을 이 가지에 그대로 복사해 올립니다. 강제 푸시는 하지 않습니다.
