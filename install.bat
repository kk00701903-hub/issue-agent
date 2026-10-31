@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/4] Python 확인
python --version || (echo Python 3.10 이상을 설치하세요 & pause & exit /b 1)
echo [2/4] 에이전트 SDK 설치(실제 실행용, 선택)
pip install -r requirements.txt
echo [3/4] 크롬 통제용 Playwright MCP 미리 받기(선택, Node.js 필요)
where npx >nul 2>&1 && (npx -y @playwright/mcp@latest --version) || echo   Node.js 가 없어 건너뜀 — 크롬 통제를 쓰려면 Node.js 설치 후 다시 실행
echo [4/4] 설정 파일
if not exist .env copy .env.example .env >nul && echo   .env 를 만들었습니다. 열어서 값을 채우세요.
if not exist data\runs mkdir data\runs
echo.
echo 설치 끝. run.bat 으로 실행하세요.
python -m unittest discover -s tests 2>&1 | findstr /C:"OK" /C:"FAILED"
pause
