# 무료 주소 추가 준비

목표 후보는 `https://yakkuk.pages.dev/`이다. `.com` 도메인을 무료로 등록했다고 주장하지 않으며, Pages 프로젝트를 실제 생성하기 전까지 이름 사용 가능 여부는 확정하지 않는다.

현재 상태:

- 기존 GitHub Pages 사이트와 AI 서버는 유지한다.
- 현재 토큰으로 Cloudflare Pages 조회는 HTTP 403 / code 10000으로 거절됐다. 토큰 정책을 읽어 `Workers Scripts Write`와 계정·사용자 읽기 권한만 있고 `Cloudflare Pages` 권한이 없음을 확인했다.
- 기존 토큰의 Account policy → Developer Platform에서 **Cloudflare Pages / Edit**를 추가해야 한다. 계정 범위는 기존 본인 계정 하나를 유지한다. 같은 토큰의 정책을 편집하는 경우 토큰 값이나 이 환경의 비밀값을 다시 입력할 필요는 없다.
- 정적 배포 파일은 `npm run build:web`로 `/tmp/yakkuk-pages-site`에 만든다. HTML/JS 4개와 캐시 헤더만 포함하며 토큰·서버 소스·의존성·로컬 기록은 넣지 않는다.
- API 코드는 `ADDITIONAL_ORIGINS`로 정확한 새 출처를 추가할 수 있도록 준비했다. 기존 `ALLOWED_ORIGIN`은 유지한다. 아직 소유가 확인되지 않은 후보 출처를 운영 서버에 허용하지 않는다.

권한 반영 후 실행할 순서:

1. Pages 조회를 새 요청으로 재검증한다. 권한이 계속 없으면 프로젝트 생성 요청을 반복하지 않는다.
2. 계정의 기존 Pages 프로젝트를 확인하고, 다른 기존 앱을 덮어쓰지 않는다. `yakkuk` 이름을 새 프로젝트로 등록할 수 있는지 확인한다. 이름이 다른 계정에 예약됐으면 가장 가까운 대안을 검토한다.
3. 직접 업로드 방식의 프로젝트를 생성한다. 예시 명령은 다음과 같으며, 실제 이름과 소유를 확인한 뒤 실행한다.

   ```sh
   npm run build:web
   XDG_CONFIG_HOME=/workspace/.yakkuk-config WRANGLER_SEND_METRICS=false npx wrangler pages project create yakkuk --production-branch gh-pages
   XDG_CONFIG_HOME=/workspace/.yakkuk-config WRANGLER_SEND_METRICS=false npx wrangler pages deploy /tmp/yakkuk-pages-site --project-name yakkuk --branch gh-pages
   ```

4. 프로젝트의 실제 소유와 운영 주소를 확인한 후 `wrangler.jsonc`의 `vars.ADDITIONAL_ORIGINS`에 정확한 새 Origin을 추가한다. 기존 주소는 삭제하지 않고, Pages 임의 미리보기 주소나 와일드카드는 허용하지 않는다.
5. AI Worker를 갱신한 뒤 기존·새 Origin의 상태 조회와 CORS 응답을 확인한다. 일일 요청 제한은 같은 Worker의 기존 전역 카운터를 공유한다. 새 주소로 옮겼다고 초기화하지 않는다.
6. 새 주소에서 입력·AI 연결·저장·백업·복원을 검증한다. 실제 모델 요청은 남은 무료 한도 안에서 필요한 가상 사례만 사용한다. 결제 등록·유료 플랜·도메인 구매는 하지 않는다.
7. GitHub Pages의 기존 주소는 자동 리디렉션하거나 삭제하지 않는다. 새 주소 배포 성공과 검증 결과를 별도로 보고한다.

## 기존 기록 옮기기

서로 다른 도메인의 브라우저 저장소는 분리된다. 새 주소에 기존 기록이 자동으로 나타나지는 않는다. 기존 주소의 기록은 그대로 남는다.

기존 주소에서 **기록 저장 → JSON 백업**을 실행하고, 새 주소의 **개발·시험 도구 → JSON 백업 복원**으로 가져온다. 가상 정보만 사용하며, JSON 파일은 암호화되지 않으므로 안전하게 보관한다. 최신 결과·메모도 백업하려면 먼저 기록 저장을 눌러야 한다. 기존 결과를 열 때는 AI를 다시 호출하지 않는다.
