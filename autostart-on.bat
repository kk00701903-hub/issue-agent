@echo off
chcp 65001 >nul
rem PC를 켜면 관리 서버가 창 없이 자동으로 켜지게 한다(작업 표시줄에 창이 남지 않음).
cd /d "%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%STARTUP%\AgentHub-server.vbs"
> "%VBS%" echo Set sh = CreateObject("WScript.Shell")
>> "%VBS%" echo sh.CurrentDirectory = "%~dp0"
>> "%VBS%" echo sh.Run "pythonw -m hub.server", 0, False
echo 자동 실행을 켰습니다: %VBS%
echo 지금 바로 켜려면 그 파일을 더블클릭하거나 run.bat 을 실행하세요.
echo 끄려면 autostart-off.bat 을 실행하세요.
pause
