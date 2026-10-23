#pragma once

// Pure (ARK-free) logic for the VIP / Permissions bridge so it can be unit
// tested by CTest without the game:
//   * `permission_grant` / `permission_revoke` delivery payload validation;
//   * the step plan executed against the ArkApi Permissions plugin;
//   * classification of the Permissions API result strings (idempotency:
//     adding an existing group / removing a missing group is a success);
//   * parsing of GET /api/plugin/player/{steamId}/vip for the /vip command.
//
// Payload (backend/contracts/vip-2026-10.md):
//   { "schemaVersion": 1, "steamId": "7656...", "group": "VIP",
//     "action": "add" | "remove", "expiresAt": "<ISO-8601>" | null,
//     "scope": "all" | "timed" | "permanent" (optional, revoke only) }
// The job is NOT bound to the target player being online: Permissions V2 keeps
// its groups in the cluster-shared database, so any server that advertises
// `permissions.group.v1` may apply it, for online and offline players alike.

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "DeliveryJournal.h"

namespace HeartShop::PermissionSync
{
    // Advertised in the heartbeat only while the Permissions plugin is loaded,
    // its group API resolved, and no native fault has been seen on it.
    inline constexpr const char* Capability = "permissions.group.v1";

    inline constexpr const char* GrantDeliveryType = "permission_grant";
    inline constexpr const char* RevokeDeliveryType = "permission_revoke";

    bool IsPermissionDeliveryType(const std::string& DeliveryType);

    // Process-wide flag read by the heartbeat. Thread-safe.
    void SetBridgeAvailable(bool Available);
    bool IsBridgeAvailable();

    enum class Action
    {
        Add,
        Remove
    };

    // Which memberships a revoke removes. Default All: the web is the source of
    // truth for the group, so a revoke leaves the player without it. "timed"
    // keeps a hand-added permanent membership (e.g. an old in-game grant).
    enum class RevokeScope
    {
        All,
        Timed,
        Permanent
    };

    struct Request
    {
        Action Kind = Action::Add;
        std::uint64_t SteamId = 0;
        std::string SteamIdText;
        std::string Group;
        bool HasExpiry = false;
        long long ExpiresAtUnix = 0;
        RevokeScope Scope = RevokeScope::All;
    };

    // SteamID64 as a decimal string: 1..20 digits, non-zero, fits in uint64.
    bool ParseSteamId64(const std::string& Text, std::uint64_t& Out);

    // Group names are written by the Permissions plugin into a comma separated
    // DB column with unescaped SQL, so only [A-Za-z0-9_.+-]{1,64} is accepted.
    bool IsValidGroupName(const std::string& Group);

    // Groups the bridge never touches regardless of what the backend sends:
    // "Admins" (in-game admin rights) and "Default" (every player). Case-insensitive.
    bool IsProtectedGroup(const std::string& Group);

    // AllowedGroups empty = every group allowed; otherwise case-insensitive match.
    bool IsGroupAllowed(const std::string& Group, const std::vector<std::string>& AllowedGroups);

    // ISO-8601 UTC/offset timestamp ("2026-11-22T10:00:00.000Z",
    // "2026-11-22T17:00:00+07:00") -> Unix seconds. Fractions are truncated.
    bool ParseIso8601(const std::string& Text, long long& UnixSeconds);
    std::string FormatUtc(long long UnixSeconds); // "2026-11-22 10:00 UTC"

    // Validates a claimed job. ClaimedSteamId is the claim's playerSteamId; when
    // non-empty it must equal payload.steamId. AllowedGroups empty = any valid,
    // non-protected group; otherwise the group must be listed (case-insensitive).
    bool ParseRequest(
        const std::string& DeliveryType,
        const std::string& ClaimedSteamId,
        const nlohmann::json& Payload,
        const std::vector<std::string>& AllowedGroups,
        Request& Out,
        std::string& Error);

    enum class StepKind
    {
        AddPermanent,
        AddTimed,
        RemovePermanent,
        RemoveTimed
    };
    const char* StepName(StepKind Kind);

    struct Step
    {
        StepKind Kind = StepKind::AddPermanent;
        int Seconds = 0; // AddTimed only
    };

    struct Plan
    {
        std::vector<Step> Steps;
        // Nothing to apply (e.g. a grant whose expiresAt already passed); the
        // job is still completed so the backend stops re-sending it.
        bool NoOp = false;
        std::string Note;
        // After the steps, IsPlayerInGroup must be true (adds only).
        bool VerifyInGroup = false;
    };

    // TimedSupported = the loaded Permissions exports AddPlayerToTimedGroup and
    // RemovePlayerFromTimedGroup. Timed grant = RemovePermanent + RemoveTimed +
    // AddTimed(expires-now)
    // so a re-run converges on the absolute expiry instead of stacking time
    // (Permissions' AddPlayerToTimedGroup ADDS to a running timer).
    Plan BuildPlan(const Request& Req, long long NowUnix, bool TimedSupported);

    enum class StepOutcome
    {
        Applied,
        AlreadyInState, // idempotent no-op: counts as success
        Error
    };

    // Permissions returns std::nullopt on success, otherwise a message.
    StepOutcome ClassifyResult(StepKind Kind, const std::optional<std::string>& Result);

    // Journal handshake for a permission job. Group sync is convergent (it sets
    // the group to the requested state), so an unfinished record left by a crash
    // is reset and re-run instead of being parked for manual reconciliation.
    enum class JournalDecision
    {
        Execute,             // record is "mutating": apply, then Complete/Abort
        AcknowledgeOnly,     // already completed locally: re-send /complete only
        FailPayloadMismatch, // payload changed for this delivery id: /fail
        Release              // journal could not persist: /release (no attempt used)
    };
    JournalDecision BeginJournal(
        DeliveryJournal& Journal,
        const std::string& DeliveryType,
        const std::string& DeliveryId,
        const std::string& Payload,
        bool* ReRun = nullptr);

    // GET /player/{steamId}/vip, parsed defensively (flat or { vip: {...} }).
    struct VipStatus
    {
        bool Linked = true;
        bool Active = false;
        std::string Label;
        std::string PackageName;
        std::string Group;
        int TierRank = 0;
        bool Permanent = false;
        std::string ExpiresAt; // raw ISO string, empty when permanent / not VIP
        long long ExpiresAtUnix = 0;
    };
    VipStatus ParseVipStatus(const nlohmann::json& Response);

    // Chat lines for /vip. InGameGroup: whether this server's Permissions cache
    // already shows the group (nullopt when the bridge is unavailable).
    std::vector<std::string> FormatVipStatus(
        const VipStatus& Status,
        long long NowUnix,
        std::optional<bool> InGameGroup);

    // ---- In-game chat rank (reuses the web Chat Ranks, GET /chat/plugin/config) ----
    struct ChatRank
    {
        std::string GroupKey; // Permissions group, e.g. "VIP"
        std::string Name;     // tag text, e.g. "VIP"
        int Priority = 0;
    };

    // `ranks` of GET /chat/plugin/config, highest priority first. Entries without
    // a valid group / name are skipped; names are sanitized (SanitizeRankTag).
    std::vector<ChatRank> ParseChatRanks(const nlohmann::json& Response);

    // Highest-priority rank whose group the player holds (case-insensitive).
    // Empty string = no rank.
    std::string PickChatRankName(const std::vector<ChatRank>& Ranks, const std::vector<std::string>& PlayerGroups);

    // Tag text safe for one chat line: control characters and brackets dropped,
    // trimmed, at most 24 bytes (whole UTF-8 sequences only).
    std::string SanitizeRankTag(const std::string& Tag);

    // "[VIP] Name" (or Name when the tag is empty).
    std::string FormatRankedSender(const std::string& RankTag, const std::string& SenderName);

    // Line for a web/discord message broadcast in game:
    // "[Web] [VIP] Name: text" / "[Discord] Name: text".
    std::string FormatCrossChatLine(
        const std::string& Source,
        const std::string& RankTag,
        const std::string& SenderName,
        const std::string& Content);
}
