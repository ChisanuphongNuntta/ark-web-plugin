@echo off
set "PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer;%PATH%"
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
cl.exe /nologo /std:c++17 /EHsc /O2 /W4 /WX /I"F:\ARK Iris\Heart-Plugin\iris-plugins\IrisDefender\Public" /Fo"F:\ARK Iris\Heart-Plugin\iris-plugins\IrisDefender\build-obj\tests\\" /Fe:"F:\ARK Iris\Heart-Plugin\iris-plugins\IrisDefender\build-obj\tests\test_movement_logic.exe" "F:\ARK Iris\Heart-Plugin\iris-plugins\IrisDefender\tests\test_movement_logic.cpp"
if errorlevel 1 exit /b 1
"F:\ARK Iris\Heart-Plugin\iris-plugins\IrisDefender\build-obj\tests\test_movement_logic.exe"
exit /b %ERRORLEVEL%
