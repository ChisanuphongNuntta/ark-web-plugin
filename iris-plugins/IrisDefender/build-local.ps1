<#
    IrisDefender local build (no deployment).

    Compiles IrisDefender.dll exactly like build.bat (x64 Release, C++17, /W3 /WX, /MD, /O2,
    same defines/libs/linker flags) but against the SDK checked out on this machine and
    writes IrisDefender.dll / .pdb / .map into .\artifacts\. It NEVER copies anything to a
    server directory.

    SDK headers : <ArkSdkRoot>\version\Core\Public  (+ <ArkSdkRoot>\include, \include\Poco)
    Import lib  : <ArkSdkRoot>\out_lib\ArkApi.lib   (imports version.dll = ArkApi 3.54 loader)

    Usage:  powershell -ExecutionPolicy Bypass -File .\build-local.ps1 [-ArkSdkRoot <path>] [-SkipTests]
#>
[CmdletBinding()]
param(
    [string]$ArkSdkRoot = 'F:\ARK Iris\iris-ark-plugin-src\ARK-Server-API',
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = $PSScriptRoot
$artifactDir = Join-Path $projectRoot 'artifacts'
$objDir      = Join-Path $projectRoot 'build-obj'
$testOutDir  = Join-Path $objDir 'tests'

foreach ($required in @(
        (Join-Path $ArkSdkRoot 'version\Core\Public\API\ARK\Ark.h'),
        (Join-Path $ArkSdkRoot 'version\Core\Public\json.hpp'),
        (Join-Path $ArkSdkRoot 'out_lib\ArkApi.lib'))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required SDK input missing: $required"
    }
}

# Locate VS2022 vcvars64.bat (vswhere first, then the same fixed paths build.bat probes)
$vcvars = $null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswhere) {
    $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($vsPath) {
        $candidate = Join-Path $vsPath 'VC\Auxiliary\Build\vcvars64.bat'
        if (Test-Path -LiteralPath $candidate) { $vcvars = $candidate }
    }
}
if (-not $vcvars) {
    foreach ($edition in @('Community', 'BuildTools', 'Professional', 'Enterprise')) {
        foreach ($pf in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
            $candidate = Join-Path $pf "Microsoft Visual Studio\2022\$edition\VC\Auxiliary\Build\vcvars64.bat"
            if (-not $vcvars -and (Test-Path -LiteralPath $candidate)) { $vcvars = $candidate }
        }
    }
}
if (-not $vcvars) { throw 'Could not find vcvars64.bat (Visual Studio 2022 C++ toolset required).' }
Write-Host "[OK] MSVC environment: $vcvars"

foreach ($d in @($artifactDir, $objDir, $testOutDir)) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

$sdkPublic = Join-Path $ArkSdkRoot 'version\Core\Public'
$sdkInclude = Join-Path $ArkSdkRoot 'include'
$sdkLib = Join-Path $ArkSdkRoot 'out_lib'

$sources = @(
    'Private\Config.cpp', 'Private\Logger.cpp', 'Private\Webhook.cpp', 'Private\ViolationManager.cpp',
    'Private\ExploitDefense.cpp', 'Private\AntiCheat.cpp', 'Private\IrisDefender.cpp'
) | ForEach-Object { '"' + (Join-Path $projectRoot $_) + '"' }

$dllOut = Join-Path $artifactDir 'IrisDefender.dll'
$pdbOut = Join-Path $artifactDir 'IrisDefender.pdb'
$mapOut = Join-Path $artifactDir 'IrisDefender.map'
$impOut = Join-Path $objDir 'IrisDefender.lib'

# Same flags as build.bat
$cflags  = "/nologo /std:c++17 /EHsc /MD /O2 /W3 /WX /utf-8 /MP /Zi /FS /Fo`"$objDir\\`" /Fd`"$objDir\vc143.pdb`" /Fe:`"$dllOut`""
$defines = '/DWIN32 /D_WINDOWS /D_USRDLL /DUNICODE /D_UNICODE /DNDEBUG /D_DISABLE_CONSTEXPR_MUTEX_CONSTRUCTOR'
$incs    = "/I`"$sdkPublic`" /I`"$sdkInclude`" /I`"$sdkInclude\Poco`" /I`"$projectRoot\Public`""
$lflags  = "/DLL /WX /MACHINE:X64 /OPT:REF /OPT:ICF /DEBUG:FULL /PDB:`"$pdbOut`" /MAP:`"$mapOut`" /IMPLIB:`"$impOut`""
$libs    = "/LIBPATH:`"$sdkLib`" ArkApi.lib ws2_32.lib winhttp.lib Crypt32.lib User32.lib"

$clLine = "cl.exe $cflags $defines $incs $($sources -join ' ') /link $lflags $libs"
$cmdFile = Join-Path $objDir 'build.cmd'
@(
    '@echo off',
    'set "PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer;%PATH%"',
    "call `"$vcvars`" >nul",
    'if errorlevel 1 exit /b 1',
    $clLine,
    'exit /b %ERRORLEVEL%'
) | Set-Content -LiteralPath $cmdFile -Encoding ASCII

Write-Host '[BUILD] Compiling IrisDefender.dll (x64 Release, C++17, /W3 /WX)...'
& cmd.exe /c "`"$cmdFile`""
if ($LASTEXITCODE -ne 0) { throw "IrisDefender build failed (exit $LASTEXITCODE)" }

if (-not $SkipTests) {
    $testSrc = Join-Path $projectRoot 'tests\test_movement_logic.cpp'
    $testExe = Join-Path $testOutDir 'test_movement_logic.exe'
    $testCmd = Join-Path $objDir 'test.cmd'
    @(
        '@echo off',
        'set "PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer;%PATH%"',
        "call `"$vcvars`" >nul",
        "cl.exe /nologo /std:c++17 /EHsc /O2 /W4 /WX /I`"$projectRoot\Public`" /Fo`"$testOutDir\\`" /Fe:`"$testExe`" `"$testSrc`"",
        'if errorlevel 1 exit /b 1',
        "`"$testExe`"",
        'exit /b %ERRORLEVEL%'
    ) | Set-Content -LiteralPath $testCmd -Encoding ASCII
    Write-Host '[TEST] Building and running movement-logic unit tests...'
    & cmd.exe /c "`"$testCmd`""
    if ($LASTEXITCODE -ne 0) { throw "Unit tests failed (exit $LASTEXITCODE)" }
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dllOut).Hash
Write-Host "[SUCCESS] $dllOut"
Write-Host "          SHA-256 $hash"
Write-Host '[INFO] Not deployed. Copy artifacts\IrisDefender.dll (+ .pdb) manually; see deploy notes.'
