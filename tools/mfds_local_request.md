# 식약처 자료 받기 요청서 (약국이)

이 요청서는 약국이를 만드는 클라우드 작업(Claude)이 썼습니다. 사용자 컴퓨터(한국)에서 연 Claude 작업에 붙여 넣어 씁니다.
클라우드 작업 환경은 해외에 있어 식약처 의약품안전나라(nedrug.mfds.go.kr)가 접속을 끊습니다. 그래서 자료 받기만 이 컴퓨터에서 하고,
받은 자료를 GitHub 저장소 minseok3773/yakkuk의 `mfds-data` 가지에 올리면, 약국이에 넣는 일은 클라우드 작업이 이어서 합니다.
사용자는 개발자가 아니므로 쉬운 우리말로 설명해 주세요.

## 지킬 것

- 지금 연 작업 폴더 안에서만 파일을 만들고 고칩니다. 컴퓨터의 다른 파일, 브라우저 기록, 약국이 회원 기록은 열지 않습니다.
- 식약처가 공개한 의약품 정보만 받습니다. 로그인이나 API 키(인증키)가 필요한 곳은 쓰지 않습니다.
- 요청 사이에 1초 이상 쉽니다. 접속이 막히거나 보안 문자가 뜨거나 오류가 계속되면 멈추고 사용자에게 알립니다.
- 받은 글은 요약하거나 번역하지 않고 원문 그대로 저장합니다(정리는 클라우드 작업이 원문을 읽고 합니다).
- 프로그램을 새로 설치해야 하면 먼저 사용자에게 묻습니다.
- 파일은 UTF-8 JSON으로 저장합니다.

## 받을 약

`https://raw.githubusercontent.com/minseok3773/yakkuk/main/tools/mfds_targets.json`을 내려받습니다(241개 성분).
성분마다 `id`(파일 이름에 씀), `k`(영문 성분명), `ko`(우리말 성분명, 여러 표기), `br`(알려진 제품명, 참고용), `kind`가 있습니다.

- `kind`가 `official`(해외 허가사항이 이미 들어 있는 성분)이나 `new`(새로 넣을 국내 사용 약)이면 아래 1, 2, 3을 모두 받습니다.
- `kind`가 `rule`(점검 규칙에만 쓰는 성분)이면 1과 3만 받습니다.
- 식약처 표기가 `ko`와 다를 수 있습니다(예: 페르페나진 → 퍼페나진, 염 이름이 붙음). 찾은 식약처 표기를 결과에 적습니다.

## 성분마다 받을 것 (의약품안전나라)

1. `products/<id>.json`: 그 성분이 들어간 제품 목록(허가 취소·취하 제외).
   `{"id", "query": [검색한 이름], "fetched": "YYYY-MM-DD", "total": 찾은 수, "kept": 저장한 수, "items": [{"itemSeq": 품목기준코드, "name": 제품명, "company": 업체명, "type": "전문"|"일반", "ingredients": [{"name": 식약처 성분 표기, "amount": 함량, "unit": 단위}], "permitDate": 허가일, "url": 상세 페이지 주소}]}`
   - 복합제는 들어 있는 성분을 모두 적습니다.
   - 500개가 넘으면 단일 성분 제품을 먼저, 그다음 전문의약품 순으로 500개까지만 저장하고 `total`에 전체 수를 적습니다.
2. `labels/<id>.json`: 대표 제품 1개의 허가사항 원문.
   대표 제품은 단일 성분 전문의약품 가운데 가장 먼저 허가된 정상 품목입니다. 없으면 가장 가까운 것을 고르고 `note`에 이유를 적습니다.
   `{"id", "itemSeq", "name", "company", "url", "fetched", "revised": 허가사항 변경(개정) 날짜, "efficacy": 효능효과 원문, "dosage": 용법용량 원문, "precautions": [{"title": 소제목, "text": 원문}], "note"}`
   - 사용상의 주의사항은 소제목 순서를 살려 전부 저장합니다(경고, 금기, 신중 투여, 이상반응, 상호작용, 임부·수유부, 고령자 등).
3. `dur/<id>.json`: 그 성분의 DUR 정보.
   `{"id", "fetched", "source": 자료를 받은 주소, "contraindicated_with": [{"ingredient": 상대 성분, "reason": 사유}], "age": [{"text"}], "pregnancy": [{"grade", "reason"}], "elderly": [{"reason"}], "dose": [{"text"}], "duration": [{"text"}], "class_duplication": [{"group": 효능군}], "sr_split": [{"text"}]}`
   - 병용금기, 특정연령대 금기, 임부금기, 노인주의, 용량주의, 투여기간주의, 효능군중복, 서방정 분할주의입니다. 해당 없는 항목은 빈 목록으로 둡니다.
   - 의약품안전나라에서 찾기 어려우면, 식약처가 공개한 다른 공식 자료(인증키가 필요 없는 내려받기 파일)를 써도 됩니다. 쓴 곳을 `source`에 적습니다.

## 순서

1. 먼저 3개 성분(quetiapine, sulpiride, gemigliptin)만 받아 위 형식이 맞는지 확인합니다.
2. 형식이 맞으면 나머지를 모두 받습니다. 중간에 멈춰도 이어서 받을 수 있게, 이미 받은 성분은 건너뜁니다.
3. 다 받으면 `summary.json`을 만듭니다.
   `{"fetched", "counts": {"targets", "products", "labels", "dur"}, "targets": [{"id", "kind", "products": 제품 수, "label": true|false, "dur": true|false, "mfdsName": 찾은 식약처 표기, "note"}], "failed": [{"id", "reason"}]}`
4. `README.txt`에 받은 날짜, 쓴 주소, 방법을 적습니다.
5. 받을 때 쓴 스크립트를 `scripts/`에 둡니다. 나중에 허가사항이 바뀌면 다시 돌려 받습니다.
6. 원본 웹 페이지(HTML)는 `raw/`에 두되 GitHub에는 올리지 않습니다.

## GitHub에 올리기

1. 작업 폴더 안에 `git clone --depth 1 https://github.com/minseok3773/yakkuk.git repo`로 저장소를 받습니다.
2. `repo` 안에서 `git switch -c mfds-data`로 새 가지를 만듭니다.
3. `repo/data/mfds/`에 `products/`, `labels/`, `dur/`, `scripts/`, `summary.json`, `README.txt`를 복사하고 커밋합니다.
4. `git push -u origin mfds-data`로 올립니다. `mfds-data` 가지에만 올리고, main이나 다른 가지에는 올리지 않으며, 강제 푸시하지 않습니다.
5. GitHub 로그인 창이 뜨면 사용자에게 로그인을 부탁합니다.
6. git을 쓸 수 없거나 올리지 못하면, 위 자료를 작업 폴더의 `mfds_data.zip`으로 묶고 사용자에게 위치를 알립니다.

## 끝나면

사용자에게 쉬운 우리말로 알립니다: 받은 성분 수, 못 받은 성분과 이유, 올린 가지 이름(또는 압축 파일 위치).
그리고 "클라우드 쪽 약국이 작업창에 '식약처 자료 올렸어'라고 알려 주세요"라고 안내합니다.
