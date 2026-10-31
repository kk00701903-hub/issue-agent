@echo off
chcp 65001 >nul
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AgentHub-server.vbs"
if exist "%VBS%" (
  del "%VBS%"
  echo 자동 실행을 껐습니다. 이미 켜져 있는 서버는 작업 관리자에서 pythonw 를 끝내거나 PC를 다시 켜면 꺼집니다.
) else (
  echo 자동 실행이 켜져 있지 않습니다.
)
pause
