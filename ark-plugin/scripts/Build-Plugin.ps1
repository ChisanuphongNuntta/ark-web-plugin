[CmdletBinding()]
param(
    [ValidateSet('Release', 'RelWithDebInfo', 'Debug')]
    [string]$Configuration = 'Release',

    [string]$BuildDirectory = 'build-canonical',

    [string]$ArtifactDirectory = 'artifacts',

    [switch]$SkipTests,

    [switch]$SkipPackage
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$pluginRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildPath = [System.IO.Path]::GetFullPath((Join-Path $pluginRoot $BuildDirectory))
$artifactRoot = [System.IO.Path]::GetFullPath((Join-Path $pluginRoot $ArtifactDirectory))

function Assert-PathInsidePluginRoot {
    param([Parameter(Mandatory)][string]$Path)

    $rootWithSeparator = $pluginRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if (-not $Path.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path must remain inside plugin root: $Path"
    }
}

Assert-PathInsidePluginRoot -Path $buildPath
Assert-PathInsidePluginRoot -Path $artifactRoot

$requiredFiles = @(
    (Join-Path $pluginRoot 'CMakeLists.txt'),
    (Join-Path $pluginRoot 'PluginInfo.json'),
    (Join-Path $pluginRoot 'config.json'),
    (Join-Path $pluginRoot 'deps\ArkServerApi\lib\ArkApi.lib'),
    (Join-Path $pluginRoot 'deps\json-3.12.0\single_include\nlohmann\json.hpp')
)

foreach ($requiredFile in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required build input is missing: $requiredFile"
    }
}

if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
    throw 'CMake is not available on PATH.'
}

$pluginInfo = Get-Content -LiteralPath (Join-Path $pluginRoot 'PluginInfo.json') -Raw | ConvertFrom-Json
$version = [string]$pluginInfo.Version
$safeVersion = $version -replace '[^0-9A-Za-z._-]', '-'

Write-Host "Configuring HeartShop $version ($Configuration)..."
& cmake --fresh -S $pluginRoot -B $buildPath -G 'Visual Studio 17 2022' -A x64
if ($LASTEXITCODE -ne 0) {
    throw "CMake configure failed with exit code $LASTEXITCODE"
}

Write-Host 'Building plugin...'
& cmake --build $buildPath --config $Configuration --parallel
if ($LASTEXITCODE -ne 0) {
    throw "CMake build failed with exit code $LASTEXITCODE"
}

if (-not $SkipTests) {
    Write-Host 'Running plugin tests...'
    & ctest --test-dir $buildPath -C $Configuration --output-on-failure
    if ($LASTEXITCODE -ne 0) {
        throw "Plugin tests failed with exit code $LASTEXITCODE"
    }
}

$runtimePath = Join-Path $buildPath "bin\$Configuration"
$dllPath = Join-Path $runtimePath 'HeartShop.dll'
if (-not (Test-Path -LiteralPath $dllPath -PathType Leaf)) {
    throw "Build completed without expected DLL: $dllPath"
}

$dllHash = (Get-FileHash -LiteralPath $dllPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "DLL SHA-256: $dllHash"

if (-not $SkipPackage) {
    $packageName = "HeartShop-$safeVersion-win-x64-$Configuration"
    $packagePath = Join-Path $artifactRoot $packageName
    New-Item -ItemType Directory -Path $packagePath -Force | Out-Null

    Copy-Item -LiteralPath $dllPath -Destination $packagePath -Force
    Copy-Item -LiteralPath (Join-Path $runtimePath 'config.json') -Destination $packagePath -Force
    Copy-Item -LiteralPath (Join-Path $runtimePath 'PluginInfo.json') -Destination $packagePath -Force

    $compilerFile = Get-ChildItem -LiteralPath (Join-Path $buildPath 'CMakeFiles') `
        -Filter 'CMakeCXXCompiler.cmake' -File -Recurse |
        Select-Object -First 1
    $compiler = if ($compilerFile) {
        $compilerPath = Select-String -LiteralPath $compilerFile.FullName `
            -Pattern '^set\(CMAKE_CXX_COMPILER "(.+)"\)$' |
            Select-Object -First 1
        $compilerVersion = Select-String -LiteralPath $compilerFile.FullName `
            -Pattern '^set\(CMAKE_CXX_COMPILER_VERSION "(.+)"\)$' |
            Select-Object -First 1
        if ($compilerPath -and $compilerVersion) {
            "$($compilerPath.Matches[0].Groups[1].Value) ($($compilerVersion.Matches[0].Groups[1].Value))"
        } else {
            'unknown'
        }
    } else {
        'unknown'
    }
    $cmakeVersion = (& cmake --version | Select-Object -First 1).Trim()

    $manifest = [ordered]@{
        plugin = [ordered]@{
            name = [string]$pluginInfo.FullName
            version = $version
            minApiVersion = [string]$pluginInfo.MinApiVersion
        }
        target = 'windows-x64'
        configuration = $Configuration
        cmake = $cmakeVersion
        compiler = $compiler
        artifact = 'HeartShop.dll'
        sha256 = $dllHash
        generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    }

    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $packagePath 'build-manifest.json') -Encoding UTF8
    "$dllHash  HeartShop.dll" | Set-Content -LiteralPath (Join-Path $packagePath 'SHA256SUMS') -Encoding ASCII

    Write-Host "Package ready: $packagePath"
}
