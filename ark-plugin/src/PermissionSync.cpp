#include "PermissionSync.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <climits>
#include <cstdio>
#include <initializer_list>

namespace HeartShop::PermissionSync
{
    namespace
    {
        std::atomic<bool> BridgeAvailable{false};

        std::string Lower(std::string Text)
        {
            std::transform(Text.begin(), Text.end(), Text.begin(), [](unsigned char C) {
                return static_cast<char>(std::tolower(C));
            });
            return Text;
        }

        bool Contains(const std::string& Haystack, const char* Needle)
        {
            return Lower(Haystack).find(Needle) != std::string::npos;
        }

        // Howard Hinnant's days_from_civil (proleptic Gregorian, UTC).
        long long DaysFromCivil(long long Y, unsigned M, unsigned D)
        {
            Y -= M <= 2 ? 1 : 0;
            const long long Era = (Y >= 0 ? Y : Y - 399) / 400;
            const unsigned Yoe = static_cast<unsigned>(Y - Era * 400);
            const unsigned Doy = (153 * (M + (M > 2 ? -3 : 9)) + 2) / 5 + D - 1;
            const unsigned Doe = Yoe * 365 + Yoe / 4 - Yoe / 100 + Doy;
            return Era * 146097 + static_cast<long long>(Doe) - 719468;
        }

        void CivilFromDays(long long Z, long long& Y, unsigned& M, unsigned& D)
        {
            Z += 719468;
            const long long Era = (Z >= 0 ? Z : Z - 146096) / 146097;
            const unsigned Doe = static_cast<unsigned>(Z - Era * 146097);
            const unsigned Yoe = (Doe - Doe / 1460 + Doe / 36524 - Doe / 146096) / 365;
            Y = static_cast<long long>(Yoe) + Era * 400;
            const unsigned Doy = Doe - (365 * Yoe + Yoe / 4 - Yoe / 100);
            const unsigned Mp = (5 * Doy + 2) / 153;
            D = Doy - (153 * Mp + 2) / 5 + 1;
            M = Mp < 10 ? Mp + 3 : Mp - 9;
            Y += M <= 2 ? 1 : 0;
        }

        bool ReadDigits(const std::string& Text, std::size_t& Pos, std::size_t Count, int& Out)
        {
            if (Pos + Count > Text.size()) return false;
            int Value = 0;
            for (std::size_t I = 0; I < Count; ++I)
            {
                const char C = Text[Pos + I];
                if (C < '0' || C > '9') return false;
                Value = Value * 10 + (C - '0');
            }
            Pos += Count;
            Out = Value;
            return true;
        }

        bool Expect(const std::string& Text, std::size_t& Pos, char C)
        {
            if (Pos >= Text.size() || Text[Pos] != C) return false;
            ++Pos;
            return true;
        }

        std::string StringField(const nlohmann::json& Object, const char* Key)
        {
            if (Object.is_object() && Object.contains(Key) && Object[Key].is_string())
            {
                return Object[Key].get<std::string>();
            }
            return "";
        }
    }

    bool IsPermissionDeliveryType(const std::string& DeliveryType)
    {
        return DeliveryType == GrantDeliveryType || DeliveryType == RevokeDeliveryType;
    }

    void SetBridgeAvailable(bool Available)
    {
        BridgeAvailable.store(Available);
    }

    bool IsBridgeAvailable()
    {
        return BridgeAvailable.load();
    }

    bool ParseSteamId64(const std::string& Text, std::uint64_t& Out)
    {
        if (Text.empty() || Text.size() > 20) return false;
        std::uint64_t Value = 0;
        for (const char C : Text)
        {
            if (C < '0' || C > '9') return false;
            const std::uint64_t Digit = static_cast<std::uint64_t>(C - '0');
            if (Value > (UINT64_MAX - Digit) / 10) return false;
            Value = Value * 10 + Digit;
        }
        if (Value == 0) return false;
        Out = Value;
        return true;
    }

    bool IsValidGroupName(const std::string& Group)
    {
        if (Group.empty() || Group.size() > 64) return false;
        for (const unsigned char C : Group)
        {
            if (!(std::isalnum(C) || C == '_' || C == '-' || C == '.' || C == '+')) return false;
        }
        return true;
    }

    bool IsProtectedGroup(const std::string& Group)
    {
        const std::string Name = Lower(Group);
        return Name == "admins" || Name == "default";
    }

    bool IsGroupAllowed(const std::string& Group, const std::vector<std::string>& AllowedGroups)
    {
        if (AllowedGroups.empty())
        {
            return true;
        }
        const std::string Wanted = Lower(Group);
        return std::any_of(AllowedGroups.begin(), AllowedGroups.end(),
            [&Wanted](const std::string& Allowed) { return Lower(Allowed) == Wanted; });
    }

    bool ParseIso8601(const std::string& Text, long long& UnixSeconds)
    {
        std::size_t Pos = 0;
        int Year = 0, Month = 0, Day = 0, Hour = 0, Minute = 0, Second = 0;
        if (!ReadDigits(Text, Pos, 4, Year) || !Expect(Text, Pos, '-') ||
            !ReadDigits(Text, Pos, 2, Month) || !Expect(Text, Pos, '-') ||
            !ReadDigits(Text, Pos, 2, Day))
        {
            return false;
        }
        if (Pos >= Text.size() || (Text[Pos] != 'T' && Text[Pos] != 't' && Text[Pos] != ' ')) return false;
        ++Pos;
        if (!ReadDigits(Text, Pos, 2, Hour) || !Expect(Text, Pos, ':') ||
            !ReadDigits(Text, Pos, 2, Minute))
        {
            return false;
        }
        if (Pos < Text.size() && Text[Pos] == ':')
        {
            ++Pos;
            if (!ReadDigits(Text, Pos, 2, Second)) return false;
            if (Pos < Text.size() && Text[Pos] == '.')
            {
                ++Pos;
                const std::size_t Start = Pos;
                while (Pos < Text.size() && Text[Pos] >= '0' && Text[Pos] <= '9') ++Pos;
                if (Pos == Start) return false;
            }
        }

        long long OffsetSeconds = 0;
        if (Pos >= Text.size()) return false; // a zone designator is required
        if (Text[Pos] == 'Z' || Text[Pos] == 'z')
        {
            ++Pos;
        }
        else if (Text[Pos] == '+' || Text[Pos] == '-')
        {
            const int Sign = Text[Pos] == '-' ? -1 : 1;
            ++Pos;
            int OffH = 0, OffM = 0;
            if (!ReadDigits(Text, Pos, 2, OffH)) return false;
            if (Pos < Text.size() && Text[Pos] == ':') ++Pos;
            if (!ReadDigits(Text, Pos, 2, OffM)) return false;
            if (OffH > 23 || OffM > 59) return false;
            OffsetSeconds = Sign * (OffH * 3600LL + OffM * 60LL);
        }
        else
        {
            return false;
        }
        if (Pos != Text.size()) return false;

        static const int DaysInMonth[] = {31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        if (Year < 1970 || Month < 1 || Month > 12 || Day < 1 || Day > DaysInMonth[Month - 1] ||
            Hour > 23 || Minute > 59 || Second > 60)
        {
            return false;
        }
        const bool Leap = (Year % 4 == 0 && Year % 100 != 0) || Year % 400 == 0;
        if (Month == 2 && Day == 29 && !Leap) return false;

        const long long Days = DaysFromCivil(Year, static_cast<unsigned>(Month), static_cast<unsigned>(Day));
        UnixSeconds = Days * 86400LL + Hour * 3600LL + Minute * 60LL + (Second == 60 ? 59 : Second) - OffsetSeconds;
        return true;
    }

    std::string FormatUtc(long long UnixSeconds)
    {
        long long Days = UnixSeconds / 86400;
        long long Rem = UnixSeconds % 86400;
        if (Rem < 0)
        {
            Rem += 86400;
            --Days;
        }
        long long Y = 0;
        unsigned M = 0, D = 0;
        CivilFromDays(Days, Y, M, D);
        char Buffer[40];
        std::snprintf(Buffer, sizeof(Buffer), "%04lld-%02u-%02u %02lld:%02lld UTC",
            Y, M, D, Rem / 3600, (Rem % 3600) / 60);
        return Buffer;
    }

    bool ParseRequest(
        const std::string& DeliveryType,
        const std::string& ClaimedSteamId,
        const nlohmann::json& Payload,
        const std::vector<std::string>& AllowedGroups,
        Request& Out,
        std::string& Error)
    {
        Request Req;
        if (DeliveryType == GrantDeliveryType)
        {
            Req.Kind = Action::Add;
        }
        else if (DeliveryType == RevokeDeliveryType)
        {
            Req.Kind = Action::Remove;
        }
        else
        {
            Error = "not a permission delivery type: " + DeliveryType;
            return false;
        }

        if (!Payload.is_object())
        {
            Error = "payload must be an object";
            return false;
        }
        if (!Payload.contains("schemaVersion") || !Payload["schemaVersion"].is_number_integer() ||
            Payload["schemaVersion"].get<long long>() != 1)
        {
            Error = "unsupported schemaVersion (expected 1)";
            return false;
        }

        if (!Payload.contains("action") || !Payload["action"].is_string())
        {
            Error = "action must be a string";
            return false;
        }
        const std::string ActionText = Payload["action"].get<std::string>();
        const char* Expected = Req.Kind == Action::Add ? "add" : "remove";
        if (ActionText != Expected)
        {
            Error = "action '" + ActionText + "' does not match delivery type " + DeliveryType;
            return false;
        }

        if (!Payload.contains("steamId") || !Payload["steamId"].is_string() ||
            !ParseSteamId64(Payload["steamId"].get<std::string>(), Req.SteamId))
        {
            Error = "steamId must be a SteamID64 decimal string";
            return false;
        }
        Req.SteamIdText = Payload["steamId"].get<std::string>();
        if (!ClaimedSteamId.empty() && ClaimedSteamId != Req.SteamIdText)
        {
            Error = "payload steamId does not match the claimed playerSteamId";
            return false;
        }

        if (!Payload.contains("group") || !Payload["group"].is_string() ||
            !IsValidGroupName(Payload["group"].get<std::string>()))
        {
            Error = "group must match [A-Za-z0-9_.+-]{1,64}";
            return false;
        }
        Req.Group = Payload["group"].get<std::string>();
        if (IsProtectedGroup(Req.Group))
        {
            Error = "group '" + Req.Group + "' is protected and never managed by HeartShop";
            return false;
        }
        if (!IsGroupAllowed(Req.Group, AllowedGroups))
        {
            Error = "group '" + Req.Group + "' is not in this server's Permissions.AllowedGroups";
            return false;
        }

        if (Payload.contains("expiresAt") && !Payload["expiresAt"].is_null())
        {
            if (Req.Kind != Action::Add)
            {
                // Harmless on a revoke; ignored rather than rejected.
            }
            else if (!Payload["expiresAt"].is_string() ||
                !ParseIso8601(Payload["expiresAt"].get<std::string>(), Req.ExpiresAtUnix))
            {
                Error = "expiresAt must be an ISO-8601 timestamp or null";
                return false;
            }
            else
            {
                Req.HasExpiry = true;
            }
        }

        if (Payload.contains("scope") && !Payload["scope"].is_null())
        {
            if (!Payload["scope"].is_string())
            {
                Error = "scope must be a string";
                return false;
            }
            const std::string Scope = Payload["scope"].get<std::string>();
            if (Scope == "all") Req.Scope = RevokeScope::All;
            else if (Scope == "timed") Req.Scope = RevokeScope::Timed;
            else if (Scope == "permanent") Req.Scope = RevokeScope::Permanent;
            else
            {
                Error = "scope must be all|timed|permanent";
                return false;
            }
        }

        Out = Req;
        return true;
    }

    const char* StepName(StepKind Kind)
    {
        switch (Kind)
        {
            case StepKind::AddPermanent: return "AddPlayerToGroup";
            case StepKind::AddTimed: return "AddPlayerToTimedGroup";
            case StepKind::RemovePermanent: return "RemovePlayerFromGroup";
            case StepKind::RemoveTimed: return "RemovePlayerFromTimedGroup";
        }
        return "?";
    }

    Plan BuildPlan(const Request& Req, long long NowUnix, bool TimedSupported)
    {
        Plan Result;
        if (Req.Kind == Action::Add)
        {
            if (Req.HasExpiry)
            {
                const long long Remaining = Req.ExpiresAtUnix - NowUnix;
                if (Remaining <= 0)
                {
                    Result.NoOp = true;
                    Result.Note = "grant already expired at " + FormatUtc(Req.ExpiresAtUnix) + "; nothing applied";
                    return Result;
                }
                if (TimedSupported)
                {
                    const int Seconds = Remaining > INT_MAX ? INT_MAX : static_cast<int>(Remaining);
                    // The web owns the end date: a permanent membership left over from an
                    // earlier permanent grant would otherwise outlive it ("already
                    // permanently in this group" makes AddTimed a silent no-op).
                    Result.Steps.push_back({StepKind::RemovePermanent, 0});
                    Result.Steps.push_back({StepKind::RemoveTimed, 0});
                    Result.Steps.push_back({StepKind::AddTimed, Seconds});
                    Result.VerifyInGroup = true;
                    return Result;
                }
                Result.Note = "timed groups unsupported by the loaded Permissions plugin; "
                    "added permanently, the backend revoke job removes it at expiry";
            }
            Result.Steps.push_back({StepKind::AddPermanent, 0});
            Result.VerifyInGroup = true;
            return Result;
        }

        if (TimedSupported && Req.Scope != RevokeScope::Permanent)
        {
            Result.Steps.push_back({StepKind::RemoveTimed, 0});
        }
        if (Req.Scope != RevokeScope::Timed)
        {
            Result.Steps.push_back({StepKind::RemovePermanent, 0});
        }
        if (Result.Steps.empty())
        {
            Result.NoOp = true;
            Result.Note = "timed-only revoke but timed groups are unsupported; nothing to remove";
        }
        return Result;
    }

    StepOutcome ClassifyResult(StepKind Kind, const std::optional<std::string>& Result)
    {
        if (!Result.has_value())
        {
            return StepOutcome::Applied;
        }
        const std::string& Message = *Result;
        switch (Kind)
        {
            case StepKind::AddPermanent:
                // "Player was already added"
                return Contains(Message, "already") ? StepOutcome::AlreadyInState : StepOutcome::Error;
            case StepKind::AddTimed:
                // "Player is already permanently in this group."
                return Contains(Message, "already") ? StepOutcome::AlreadyInState : StepOutcome::Error;
            case StepKind::RemovePermanent:
            case StepKind::RemoveTimed:
                // "Player is not in group" / "Player is not in timed group" /
                // "Player or group does not exist"
                if (Contains(Message, "not in") || Contains(Message, "does not exist"))
                {
                    return StepOutcome::AlreadyInState;
                }
                return StepOutcome::Error;
        }
        return StepOutcome::Error;
    }

    JournalDecision BeginJournal(
        DeliveryJournal& Journal,
        const std::string& DeliveryType,
        const std::string& DeliveryId,
        const std::string& Payload,
        bool* ReRun)
    {
        if (ReRun) *ReRun = false;
        auto Begin = Journal.Begin(DeliveryType, DeliveryId, Payload);
        if (Begin == DeliveryJournal::BeginResult::UncertainPrepared)
        {
            if (!Journal.Abort(DeliveryType, DeliveryId))
            {
                return JournalDecision::Release;
            }
            if (ReRun) *ReRun = true;
            Begin = Journal.Begin(DeliveryType, DeliveryId, Payload);
        }

        switch (Begin)
        {
            case DeliveryJournal::BeginResult::Started:
                break;
            case DeliveryJournal::BeginResult::AlreadyCompleted:
                return JournalDecision::AcknowledgeOnly;
            case DeliveryJournal::BeginResult::PayloadMismatch:
                return JournalDecision::FailPayloadMismatch;
            case DeliveryJournal::BeginResult::UncertainPrepared:
            case DeliveryJournal::BeginResult::PersistenceError:
            default:
                return JournalDecision::Release;
        }

        if (!Journal.MarkMutating(DeliveryType, DeliveryId))
        {
            Journal.Abort(DeliveryType, DeliveryId);
            return JournalDecision::Release;
        }
        return JournalDecision::Execute;
    }

    namespace
    {
        // First string found under any of Keys in Object, else under PackageKeys
        // in Object.package.
        std::string FirstString(const nlohmann::json& Object, std::initializer_list<const char*> Keys,
            std::initializer_list<const char*> PackageKeys = {})
        {
            for (const char* Key : Keys)
            {
                const std::string Value = StringField(Object, Key);
                if (!Value.empty()) return Value;
            }
            if (Object.is_object() && Object.contains("package") && Object["package"].is_object())
            {
                for (const char* Key : PackageKeys)
                {
                    const std::string Value = StringField(Object["package"], Key);
                    if (!Value.empty()) return Value;
                }
            }
            return "";
        }

        std::optional<bool> BoolField(const nlohmann::json& Object, const char* Key)
        {
            if (Object.is_object() && Object.contains(Key) && Object[Key].is_boolean())
            {
                return Object[Key].get<bool>();
            }
            return std::nullopt;
        }

        int TierRankOf(const nlohmann::json& Object)
        {
            if (Object.contains("tierRank") && Object["tierRank"].is_number_integer())
            {
                return Object["tierRank"].get<int>();
            }
            if (Object.contains("package") && Object["package"].is_object() &&
                Object["package"].contains("tierRank") && Object["package"]["tierRank"].is_number_integer())
            {
                return Object["package"]["tierRank"].get<int>();
            }
            return 0;
        }
    }

    // Accepts the shapes the backend may return for GET /player/{steamId}/vip:
    //   * the web GET /api/vip/me shape: { isVip, vip: <badge>|null,
    //     active: <membership>|null, groups: [{ group, expiresAt|null }], steamLinked };
    //   * nested { linked, vip: { active, label, permissionGroup, expiresAt, ... } | null };
    //   * flat { active|status, label, expiresAt, ... }.
    VipStatus ParseVipStatus(const nlohmann::json& Response)
    {
        VipStatus Status;
        if (!Response.is_object())
        {
            return Status;
        }
        if (auto Linked = BoolField(Response, "linked")) Status.Linked = *Linked;
        else if (auto SteamLinked = BoolField(Response, "steamLinked")) Status.Linked = *SteamLinked;

        // Detail objects, most specific first; the response itself last.
        std::vector<const nlohmann::json*> Sources;
        for (const char* Key : {"active", "membership", "vip"})
        {
            if (Response.contains(Key) && Response[Key].is_object()) Sources.push_back(&Response[Key]);
        }
        const bool HasDetailObject = !Sources.empty();
        Sources.push_back(&Response);

        // Activity.
        if (auto IsVip = BoolField(Response, "isVip")) Status.Active = *IsVip;
        else if (auto Active = BoolField(Response, "active")) Status.Active = *Active;
        else if (auto Vip = BoolField(Response, "vip")) Status.Active = *Vip;
        else if (HasDetailObject)
        {
            const auto& Detail = *Sources.front();
            Status.Active = true;
            if (auto Inner = BoolField(Detail, "active")) Status.Active = *Inner;
            else if (auto InnerVip = BoolField(Detail, "isVip")) Status.Active = *InnerVip;
            const std::string State = FirstString(Detail, {"state", "status"});
            if (!State.empty()) Status.Active = Status.Active && State == "active";
        }
        else if (Response.contains("vip") && Response["vip"].is_null())
        {
            Status.Active = false;
        }
        else
        {
            Status.Active = StringField(Response, "status") == "active";
        }

        for (const auto* Source : Sources)
        {
            if (Status.Label.empty()) Status.Label = FirstString(*Source, {"label", "badgeLabel"}, {"badgeLabel"});
            if (Status.PackageName.empty()) Status.PackageName = FirstString(*Source, {"packageName"}, {"name"});
            if (Status.Group.empty()) Status.Group = FirstString(*Source, {"permissionGroup", "group"}, {"permissionGroup"});
            if (Status.TierRank == 0) Status.TierRank = TierRankOf(*Source);
        }

        // Expiry: the effective group hold (covers stacked memberships) wins over a
        // single membership's own expiry.
        bool ExpiryKnown = false;
        if (Response.contains("groups") && Response["groups"].is_array())
        {
            const nlohmann::json* Match = nullptr;
            for (const auto& Entry : Response["groups"])
            {
                if (!Entry.is_object()) continue;
                if (!Match) Match = &Entry;
                if (!Status.Group.empty() && StringField(Entry, "group") == Status.Group)
                {
                    Match = &Entry;
                    break;
                }
            }
            if (Match && Match->contains("expiresAt"))
            {
                ExpiryKnown = true;
                Status.ExpiresAt = StringField(*Match, "expiresAt");
                if (Status.Group.empty()) Status.Group = StringField(*Match, "group");
            }
        }
        if (!ExpiryKnown)
        {
            for (const auto* Source : Sources)
            {
                if (Source->contains("expiresAt"))
                {
                    Status.ExpiresAt = StringField(*Source, "expiresAt");
                    break;
                }
            }
        }
        if (!Status.ExpiresAt.empty())
        {
            long long Unix = 0;
            if (ParseIso8601(Status.ExpiresAt, Unix)) Status.ExpiresAtUnix = Unix;
        }
        Status.Permanent = Status.Active && Status.ExpiresAt.empty();
        return Status;
    }

    std::vector<std::string> FormatVipStatus(
        const VipStatus& Status,
        long long NowUnix,
        std::optional<bool> InGameGroup)
    {
        std::vector<std::string> Lines;
        if (!Status.Linked)
        {
            Lines.push_back("[VIP] Your Steam account is not linked to an IRIS web account yet.");
            return Lines;
        }
        if (!Status.Active)
        {
            Lines.push_back("[VIP] You are not a VIP. VIP can be purchased on the IRIS website.");
            return Lines;
        }

        std::string Name = !Status.Label.empty() ? Status.Label
            : (!Status.PackageName.empty() ? Status.PackageName : std::string("VIP"));
        std::string Line = "[VIP] Active: " + Name;
        if (Status.Permanent)
        {
            Line += " (permanent)";
        }
        else if (Status.ExpiresAtUnix > 0)
        {
            const long long Remaining = Status.ExpiresAtUnix - NowUnix;
            Line += " - expires " + FormatUtc(Status.ExpiresAtUnix);
            if (Remaining > 0)
            {
                const long long DaysLeft = Remaining / 86400;
                const long long HoursLeft = (Remaining % 86400) / 3600;
                Line += " (" + std::to_string(DaysLeft) + "d " + std::to_string(HoursLeft) + "h left)";
            }
        }
        Lines.push_back(Line);

        if (InGameGroup.has_value())
        {
            const std::string Group = Status.Group.empty() ? std::string("VIP") : Status.Group;
            Lines.push_back(*InGameGroup
                ? "[VIP] In-game group '" + Group + "' is active on this server."
                : "[VIP] In-game group '" + Group + "' is syncing - it can take up to a few minutes.");
        }
        return Lines;
    }
    std::string SanitizeRankTag(const std::string& Tag)
    {
        std::string Clean;
        Clean.reserve(Tag.size());
        for (unsigned char C : Tag)
        {
            if (C < 0x20 || C == 0x7F || C == '[' || C == ']')
            {
                continue;
            }
            Clean.push_back(static_cast<char>(C));
        }
        const auto First = Clean.find_first_not_of(' ');
        if (First == std::string::npos)
        {
            return {};
        }
        Clean = Clean.substr(First, Clean.find_last_not_of(' ') - First + 1);
        constexpr std::size_t MaxBytes = 24;
        if (Clean.size() > MaxBytes)
        {
            std::size_t Cut = MaxBytes;
            // Never split a UTF-8 sequence: back up over continuation bytes.
            while (Cut > 0 && (static_cast<unsigned char>(Clean[Cut]) & 0xC0) == 0x80)
            {
                --Cut;
            }
            Clean.resize(Cut);
            const auto Last = Clean.find_last_not_of(' ');
            Clean = Last == std::string::npos ? std::string() : Clean.substr(0, Last + 1);
        }
        return Clean;
    }

    std::vector<ChatRank> ParseChatRanks(const nlohmann::json& Response)
    {
        std::vector<ChatRank> Ranks;
        if (!Response.is_object() || !Response.contains("ranks") || !Response["ranks"].is_array())
        {
            return Ranks;
        }
        for (const auto& Item : Response["ranks"])
        {
            if (!Item.is_object())
            {
                continue;
            }
            const auto GroupIt = Item.find("groupKey");
            const auto NameIt = Item.find("name");
            if (GroupIt == Item.end() || !GroupIt->is_string() || NameIt == Item.end() || !NameIt->is_string())
            {
                continue;
            }
            ChatRank Rank;
            Rank.GroupKey = GroupIt->get<std::string>();
            Rank.Name = SanitizeRankTag(NameIt->get<std::string>());
            const auto PriorityIt = Item.find("priority");
            if (PriorityIt != Item.end() && PriorityIt->is_number_integer())
            {
                Rank.Priority = PriorityIt->get<int>();
            }
            if (Rank.GroupKey.empty() || Rank.Name.empty())
            {
                continue;
            }
            Ranks.push_back(std::move(Rank));
        }
        std::stable_sort(Ranks.begin(), Ranks.end(), [](const ChatRank& A, const ChatRank& B) {
            return A.Priority > B.Priority;
        });
        return Ranks;
    }

    std::string PickChatRankName(const std::vector<ChatRank>& Ranks, const std::vector<std::string>& PlayerGroups)
    {
        if (Ranks.empty() || PlayerGroups.empty())
        {
            return {};
        }
        std::vector<std::string> Held;
        Held.reserve(PlayerGroups.size());
        for (const auto& Group : PlayerGroups)
        {
            Held.push_back(Lower(Group));
        }
        for (const auto& Rank : Ranks)
        {
            if (std::find(Held.begin(), Held.end(), Lower(Rank.GroupKey)) != Held.end())
            {
                return Rank.Name;
            }
        }
        return {};
    }

    std::string FormatRankedSender(const std::string& RankTag, const std::string& SenderName)
    {
        const std::string Tag = SanitizeRankTag(RankTag);
        return Tag.empty() ? SenderName : "[" + Tag + "] " + SenderName;
    }

    std::string FormatCrossChatLine(
        const std::string& Source,
        const std::string& RankTag,
        const std::string& SenderName,
        const std::string& Content)
    {
        const std::string SourceTag = Source == "web" ? "[Web]"
            : Source == "discord" ? "[Discord]"
            : "[" + SanitizeRankTag(Source) + "]";
        return SourceTag + " " + FormatRankedSender(RankTag, SenderName) + ": " + Content;
    }
}
