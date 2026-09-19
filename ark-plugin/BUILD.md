# HeartShop Plugin Build

`ark-plugin` is the canonical source for the backend-integrated `HeartShop.dll`.
The separate `HeartShop/HeartShop.sln` project builds the legacy `ArkShop.dll`
and must not be used for production releases unless its changes are deliberately
ported into the canonical plugin.

## Prerequisites

- Windows 10/11 x64
- Visual Studio 2022 with Desktop development with C++
- Windows SDK
- CMake 3.24 or newer (`--fresh` is required by the build script)
- Bundled ArkServerApi and nlohmann/json dependencies

The bundled ArkServerApi headers currently require MSVC's default permissive
mode. Do not enable `/permissive-` unless the SDK is upgraded and verified.

## Canonical build

From the workspace root:

```powershell
& .\ark-plugin\scripts\Build-Plugin.ps1
```

The command performs a fresh CMake configure, builds `Release`, runs the plugin
CTest suite, verifies the expected runtime bundle, and creates:

```text
ark-plugin/artifacts/HeartShop-<version>-win-x64-Release/
  HeartShop.dll
  config.json
  PluginInfo.json
  build-manifest.json
  SHA256SUMS
```

Use `SHA256SUMS` to verify that the DLL deployed to each ARK server is the exact
artifact produced by the canonical build.

## Other configurations

```powershell
& .\ark-plugin\scripts\Build-Plugin.ps1 -Configuration RelWithDebInfo
& .\ark-plugin\scripts\Build-Plugin.ps1 -Configuration Debug -SkipPackage
```

Do not place production API keys in the repository copy of `config.json`.
Provision secrets on the target server during deployment.

Production requires a valid HTTPS certificate trusted by Windows. The
`Security.AllowInvalidCertificates` setting defaults to `false` and can only be
enabled when `ApiUrl` targets localhost. Prefer trusting a local development CA
instead of disabling validation.
