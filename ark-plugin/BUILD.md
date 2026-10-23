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

## VIP / Permissions bridge (`permissions.group.v1`)

HeartShop applies web VIP memberships to the ArkApi **Permissions** plugin
(V2, cluster MySQL). The backend queues `permission_grant` / `permission_revoke`
delivery jobs (payload `{schemaVersion:1, steamId, group, action:'add'|'remove',
expiresAt?}`, see `backend/contracts/vip-2026-10.md`); any server advertising
`permissions.group.v1` may claim them, and the target player may be offline.

* The capability is advertised only while `Permissions.dll` is loaded and its
  group API resolves (re-checked before every heartbeat; a Permissions reload is
  picked up, an unload withdraws it). Without Permissions, permission jobs that
  still reach this server are released (no attempt consumed).
* Grant with `expiresAt`: `RemovePlayerFromGroup` (a stale permanent membership
  would outlive the web's end date) + `RemovePlayerFromTimedGroup` +
  `AddPlayerToTimedGroup` (remaining seconds), so a re-run lands on the same absolute expiry (Permissions
  itself ADDS time to a running timer). Grant without `expiresAt`:
  `AddPlayerToGroup`. Revoke: removes the timed and the permanent membership.
  "Already in group" / "not in group" count as success. Admins/Default are never
  touched; `HeartShop.Permissions.AllowedGroups` (optional) restricts the groups a
  server will change (others are released for another server).
* The group must already exist in Permissions (the legacy `VIP` group does);
  otherwise the job fails with `Group does not exist` and the backend retries /
  dead-letters it (admin resync after `Permissions.AddGroup <group>`).
* Every Permissions call runs under an SEH guard: a native fault disables the
  bridge until Permissions is reloaded instead of crashing the server.
* Known Permissions V2 caveat: each server caches groups and re-reads MySQL every
  `ClusterSyncTime` (default 60 s). Other servers see a change within that
  window; a player whose Permissions row was created on another server in the
  last sync window can have that row rewritten from the stale cache, and a
  revoke run there would report "not in group" (success) while MySQL still holds
  the timed VIP. The backend therefore keeps consecutive jobs for one player/group
  on the server that completed the previous one for `ClusterSyncTime + 30 s`
  (`PERMISSIONS_CLUSTER_SYNC_SECONDS` on plugin-gateway if you changed
  `ClusterSyncTime`).
* `/vip` (and `/iris vip`) shows the web VIP status (GET
  `/api/plugin/player/{steamId}/vip`) and whether the group is already active on
  this server. `HeartShop.Vip.CommandEnabled: false` keeps only `/iris vip`.
* Cross-chat now sends the sender's real SteamID64 (rebuilt from the 32-bit id of
  `AShooterGameMode.SendChatMessage` and checked against online players), so the
  web Chat Rank mapped to the VIP group shows on game messages on the web/Discord.
* In-game chat rank: HeartShop loads the web Chat Ranks (`GET /chat/plugin/config`,
  every 5 minutes) and re-sends a global chat line of a player in a mapped
  Permissions group as `[VIP] Name` (the default line is suppressed and the
  message is forwarded to cross-chat by HeartShop). Web messages from a VIP show
  as `[Web] [VIP] Name: text`. `HeartShop.Vip.ChatRankPrefix: false` turns the
  in-game prefix off (use it if another plugin already prefixes chat by group).

Smoke test after deploy (one server is enough for the cluster):

1. Server log: `Permissions plugin linked (timed groups: yes); advertising
   permissions.group.v1`; the backend server directory lists the capability.
2. Admin grants VIP 30 days on the web: within one poll interval the log shows
   `RemovePlayerFromTimedGroup ... already in state`, `AddPlayerToTimedGroup ...
   applied (2592000s)` and `Permission job ... acknowledged`; in game
   RCON `Permissions.PlayerGroups <steamId>` (or `/vip`, `/groups`) shows VIP, also for an
   offline player. A VIP-only command such as `/pods` works.
3. Admin extends by 7 days: the timed group is re-applied with the new total, not
   stacked. Admin revokes: the group disappears (other servers within ~60 s).
4. Unload Permissions (`plugins.unload Permissions`): the next heartbeat no
   longer lists the capability and no crash occurs; load it again and it returns.
