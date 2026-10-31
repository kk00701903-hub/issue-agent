@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .env (
  echo .env 파일이 없습니다. .env.example 을 복사해 .env 로 만들고 값을 채우세요.
  pause
  exit /b 1
)
start "" http://127.0.0.1:4830
python -m hub.server
