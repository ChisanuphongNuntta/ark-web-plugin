#include "PermissionSync.h"

#include <Windows.h>
#include <climits>
#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

using namespace HeartShop::PermissionSync;

namespace
{
    int Failures = 0;

    void Check(bool Condition, const char* What)
    {
        if (!Condition)
        {
            std::fprintf(stderr, "FAILED: %s\n", What);
            ++Failures;
        }
    }

    const char* Steam = "76561198000000001";
    // 2026-11-22T10:00:00Z
    constexpr long long Expiry = 1795341600LL;

    nlohmann::json Grant()
    {
        return nlohmann::json{
            {"schemaVersion", 1},
            {"steamId", Steam},
            {"group", "VIP"},
            {"action", "add"},
            {"expiresAt", "2026-11-22T10:00:00.000Z"},
        };
    }

    nlohmann::json Revoke()
    {
        return nlohmann::json{
            {"schemaVersion", 1},
            {"steamId", Steam},
            {"group", "VIP"},
            {"action", "remove"},
        };
    }

    bool Parses(const std::string& Type, const nlohmann::json& Payload, Request& Out,
        const std::string& Claimed = Steam, const std::vector<std::string>& Allowed = {})
    {
        std::string Error;
        return ParseRequest(Type, Claimed, Payload, Allowed, Out, Error);
    }

    bool Rejects(const std::string& Type, const nlohmann::json& Payload,
        const std::string& Claimed = Steam, const std::vector<std::string>& Allowed = {})
    {
        Request Ignored;
        std::string Error;
        const bool Ok = ParseRequest(Type, Claimed, Payload, Allowed, Ignored, Error);
        return !Ok && !Error.empty();
    }

    void TestTypes()
    {
        Check(IsPermissionDeliveryType("permission_grant"), "grant type");
        Check(IsPermissionDeliveryType("permission_revoke"), "revoke type");
        Check(!IsPermissionDeliveryType("order") && !IsPermissionDeliveryType(""), "other types");
        Check(std::string(Capability) == "permissions.group.v1", "capability name");
        SetBridgeAvailable(true);
        Check(IsBridgeAvailable(), "flag on");
        SetBridgeAvailable(false);
        Check(!IsBridgeAvailable(), "flag off");
    }

    void TestIso8601()
    {
        long long T = 0;
        Check(ParseIso8601("2026-11-22T10:00:00.000Z", T) && T == Expiry, "ISO with millis Z");
        Check(ParseIso8601("2026-11-22T10:00:00Z", T) && T == Expiry, "ISO Z");
        Check(ParseIso8601("2026-11-22T17:00:00+07:00", T) && T == Expiry, "ISO +07:00");
        Check(ParseIso8601("2026-11-22T03:00:00-0700", T) && T == Expiry, "ISO -0700");
        Check(ParseIso8601("1970-01-01T00:00:00Z", T) && T == 0, "epoch");
        Check(ParseIso8601("2028-02-29T00:00:00Z", T), "leap day");
        Check(!ParseIso8601("2027-02-29T00:00:00Z", T), "non-leap Feb 29");
        Check(!ParseIso8601("2026-11-22T10:00:00", T), "zone required");
        Check(!ParseIso8601("2026-13-01T00:00:00Z", T), "month 13");
        Check(!ParseIso8601("2026-11-22", T), "date only");
        Check(!ParseIso8601("2026-11-22T10:00:00Zjunk", T), "trailing junk");
        Check(!ParseIso8601("", T), "empty");
        Check(FormatUtc(Expiry) == "2026-11-22 10:00 UTC", "format UTC");
        Check(FormatUtc(0) == "1970-01-01 00:00 UTC", "format epoch");
    }

    void TestSteamAndGroup()
    {
        std::uint64_t Id = 0;
        Check(ParseSteamId64(Steam, Id) && Id == 76561198000000001ull, "steam id");
        Check(ParseSteamId64("18446744073709551615", Id), "uint64 max");
        Check(!ParseSteamId64("18446744073709551616", Id), "uint64 overflow");
        Check(!ParseSteamId64("0", Id), "zero");
        Check(!ParseSteamId64("-1", Id) && !ParseSteamId64("7656x", Id) && !ParseSteamId64("", Id), "garbage");

        Check(IsValidGroupName("VIP") && IsValidGroupName("VIP_Gold-2") && IsValidGroupName("VIP+.x"), "valid groups");
        Check(!IsValidGroupName(""), "empty group");
        Check(!IsValidGroupName("VIP,Admins"), "comma injection");
        Check(!IsValidGroupName("VIP'; DROP TABLE Players;--"), "sql injection");
        Check(!IsValidGroupName("VIP Gold"), "space");
        Check(!IsValidGroupName(std::string(65, 'A')), "too long");
        Check(IsProtectedGroup("Admins") && IsProtectedGroup("admins") && IsProtectedGroup("DEFAULT"), "protected");
        Check(!IsProtectedGroup("VIP"), "VIP not protected");
        Check(IsGroupAllowed("VIP", {}) && IsGroupAllowed("vip", {"VIP"}) && !IsGroupAllowed("VIP2", {"VIP"}), "allow-list");
    }

    void TestParseGrant()
    {
        Request R;
        Check(Parses(GrantDeliveryType, Grant(), R), "grant parses");
        Check(R.Kind == Action::Add && R.SteamId == 76561198000000001ull && R.SteamIdText == Steam, "grant steam");
        Check(R.Group == "VIP" && R.HasExpiry && R.ExpiresAtUnix == Expiry, "grant group/expiry");

        auto Permanent = Grant();
        Permanent["expiresAt"] = nullptr;
        Check(Parses(GrantDeliveryType, Permanent, R) && !R.HasExpiry, "null expiry = permanent");
        Permanent.erase("expiresAt");
        Check(Parses(GrantDeliveryType, Permanent, R) && !R.HasExpiry, "absent expiry = permanent");

        // Empty claimed playerSteamId: payload is authoritative.
        Check(Parses(GrantDeliveryType, Grant(), R, ""), "empty claimed steam id accepted");
    }

    void TestParseRejects()
    {
        Check(Rejects("order", Grant()), "wrong type");
        Check(Rejects(GrantDeliveryType, nlohmann::json::array()), "non-object");
        Check(Rejects(RevokeDeliveryType, Grant()), "action/type mismatch (add on revoke)");
        Check(Rejects(GrantDeliveryType, Revoke()), "action/type mismatch (remove on grant)");
        Check(Rejects(GrantDeliveryType, Grant(), "76561198000000002"), "claimed steam mismatch");

        auto P = Grant(); P["schemaVersion"] = 2;
        Check(Rejects(GrantDeliveryType, P), "schema 2");
        P = Grant(); P.erase("schemaVersion");
        Check(Rejects(GrantDeliveryType, P), "schema missing");
        P = Grant(); P["steamId"] = 76561198000000001ull;
        Check(Rejects(GrantDeliveryType, P), "numeric steamId");
        P = Grant(); P["group"] = "Admins";
        Check(Rejects(GrantDeliveryType, P), "Admins protected");
        P = Revoke(); P["group"] = "Default";
        Check(Rejects(RevokeDeliveryType, P), "Default protected on revoke");
        P = Grant(); P["group"] = "VIP,Admins";
        Check(Rejects(GrantDeliveryType, P), "comma group");
        P = Grant(); P["expiresAt"] = "tomorrow";
        Check(Rejects(GrantDeliveryType, P), "bad expiry");
        P = Grant(); P["expiresAt"] = 12345;
        Check(Rejects(GrantDeliveryType, P), "numeric expiry");
        P = Revoke(); P["scope"] = "everything";
        Check(Rejects(RevokeDeliveryType, P), "bad scope");
        Check(Rejects(GrantDeliveryType, Grant(), Steam, {"VIP2"}), "allow-list rejects");
    }

    void TestParseRevoke()
    {
        Request R;
        Check(Parses(RevokeDeliveryType, Revoke(), R), "revoke parses");
        Check(R.Kind == Action::Remove && R.Scope == RevokeScope::All && !R.HasExpiry, "revoke defaults");
        auto P = Revoke(); P["scope"] = "timed";
        Check(Parses(RevokeDeliveryType, P, R) && R.Scope == RevokeScope::Timed, "timed scope");
        P["scope"] = "permanent";
        Check(Parses(RevokeDeliveryType, P, R) && R.Scope == RevokeScope::Permanent, "permanent scope");
        P = Revoke(); P["expiresAt"] = "2026-11-22T10:00:00Z";
        Check(Parses(RevokeDeliveryType, P, R) && !R.HasExpiry, "expiry ignored on revoke");
    }

    void TestPlan()
    {
        Request R;
        Parses(GrantDeliveryType, Grant(), R);

        // Timed grant: remove-then-add so a re-run converges on the absolute expiry.
        auto P = BuildPlan(R, Expiry - 3600, true);
        Check(!P.NoOp && P.Steps.size() == 3, "timed plan size");
        Check(P.Steps[0].Kind == StepKind::RemovePermanent, "timed plan drops a stale permanent membership");
        Check(P.Steps[1].Kind == StepKind::RemoveTimed, "timed plan resets the timer");
        Check(P.Steps[2].Kind == StepKind::AddTimed && P.Steps[2].Seconds == 3600, "timed plan seconds");
        Check(P.VerifyInGroup, "grant verifies");

        // Re-running later yields the remaining time, never stacked time.
        auto Later = BuildPlan(R, Expiry - 1800, true);
        Check(Later.Steps[2].Seconds == 1800, "re-run converges");

        // Expired grant: no-op success.
        auto Expired = BuildPlan(R, Expiry, true);
        Check(Expired.NoOp && Expired.Steps.empty() && !Expired.Note.empty(), "expired grant no-op");

        // Huge remaining time clamps to int.
        auto Far = BuildPlan(R, Expiry - (static_cast<long long>(INT_MAX) + 100), true);
        Check(Far.Steps[2].Seconds == INT_MAX, "clamped seconds");

        // No timed support: permanent add (backend revoke removes it at expiry).
        auto NoTimed = BuildPlan(R, Expiry - 3600, false);
        Check(NoTimed.Steps.size() == 1 && NoTimed.Steps[0].Kind == StepKind::AddPermanent && !NoTimed.Note.empty(),
            "fallback to permanent add");

        Request Perm;
        auto PermPayload = Grant(); PermPayload["expiresAt"] = nullptr;
        Parses(GrantDeliveryType, PermPayload, Perm);
        auto PP = BuildPlan(Perm, Expiry, true);
        Check(PP.Steps.size() == 1 && PP.Steps[0].Kind == StepKind::AddPermanent, "permanent grant");

        Request Rv;
        Parses(RevokeDeliveryType, Revoke(), Rv);
        auto RP = BuildPlan(Rv, Expiry, true);
        Check(RP.Steps.size() == 2 && RP.Steps[0].Kind == StepKind::RemoveTimed &&
            RP.Steps[1].Kind == StepKind::RemovePermanent && !RP.VerifyInGroup, "revoke all");
        auto RPNoTimed = BuildPlan(Rv, Expiry, false);
        Check(RPNoTimed.Steps.size() == 1 && RPNoTimed.Steps[0].Kind == StepKind::RemovePermanent, "revoke w/o timed");
        Rv.Scope = RevokeScope::Timed;
        auto RT = BuildPlan(Rv, Expiry, true);
        Check(RT.Steps.size() == 1 && RT.Steps[0].Kind == StepKind::RemoveTimed, "revoke timed only");
        auto RTNo = BuildPlan(Rv, Expiry, false);
        Check(RTNo.NoOp, "timed-only revoke without timed support is a no-op");
        Rv.Scope = RevokeScope::Permanent;
        auto RPerm = BuildPlan(Rv, Expiry, true);
        Check(RPerm.Steps.size() == 1 && RPerm.Steps[0].Kind == StepKind::RemovePermanent, "revoke permanent only");
    }

    void TestClassify()
    {
        // Exact strings returned by ASE-Plugins-master/Permissions (MysqlDB.h / SqlLiteDB.h).
        Check(ClassifyResult(StepKind::AddPermanent, std::nullopt) == StepOutcome::Applied, "add ok");
        Check(ClassifyResult(StepKind::AddPermanent, std::string("Player was already added")) == StepOutcome::AlreadyInState,
            "add existing is success");
        Check(ClassifyResult(StepKind::AddPermanent, std::string("Group does not exist")) == StepOutcome::Error,
            "add to missing group is an error");
        Check(ClassifyResult(StepKind::AddPermanent, std::string("Unexpected DB error")) == StepOutcome::Error, "add db error");
        Check(ClassifyResult(StepKind::AddTimed, std::string("Player is already permanently in this group.")) ==
            StepOutcome::AlreadyInState, "timed add on permanent member is success");
        Check(ClassifyResult(StepKind::AddTimed, std::string("Group does not exist")) == StepOutcome::Error, "timed add missing group");
        Check(ClassifyResult(StepKind::RemovePermanent, std::string("Player is not in group")) == StepOutcome::AlreadyInState,
            "remove missing is success");
        Check(ClassifyResult(StepKind::RemovePermanent, std::string("Player or group does not exist")) ==
            StepOutcome::AlreadyInState, "remove unknown player is success");
        Check(ClassifyResult(StepKind::RemoveTimed, std::string("Player is not in timed group")) == StepOutcome::AlreadyInState,
            "remove missing timed is success");
        Check(ClassifyResult(StepKind::RemoveTimed, std::string("Unexpected DB error")) == StepOutcome::Error, "remove db error");
        Check(ClassifyResult(StepKind::RemovePermanent, std::nullopt) == StepOutcome::Applied, "remove ok");
    }

    void TestJournal()
    {
        using HeartShop::DeliveryJournal;
        const auto Root = std::filesystem::temp_directory_path() /
            ("HeartShopPermissionTests-" + std::to_string(GetCurrentProcessId()));
        std::filesystem::remove_all(Root);
        const std::string Payload = Grant().dump();
        {
            DeliveryJournal Journal(Root / "delivery-journal.json");
            Check(Journal.Load(), "journal loads");

            bool ReRun = true;
            Check(BeginJournal(Journal, GrantDeliveryType, "job-1", Payload, &ReRun) == JournalDecision::Execute && !ReRun,
                "first claim executes");
            Check(Journal.Complete(GrantDeliveryType, "job-1"), "complete");
            Check(BeginJournal(Journal, GrantDeliveryType, "job-1", Payload, &ReRun) == JournalDecision::AcknowledgeOnly,
                "re-claim after completion only acknowledges (never applies twice)");
            Check(BeginJournal(Journal, GrantDeliveryType, "job-1", Revoke().dump()) == JournalDecision::FailPayloadMismatch,
                "changed payload is rejected");

            // Crash while mutating: the convergent job is reset and re-run.
            Check(BeginJournal(Journal, GrantDeliveryType, "job-2", Payload) == JournalDecision::Execute, "job-2 executes");
        }
        {
            DeliveryJournal Restarted(Root / "delivery-journal.json");
            Check(Restarted.Load(), "journal reloads");
            bool ReRun = false;
            Check(BeginJournal(Restarted, GrantDeliveryType, "job-2", Payload, &ReRun) == JournalDecision::Execute && ReRun,
                "unfinished record after restart is re-run");
            Check(Restarted.Complete(GrantDeliveryType, "job-2"), "job-2 completes");
            Check(BeginJournal(Restarted, GrantDeliveryType, "job-1", Payload) == JournalDecision::AcknowledgeOnly,
                "completion survives restart");
            // Delivery ids are scoped by type: a revoke with the same id is independent.
            Check(BeginJournal(Restarted, RevokeDeliveryType, "job-1", Revoke().dump()) == JournalDecision::Execute,
                "type-scoped keys");
        }
        std::filesystem::remove_all(Root);
    }

    void TestVipStatus()
    {
        const long long Now = Expiry - (3 * 86400 + 5 * 3600);

        auto Nested = nlohmann::json{
            {"steamId", Steam},
            {"linked", true},
            {"vip", {
                {"active", true},
                {"label", "VIP"},
                {"packageName", "VIP 30 days"},
                {"permissionGroup", "VIP"},
                {"tierRank", 1},
                {"frameStyle", "vip-gold"},
                {"expiresAt", "2026-11-22T10:00:00.000Z"},
            }},
        };
        auto S = ParseVipStatus(Nested);
        Check(S.Linked && S.Active && S.Label == "VIP" && S.Group == "VIP" && S.TierRank == 1, "nested status");
        Check(!S.Permanent && S.ExpiresAtUnix == Expiry, "nested expiry");
        auto Lines = FormatVipStatus(S, Now, true);
        Check(Lines.size() == 2, "two lines with in-game state");
        Check(Lines[0].find("2026-11-22 10:00 UTC") != std::string::npos && Lines[0].find("3d 5h left") != std::string::npos,
            "expiry line");
        Check(Lines[1].find("active on this server") != std::string::npos, "in-game active");
        Check(FormatVipStatus(S, Now, false)[1].find("syncing") != std::string::npos, "in-game syncing");
        Check(FormatVipStatus(S, Now, std::nullopt).size() == 1, "no in-game line without bridge");

        auto None = ParseVipStatus(nlohmann::json{{"linked", true}, {"vip", nullptr}});
        Check(!None.Active, "vip null");
        Check(FormatVipStatus(None, Now, std::nullopt)[0].find("not a VIP") != std::string::npos, "not VIP line");

        auto Unlinked = ParseVipStatus(nlohmann::json{{"linked", false}, {"vip", nullptr}});
        Check(FormatVipStatus(Unlinked, Now, std::nullopt)[0].find("not linked") != std::string::npos, "unlinked line");

        auto Flat = ParseVipStatus(nlohmann::json{{"active", true}, {"label", "VIP"}, {"expiresAt", nullptr}});
        Check(Flat.Active && Flat.Permanent, "flat permanent");
        Check(FormatVipStatus(Flat, Now, std::nullopt)[0].find("permanent") != std::string::npos, "permanent line");

        auto ByStatus = ParseVipStatus(nlohmann::json{{"vip", {{"status", "expired"}, {"label", "VIP"}}}});
        Check(!ByStatus.Active, "status expired");
        auto FlatStatus = ParseVipStatus(nlohmann::json{{"status", "active"}, {"expiresAt", "2026-11-22T10:00:00Z"}});
        Check(FlatStatus.Active && !FlatStatus.Permanent, "flat status active");
        auto Bool = ParseVipStatus(nlohmann::json{{"vip", true}});
        Check(Bool.Active, "vip:true");
        Check(!ParseVipStatus(nlohmann::json::array()).Active, "garbage response");

        // Same shape as the web GET /api/vip/me (vip.service getMyVip).
        auto Me = nlohmann::json{
            {"vip", {{"tierRank", 1}, {"frameStyle", "vip-gold"}, {"label", "VIP"}}},
            {"isVip", true},
            {"active", {
                {"id", "m1"},
                {"package", {{"name", "VIP 30 days"}, {"tierRank", 1}, {"badgeLabel", "VIP"}, {"permissionGroup", "VIP"}}},
                {"permissionGroup", "VIP"},
                {"expiresAt", "2026-11-01T00:00:00.000Z"},
                {"status", "active"},
                {"state", "active"},
            }},
            {"groups", nlohmann::json::array({{{"group", "VIP"}, {"expiresAt", "2026-11-22T10:00:00.000Z"}}})},
            {"steamLinked", true},
        };
        auto MeStatus = ParseVipStatus(Me);
        Check(MeStatus.Active && MeStatus.Linked, "me shape active");
        Check(MeStatus.PackageName == "VIP 30 days" && MeStatus.Group == "VIP" && MeStatus.Label == "VIP", "me shape fields");
        Check(MeStatus.TierRank == 1, "me shape tier");
        Check(MeStatus.ExpiresAtUnix == Expiry && !MeStatus.Permanent, "me shape uses the stacked group hold");
        auto MeNone = ParseVipStatus(nlohmann::json{{"vip", nullptr}, {"isVip", false}, {"active", nullptr},
            {"groups", nlohmann::json::array()}, {"steamLinked", false}});
        Check(!MeNone.Active && !MeNone.Linked, "me shape none / unlinked");
        auto MePermanent = Me;
        MePermanent["groups"] = nlohmann::json::array({{{"group", "VIP"}, {"expiresAt", nullptr}}});
        Check(ParseVipStatus(MePermanent).Permanent, "me shape permanent hold");
    }
}

void TestChatRanks()
{
    const nlohmann::json Config = {
        {"success", true},
        {"ranks", nlohmann::json::array({
            {{"groupKey", "Supporter"}, {"name", "Fan"}, {"priority", 10}},
            {{"groupKey", "VIP"}, {"name", "VIP"}, {"priority", 50}},
            {{"groupKey", ""}, {"name", "x"}, {"priority", 99}},
            {{"groupKey", "Bad"}, {"name", "[]"}, {"priority", 99}},
            {{"name", "NoGroup"}},
            "garbage",
        })},
    };
    const auto Ranks = ParseChatRanks(Config);
    Check(Ranks.size() == 2, "ranks: invalid entries skipped");
    Check(!Ranks.empty() && Ranks[0].GroupKey == "VIP", "ranks: highest priority first");
    Check(ParseChatRanks(nlohmann::json::object()).empty(), "ranks: missing array -> none");

    Check(PickChatRankName(Ranks, {"Default", "vip"}) == "VIP", "rank: group match is case-insensitive");
    Check(PickChatRankName(Ranks, {"Supporter", "VIP"}) == "VIP", "rank: highest priority wins");
    Check(PickChatRankName(Ranks, {"Supporter"}) == "Fan", "rank: lower rank when only that group");
    Check(PickChatRankName(Ranks, {"Default"}).empty(), "rank: no mapped group -> none");
    Check(PickChatRankName({}, {"VIP"}).empty(), "rank: no ranks -> none");

    Check(SanitizeRankTag("  [VIP]\n ") == "VIP", "tag: brackets/control/space stripped");
    Check(SanitizeRankTag(std::string(40, 'A')).size() == 24, "tag: capped at 24 bytes");
    // 9 x 3-byte Thai characters = 27 bytes: cut to 8 whole characters (24 bytes)
    std::string Thai;
    for (int i = 0; i < 9; ++i) Thai += "\xE0\xB8\x81";
    Check(SanitizeRankTag(Thai).size() == 24, "tag: UTF-8 cut on a character boundary");

    Check(FormatRankedSender("VIP", "Krit") == "[VIP] Krit", "sender: tagged");
    Check(FormatRankedSender("", "Krit") == "Krit", "sender: untagged");
    Check(FormatCrossChatLine("web", "VIP", "Krit", "hi") == "[Web] [VIP] Krit: hi", "line: web VIP");
    Check(FormatCrossChatLine("discord", "", "Aom", "yo") == "[Discord] Aom: yo", "line: discord");
}

int main()
{
    TestTypes();
    TestIso8601();
    TestSteamAndGroup();
    TestParseGrant();
    TestParseRejects();
    TestParseRevoke();
    TestPlan();
    TestClassify();
    TestJournal();
    TestVipStatus();
    TestChatRanks();

    if (Failures != 0)
    {
        std::fprintf(stderr, "%d check(s) failed\n", Failures);
        return 1;
    }
    std::printf("PermissionSyncTests passed\n");
    return 0;
}
