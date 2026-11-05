#!/bin/bash
# Agent Hub 웹 콘솔을 이미 돌고 있는 「제때 AI」 EC2(jette-ai)에 컨테이너 하나로 더 올린다.
# - 기존 제때 AI 컨테이너·포트는 건드리지 않는다(콘솔은 127.0.0.1:8090 에만 열림).
# - 서명 비밀키(CLOUD_SIGNING_SEED)·웹훅 비밀은 이 서버 안에서 만들고 밖으로 내보내지 않는다.
# 쓰는 법(EC2 접속 후):  sudo bash jette-ec2-console.sh
set -euo pipefail
REPO=https://github.com/kk00701903-hub/issue-agent
SRC=/opt/agenthub
CONF=/opt/agenthub-console
PORT=8090

command -v docker >/dev/null || { echo "docker 가 없습니다"; exit 1; }
command -v git >/dev/null || (apt-get update -y && apt-get install -y git) || yum install -y git

if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only; else git clone --depth 1 "$REPO" "$SRC"; fi

mkdir -p "$CONF" && chmod 700 "$CONF"
if [ ! -f "$CONF/console.env" ]; then
  SEED=$(python3 -c "import secrets;print(secrets.token_bytes(32).hex())")
  WH=$(python3 -c "import secrets;print(secrets.token_urlsafe(32))")
  printf 'CLOUD_SIGNING_SEED=%s\nBILLING_PROVIDER=manual\nBILLING_WEBHOOK_SECRET=%s\n' "$SEED" "$WH" > "$CONF/console.env"
  chmod 600 "$CONF/console.env"
  (cd "$SRC" && PYTHONPATH="$SRC" python3 -m cloud.keys pub "$SEED") > "$CONF/vendor.pub"
fi

docker build -t agenthub-console -f "$SRC/cloud/Dockerfile" "$SRC"
docker rm -f agenthub-console 2>/dev/null || true
docker run -d --name agenthub-console --restart unless-stopped \
  -p 127.0.0.1:$PORT:8080 -v agenthub-console-data:/data --env-file "$CONF/console.env" agenthub-console

sleep 3
curl -fsS "http://127.0.0.1:$PORT/healthz" && echo " ← 콘솔 정상"
echo "판매용 실행기에 넣을 공개키(비밀 아님): $(cat $CONF/vendor.pub)"
cat <<MSG

다음(한 번): Cloudflare 터널에 주소를 하나 더 붙입니다(제때 AI 와 같은 터널).
 · 대시보드에서 관리하는 터널이면: Cloudflare Zero Trust → Networks → Tunnels → (제때 AI 터널) → Public Hostname 추가
     agenthub.core4i.com  →  http://localhost:$PORT
   (cloudflared 가 docker 안에서 돌면 서비스 주소를 http://host.docker.internal:$PORT 또는 호스트 IP 로)
 · 서버의 config.yml 로 관리하는 터널이면: ingress 의 맨 끝(http_status:404) 위에
     - hostname: agenthub.core4i.com
       service: http://localhost:$PORT
   를 넣고  cloudflared tunnel route dns <터널이름> agenthub.core4i.com  →  sudo systemctl restart cloudflared
   (재시작하는 몇 초 동안 제때 AI 접속도 끊기므로 사용자가 적을 때)
MSG
