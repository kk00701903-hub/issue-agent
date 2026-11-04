# Agent Hub 웹 콘솔. HTTPS 는 앞단(Caddy·Nginx·클라우드 로드밸런서)에서 처리한다.
FROM python:3.12-slim
WORKDIR /app
COPY hub/__init__.py hub/ed25519.py hub/
COPY cloud/ cloud/
ENV HOST=0.0.0.0 PORT=8080 CLOUD_DB=/data/console.db PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/healthz')"
CMD ["python", "-m", "cloud.app"]
