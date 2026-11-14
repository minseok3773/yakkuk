# 무료 AI 자동 분석 연결

## 준비된 구성과 현재 상태

GitHub Pages 화면은 유지하고 별도 Cloudflare Worker에서 추론한다. 브라우저나 GitHub에 Cloudflare API 토큰을 넣지 않는다. Workers AI 바인딩은 별도의 Google API 키가 필요 없다. 기존 브라우저 저장소와 JSON 백업 형식도 유지한다.

Cloudflare Worker를 `https://yakkuk-ai.jsy7648.workers.dev/`에 배포했다. 실제 가상 학습·분석 응답과 불명확한 약의 성분을 추측하지 않는 동작을 검증한 후 `ai-config.js`에 공개 서버 주소를 등록했다. 같은 요청의 재사용과 저장·새로고침 후 결과 복원을 확인했다. 운영 화면은 `https://minseok3773.github.io/yakkuk/`이며, 비밀값이나 배포 토큰은 웹 파일에 포함하지 않는다.

## 사용자 계정에서 필요한 준비

1. [Cloudflare](https://dash.cloudflare.com/sign-up) 무료 계정을 만든다. Workers Free를 사용하며 카드 등록·Workers Paid·AI Gateway 유료 크레딧을 설정하지 않는다.
2. [API Tokens](https://dash.cloudflare.com/profile/api-tokens)에서 **Create Token → Edit Cloudflare Workers → Use template**을 선택하고 계정 범위를 본인 계정 하나로 제한한다. 토큰은 짧은 유효기간으로 발급하고, 배포가 끝나면 폐기할 수 있다.
3. 이 Codex 클라우드 환경의 환경 설정에서 비밀값 **CLOUDFLARE_API_TOKEN**에 토큰을 입력한다. 비밀값의 대상 도메인은 `api.cloudflare.com`이다. 토큰을 채팅, 소스 코드, GitHub 파일에 붙여 넣지 않는다.
4. Cloudflare 계정 화면의 **Account ID**를 복사하여 환경 변수 **CLOUDFLARE_ACCOUNT_ID**에 입력한다. 이것은 API 키가 아니라 배포 대상 계정 식별자다.
5. 환경 설정을 저장·적용한다. 게시가 필요한 화면이면 환경 설정을 게시한다. 네트워크는 `api.cloudflare.com`과 배포한 `*.workers.dev` 접근이 필요하다. 초안 저장만으로 현재 환경에 적용되지는 않는다.

Google AI Studio 키는 이 구성에서 사용하지 않으며 등록할 필요가 없다. 계정의 무료 플랜과 모델 이용 조건을 확인하고, 유료 변경을 요구하면 중단한다. 기존 API 토큰 템플릿 권한이 배포에 부족하다고 확인될 때에만 해당 오류의 추가 권한을 검토한다.

## 배포 담당자 실행 순서

인증 정보의 이름과 주입 여부만 확인하고 값을 출력하지 않는다. 실제 Cloudflare 계정과 권한을 확인한 후 아래를 실행한다. 배포 명령은 유료 플랜 가입이나 결제 설정을 하지 않는다.

```sh
cd /workspace/yakkuk
npm_config_cache=/tmp/yakkuk-npm-cache npm ci --no-audit --no-fund
npm test
python3 tests/smoke.py
python3 tests/ai-browser.py
mkdir -p /workspace/.yakkuk-config
XDG_CONFIG_HOME=/workspace/.yakkuk-config WRANGLER_LOG_PATH=/tmp/yakkuk-wrangler.log WRANGLER_SEND_METRICS=false npm run build:api
XDG_CONFIG_HOME=/workspace/.yakkuk-config WRANGLER_LOG_PATH=/tmp/yakkuk-wrangler.log WRANGLER_SEND_METRICS=false npm run deploy:api
```

빌드는 dry-run으로 추론하지 않는다. `wrangler dev`의 로컬 AI 바인딩도 실제 추론 한도를 사용할 수 있으므로 모의 테스트 대신 실행하지 않는다.

배포가 성공해 Worker의 HTTPS 루트 주소를 받으면 다음을 실행한다.

```sh
NODE_USE_ENV_PROXY=1 npm run connect:api -- https://yakkuk-ai.ACCOUNT.workers.dev/
```

위 명령은 상태 조회 후 **가상 학습 1회 + 가상 분석 1회**를 실제 모델에 요청한다. 두 요청이 성공할 때만 공개 서버 주소를 `ai-config.js`에 쓴다. 인증키는 쓰지 않는다. 실패하면 주소를 바꾸지 않으며, 출력을 진단하고 자동 재시도하지 않는다. 실제 모델의 한국어 출력·JSON 형식·불명확한 약에 대한 확인 필요 표시를 추가로 확인한다. 임상 성능 검증은 아니다.

그 뒤 연결된 화면을 브라우저에서 다시 검증하고 `feature/web-rehab-workspace`와 `gh-pages`에 검증된 변경사항을 반영한다. GitHub Pages 배포 성공과 운영 주소의 작동은 따로 확인한다. 아직 준비되지 않은 서버 주소를 운영 설정에 넣지 않는다.

## 비용·한도와 요청 방식

- Cloudflare 공식 문서 기준 Workers Free의 Workers AI 무료 할당은 계정 전체 **하루 10,000 Neurons**, UTC 00:00 초기화다. 토큰 수·모델별 소모량에 따라 요청 가능 횟수는 달라진다. 같은 계정의 다른 서비스도 이 한도를 공유할 수 있다.
- 고정 모델 `@cf/meta/llama-3.1-8b-instruct-fp8-fast`를 사용한다. 모델을 유료 모델로 자동 변경하지 않는다. 출력은 요청당 최대 4,096 토큰으로 제한한다.
- 서버에 SQLite 기반 Durable Object 일일 카운터를 두고 모든 접속을 합쳐 **최대 20회/UTC일**로 제한한다. 더 작은 제한은 설정할 수 있지만 코드상 20회를 넘길 수 없다. 요청 실패도 보수적으로 횟수에 포함한다. 이 횟수 제한은 Neurons 잔량의 정확한 측정이 아니며, 계정 자체를 Workers Free로 유지해야 월 0원 조건을 지킬 수 있다.
- Durable Objects는 SQLite 방식으로 Workers Free에서 제공된다. 무료 서비스 자체 한도를 넘으면 오류로 멈추며 앱에서 유료 플랜으로 전환하지 않는다.
- 상태 조회·화면 열기·저장·복원은 모델을 호출하지 않는다. **AI 자동 분석**, 약 공부 또는 퀴즈 버튼을 명시적으로 눌렀을 때만 추론을 요청한다.
- 동일한 요청의 결과를 브라우저에 저장해 재사용한다. 서버 주소·모델과 요청 종류별로 캐시를 나누고 기존 Claude 캐시도 보존한다.
- 계정 무료 할당 소진(Cloudflare 오류 3036)은 다음 UTC 초기화까지 서버 전체 요청을 대기시킨다. 혼잡(3040), 통신 오류, 잘못된 응답은 자동 재시도하지 않는다. 입력과 기존 결과는 유지하며 기록·요약은 계속 쓸 수 있다.
- 현재 허용 Origin은 `https://minseok3773.github.io`이다. CORS는 사용자 인증이 아니며 브라우저 밖에서 접근을 막지 못한다. 공개 API의 한도는 제3자가 소진할 수도 있다. 글로벌 요청 제한은 이런 경우에도 무제한 추론을 막는다. 실제 자료를 위한 인증·권한 기능은 제공하지 않는다.

## 데이터와 의료 이용 범위

서버는 프롬프트·모델 답·IP를 자체 저장하거나 로그에 쓰지 않는다. Durable Object에는 날짜·요청 횟수·대기 여부만 저장한다. Worker 관측 로그를 활성화하지 않으며 AI Gateway나 별도 서버 캐시도 구성하지 않는다. 브라우저의 기존 입력·응답 저장과 JSON 백업은 유지된다.

Cloudflare의 공식 Workers AI 데이터 문서는 일반 상태 비저장 추론에 대해 처리에 필요한 기간 이후 입력·출력을 보관하지 않고 Customer Content를 모델 학습에 쓰지 않는다고 설명한다. 다만 운영 메타데이터, 사용자가 선택한 저장 기능, 안전·법적 예외가 있어 무조건적인 무보관 보증으로 해석하지 않는다. 개인정보 정책·계정 약관도 함께 적용된다. 2026-11-15 KST에 검증된 Node HTTPS 경로로 Cloudflare 약관·개인정보 정책·Developer Platform 서비스별 약관 원문을 읽었다. Self-Serve 2.2.1(i)는 HIPAA 정의의 PHI를 서면 동의 없이 저장·전송하지 못하도록 하고, 2.5.2는 데이터 전송에 필요한 권리·허가를 고객이 확보하도록 한다. HIPAA가 모든 한국 회원자료에 자동 적용된다는 뜻은 아니지만 실제 자료 도입은 별도의 법적·기관 검토가 필요하다. 개인정보 정책의 국외 이전·보관 항목과 서비스별 Workers AI 약관의 출력 오류 가능성·모델별 이용 조건도 함께 적용된다.

Llama 3.1 라이선스와 이용 정책은 공식 저장소 원문에서 확인했다. 무자격 의료행위와 적법한 권리·동의 없는 민감정보 처리를 제한한다. [라이선스](licenses/LLAMA-3.1.txt)를 보존하고 연결 화면과 응답에 **Built with Llama**를 표시한다. 모델 가중치를 배포하거나 사용자 기기에 설치하지 않는다.

현재 기능 범위는 **가상 정보로 의료 지식을 학습하고 복약 관찰 항목을 정리하는 용도**다. 실제 회원자료, 진단·치료 결정, 응급 판정은 범위에 포함하지 않는다. 입력된 내용과 AI의 추정을 구분하고 모르는 약은 확인 필요로 표시하도록 요청하지만, 지시문이나 JSON 검증이 의료적 정확성을 보장하지 않는다. 모델은 공식 의약품 DB나 근거 검색에 연결되지 않았다.

공식 출처(2026-11-15 KST 확인):

- [Workers AI 가격](https://developers.cloudflare.com/workers-ai/platform/pricing/), [공식 문서 소스](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers-ai/platform/pricing.mdx)
- [Workers AI 데이터 이용](https://developers.cloudflare.com/workers-ai/platform/data-usage/), [공식 문서 소스](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers-ai/platform/data-usage.mdx)
- [오류 코드](https://developers.cloudflare.com/workers-ai/platform/errors/), [공식 문서 소스](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers-ai/platform/errors.mdx)
- [Durable Objects 가격](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cloudflare 개인정보 정책](https://www.cloudflare.com/privacypolicy/), [계정 약관](https://www.cloudflare.com/terms/), [Developer Platform 서비스별 약관](https://www.cloudflare.com/service-specific-terms-developer-platform/)
- [Llama 3.1 라이선스](https://github.com/meta-llama/llama-models/blob/main/models/llama3_1/LICENSE), [이용 정책](https://github.com/meta-llama/llama-models/blob/main/models/llama3_1/USE_POLICY.md)

## 검증 결과 구분

- 서버 모의 테스트: 명시적 가상 정보 확인, 요청 크기·출처 검사, 동시 요청의 일일 제한, UTC 초기화, 무료 한도 대기, 유료 모델 요구·혼잡·타임아웃·응답 형식 오류를 확인한다.
- 브라우저 모의 테스트: 클릭 전 추론 없음, 자동 분석·학습·퀴즈 경로, 캐시 재사용, 오류 시 기존 결과 유지, 한도 초과 후 저장 가능을 확인한다.
- 기존 화면·저장·복원·백업 통합 테스트를 유지한다.
- 실제 서버 배포와 한국어 학습·분석 요청을 검증했다. 반환 JSON은 스키마를 지정해 생성하고 서버에서 다시 검사한다. 모델의 일반 응답이 문서 형식을 지키지 않는 문제를 실제 검증에서 발견해 수정했으며, 형식이 틀린 답은 결과에 적용하지 않는다.
- 초기 연결 검사 실패 시 주 버튼을 수동 요청문 경로로 복구하는 회귀 테스트를 추가했다.
- 검증용 Chromium은 이 클라우드의 프록시 CA를 신뢰하지 않았다. 영구 NSS 인증서 저장소 변경은 자동 승인 검토가 이후 브라우징 신뢰 범위에 영향을 준다는 이유로 거절하여 적용하지 않았다. UI 통합 검증은 기존 신뢰 설정으로 TLS를 검증하는 Node 클라이언트로 실제 HTTPS 요청을 중계해 수행했다. 브라우저 자체의 직접 TLS 연결을 검증한 것으로 간주하지 않는다. 모의 테스트에서는 실제 추론하지 않는다.
