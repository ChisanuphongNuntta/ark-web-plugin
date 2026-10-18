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

## Upgrading a live server

Replace only `HeartShop.dll` in `ArkApi/Plugins/HeartShop/`. Keep the server's
existing `config.json`: the copy in the artifact folder is a template and its
`ApiUrl`, keys and `ServerId` are not the live values.

## Catalog dino cryopod smoke test (in game, after deploy)

The cryopod delivery path (`dino_catalog` with `dino.cryopod: true`) calls ARK
natives that CTest cannot exercise. Run these once per server after deploying:

1. Server log shows `Cryopod item class resolved; advertising delivery.dino.cryopod.v1`
   and the backend server directory lists that capability.
2. Buy a land dino: a cryopod appears in the inventory, no dino next to you, and
   releasing the pod gives a tamed dino of the bought level owned by your tribe.
3. Buy an aquatic dino while standing on land: cryopod only; release it in water.
4. Fill the inventory to `MaxItems - 1` and buy: the pod is accepted (no
   `AddItemObject refused the cryopod` error in the log).
5. Fill the inventory completely and buy: chat says the inventory is full, log
   shows `deferred (no attempt consumed)`, the backend job stays pending with its
   attempt count unchanged; free a slot and the pod arrives on the next poll.

## Item / dino extras smoke test (in game, after deploy)

Item gives follow ArkShop `Store::BuyItem` and are all-or-nothing:

1. Buy an armor piece x3: three separate items arrive (the old plugin gave one).
2. Buy a stackable above one stack (e.g. 301 ingots at stack 300 on a server
   with that stack size): two stacks arrive, nothing is lost.
3. Fill the inventory so fewer free slots remain than the order needs and buy:
   chat says how many slots are needed, log shows `deferred (no attempt
   consumed)`, nothing was given; free the slots and the order arrives whole.
4. While controlled by a Noglin (or unconscious / carried) run `/iris claim`:
   delivery is deferred with a chat notice and arrives once released.
5. On a server advertising `delivery.dino.extras.v1`, buy a dino with a saddle:
   the saddle is equipped when the cryopod is released (or on the live tame).
