# 웹 콘솔 배포·운영 (판매자용)

웹 콘솔은 가입·요금제·도구 선택·PC 연결·이용권 발급만 한다. 에이전트는 고객 PC에서 돌고, 콘솔은 원고·파일을 받지 않는다.

## 1. 서명키 만들기(한 번)
판매자 PC에서:
```
python -m cloud.keys new --write-pub
```
- `CLOUD_SIGNING_SEED=…` 는 **콘솔 서버 환경변수에만** 넣는다. 저장소·메일·채팅에 올리지 않는다. 잃어버리면 모든 고객 PC의 공개키를 바꿔야 한다.
- 공개키는 `hub/keys/vendor.pub` 에 들어가고, 실행기 판매 묶음에 같이 나간다(이게 없으면 `scripts/build_release.py` 가 멈춘다).

## 2. 서버에 올리기(Docker)
```
python scripts/build_release.py            # dist/AgentHub-Console-<버전>.zip
unzip AgentHub-Console-*.zip && cd AgentHub-Console-*
docker build -t agenthub-console .
docker run -d --name console -p 8080:8080 -v console-data:/data \
  -e CLOUD_SIGNING_SEED=<비밀> -e BILLING_PROVIDER=manual -e BILLING_BANK_INFO="○○은행 000-000 (예금주)" \
  -e BILLING_WEBHOOK_SECRET=<임의의 긴 문자열> agenthub-console
```
- 앞단에 HTTPS 프록시(예: Caddy `console.example.com { reverse_proxy 127.0.0.1:8080 }`)를 둔다. 실행기는 `https://` 콘솔에만 연결한다.
- 저장소는 SQLite(`/data/console.db`). 매일 백업한다. 고객이 수백 곳을 넘으면 `cloud/db.py` 를 Postgres 로 바꾼다.
- 상태 확인: `GET /healthz`

## 3. 결제
- **처음(계좌이체)**: `BILLING_PROVIDER=manual`. 고객이 콘솔에서 요금제를 고르면 주문번호와 계좌가 나온다. 입금을 확인하면
  `docker exec console python -m cloud.admin paid --ref ord_xxxx` → 요금제가 바로 바뀌고, 고객 PC는 15분 안에 새 이용권을 받는다.
- **결제 대행사 연동(토스페이먼츠·포트원 등)**: 대행사의 결제 완료 웹훅을 `POST /api/billing/webhook` 으로 보내게 한다.
  본문 `{"ref": 주문번호, "status": "paid"}`, 헤더 `X-Signature = hex(HMAC-SHA256(BILLING_WEBHOOK_SECRET, 본문))`.
  대행사마다 서명 방식이 달라서, 연동할 때 `cloud/app.py` 의 `_webhook` 을 그 방식에 맞춰 바꾼다(카드 정보는 콘솔이 받지 않는다).
- 세금계산서·현금영수증은 홈택스에서 발행한다(사업자등록 후).

## 4. 관리자 명령
```
python -m cloud.admin orgs                       조직 목록
python -m cloud.admin payments                   입금 대기 주문
python -m cloud.admin paid --ref ord_xxxx        입금 확인 → 요금제 적용
python -m cloud.admin set-plan --email a@b.c --plan pro --months 12   직접 적용(계약 고객 등)
```

## 5. 이용권 규칙
- 토큰(AH2)은 기기 ID에 묶이고 최대 7일짜리다. 실행기가 15분마다 새로 받는다.
- 결제 기간이 끝나면 새 토큰의 도구 목록이 비고, 고객 PC는 7일 유예 뒤 멈춘다.
- 콘솔에서 PC를 「연결 끊기」하면 그 PC는 다음 동기화부터 토큰을 못 받는다.
- 인터넷이 안 되는 PC: 콘솔 → PC 연결 → 「오프라인 토큰 받기」(기기 ID 입력).

## 6. 바꿀 곳
- 요금·도구 수·PC 수: `cloud/plans.json`(가격은 예시 — 확정 필요)
- 판매 페이지: `cloud/landing.template.html` 고친 뒤 `python -m cloud.build_landing`
- 약관·개인정보 처리방침: `cloud/static/terms.html`, `privacy.html`(초안 — 법률 검토 필요)
