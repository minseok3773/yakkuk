# 웹사이트 배포

공개 저장소의 GitHub Pages로 `index.html` 하나를 제공합니다. 별도 빌드, 서버, API 키, 유료 요금제가 필요 없습니다. 회원 기록은 서버가 아니라 접속한 브라우저에 저장됩니다.

## 배포 설정 (이미 되어 있음)

- 저장소 설정 → Pages → Build and deployment → Source: **Deploy from a branch**, Branch: **gh-pages**, 폴더 **/(root)**
- 주소: https://minseok3773.github.io/yakkuk/
- 루트의 `index.html`과 `.nojekyll`을 제공합니다.

## 갱신 순서

1. 개발 가지 `claude/funny-shannon-e3jdl2`에서 `index.html`을 고치고 브라우저 시험을 통과시킵니다(Claude 안 흉내와 Claude 밖 두 가지).
2. 그 `index.html`을 이 가지에 그대로 복사해 커밋하고 `gh-pages`에 올립니다. 강제 푸시는 하지 않습니다.
3. GitHub Actions의 "pages build and deployment"가 성공했는지 확인한 뒤, 실제 주소에서 새로 고침(Ctrl+F5)해 확인합니다.

같은 주소를 유지하면 같은 브라우저에 저장된 기록도 유지됩니다. 브라우저 자료를 지우면 백업 없이는 되살릴 수 없습니다.

웹사이트판의 동작과 Cloudflare AI 연결을 뺀 경위는 `WEB_RUNTIME.md`에 있습니다.
