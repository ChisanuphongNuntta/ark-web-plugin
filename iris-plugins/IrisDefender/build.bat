@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo   IrisDefender - Enterprise ArkApi v3.54 Plugin Build
echo =======================================================

:: 1. Locate Visual Studio 2022 vcvars64.bat
set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "!VCVARS!" (
    set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
)
if not exist "!VCVARS!" (
    set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat"
)
if not exist "!VCVARS!" (
    set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
)

if not exist "!VCVARS!" (
    echo [ERROR] Could not find vcvars64.bat. Visual Studio 2022 Build Tools required.
    exit /b 1
)

call "!VCVARS!" >nul 2>&1
echo [OK] Initialized MSVC x64 Build Environment.

:: 2. Configuration Paths
set "SDK_ROOT=C:\Arkdata\ArkApi_SDK\ARK-Server-API-3.54"
set "DEPLOY_DIR=C:\Arkdata\Servers\PVP-CENTER\ShooterGame\Binaries\Win64\ArkApi\Plugins\IrisDefender"
set "PROJECT_ROOT=%~dp0"
cd /d "!PROJECT_ROOT!"

:: 3. Compiler & Linker Flags (Strict Zero-Warning Standard)
set "INCLUDES=/I"!SDK_ROOT!\version\Core\Public" /I"!SDK_ROOT!\include" /I"!SDK_ROOT!\include\Poco" /I"Public""
set "LIBDIRS=/LIBPATH:"!SDK_ROOT!\out_lib" /LIBPATH:"!SDK_ROOT!\lib""
set "LIBS=ArkApi.lib ws2_32.lib winhttp.lib Crypt32.lib User32.lib"
set "DEFINES=/DWIN32 /D_WINDOWS /D_USRDLL /DUNICODE /D_UNICODE /DNDEBUG /D_DISABLE_CONSTEXPR_MUTEX_CONSTRUCTOR"
set "CFLAGS=/std:c++17 /EHsc /MD /O2 /W3 /WX /utf-8 /MP /Zi /FS /Fe:IrisDefender.dll"
set "LFLAGS=/DLL /WX /MACHINE:X64 /OPT:REF /OPT:ICF /DEBUG:FULL /PDB:IrisDefender.pdb /MAP:IrisDefender.map"

:: 4. Source Files
set "SOURCES=Private\Config.cpp Private\Logger.cpp Private\Webhook.cpp Private\ViolationManager.cpp Private\ExploitDefense.cpp Private\AntiCheat.cpp Private\IrisDefender.cpp"

echo [BUILD] Compiling and Linking IrisDefender.dll (x64 Release, C++17, Zero Warnings)...
cl.exe %CFLAGS% %DEFINES% %INCLUDES% %SOURCES% /link %LFLAGS% %LIBDIRS% %LIBS%

if %ERRORLEVEL% neq 0 (
    echo [FAIL] Compilation/Linking failed with error code %ERRORLEVEL%.
    exit /b %ERRORLEVEL%
)

echo [SUCCESS] IrisDefender.dll compiled cleanly with 0 warnings!

:: Clean intermediate build files
del *.obj *.exp *.lib >nul 2>&1

:: 5. Deployment Packaging
if not exist "!DEPLOY_DIR!" (
    echo [DEPLOY] Creating plugin deployment directory: !DEPLOY_DIR!
    mkdir "!DEPLOY_DIR!"
)

echo [DEPLOY] Deploying IrisDefender.dll to !DEPLOY_DIR!
copy /Y "IrisDefender.dll" "!DEPLOY_DIR!\IrisDefender.dll" >nul

if exist "IrisDefender.pdb" (
    copy /Y "IrisDefender.pdb" "!DEPLOY_DIR!\IrisDefender.pdb" >nul
)

if exist "PluginInfo.json" (
    copy /Y "PluginInfo.json" "!DEPLOY_DIR!\PluginInfo.json" >nul
)

if exist "config.json" (
    copy /Y "config.json" "!DEPLOY_DIR!\config.json" >nul
)

:: Hot-reload trigger file for ArkApi automatic reloading
copy /Y "IrisDefender.dll" "!DEPLOY_DIR!\IrisDefender.dll.ArkApi" >nul
echo [DEPLOY] Created IrisDefender.dll.ArkApi for zero-downtime hot reloading.

echo =======================================================
echo   IrisDefender build and deployment complete!
echo =======================================================
exit /b 0
