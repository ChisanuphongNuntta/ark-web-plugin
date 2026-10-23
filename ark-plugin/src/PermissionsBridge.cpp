#include "PermissionsBridge.h"

#include <API/ARK/Ark.h>
#include <Logger/Logger.h>
#include <Windows.h>

namespace HeartShop::PermissionsBridge
{
    namespace
    {
        // Exact MSVC-decorated export names of the ArkApi Permissions plugin
        // (deps/Permissions/ArkPermissions.h), taken from
        // ASE-Plugins-master/Permissions/out_lib/Permissions.lib (dumpbin /exports).
        constexpr const char* AddPlayerToGroupSymbol =
            "?AddPlayerToGroup@Permissions@@YA?AV?$optional@V?$basic_string@DU?$char_traits@D@std@@V?$allocator@D@2@@std@@@std@@_KAEBVFString@@@Z";
        constexpr const char* RemovePlayerFromGroupSymbol =
            "?RemovePlayerFromGroup@Permissions@@YA?AV?$optional@V?$basic_string@DU?$char_traits@D@std@@V?$allocator@D@2@@std@@@std@@_KAEBVFString@@@Z";
        constexpr const char* AddPlayerToTimedGroupSymbol =
            "?AddPlayerToTimedGroup@Permissions@@YA?AV?$optional@V?$basic_string@DU?$char_traits@D@std@@V?$allocator@D@2@@std@@@std@@_KAEBVFString@@HH@Z";
        constexpr const char* RemovePlayerFromTimedGroupSymbol =
            "?RemovePlayerFromTimedGroup@Permissions@@YA?AV?$optional@V?$basic_string@DU?$char_traits@D@std@@V?$allocator@D@2@@std@@@std@@_KAEBVFString@@@Z";
        constexpr const char* IsPlayerInGroupSymbol =
            "?IsPlayerInGroup@Permissions@@YA_N_KAEBVFString@@@Z";
        constexpr const char* GetPlayerGroupsSymbol =
            "?GetPlayerGroups@Permissions@@YA?AV?$TArray@VFString@@VFDefaultAllocator@@@@_K@Z";

        using OptionalMessage = std::optional<std::string>;
        using GroupFn = OptionalMessage (*)(uint64, const FString&);
        using TimedGroupFn = OptionalMessage (*)(uint64, const FString&, int, int);
        using IsInGroupFn = bool (*)(uint64, const FString&);
        using GetGroupsFn = TArray<FString> (*)(uint64);

        struct Api
        {
            HMODULE Module = nullptr;
            GroupFn AddPlayerToGroup = nullptr;
            GroupFn RemovePlayerFromGroup = nullptr;
            TimedGroupFn AddPlayerToTimedGroup = nullptr;
            GroupFn RemovePlayerFromTimedGroup = nullptr;
            IsInGroupFn IsPlayerInGroup = nullptr;
            GetGroupsFn GetPlayerGroups = nullptr;

            bool Usable() const
            {
                return Module && AddPlayerToGroup && RemovePlayerFromGroup && IsPlayerInGroup;
            }
            bool Timed() const
            {
                return AddPlayerToTimedGroup && RemovePlayerFromTimedGroup;
            }
        };

        // Module instance on which a native fault was seen; the bridge stays off
        // for it until Permissions is reloaded (new module handle).
        HMODULE FaultedModule = nullptr;
        bool LastReportedAvailable = false;
        bool ReportedOnce = false;

        Api Resolve()
        {
            Api Result;
            HMODULE Module = GetModuleHandleW(L"Permissions.dll");
            if (!Module) Module = GetModuleHandleW(L"ArkPermissions.dll");
            if (!Module) return Result;

            Result.Module = Module;
            Result.AddPlayerToGroup = reinterpret_cast<GroupFn>(GetProcAddress(Module, AddPlayerToGroupSymbol));
            Result.RemovePlayerFromGroup = reinterpret_cast<GroupFn>(GetProcAddress(Module, RemovePlayerFromGroupSymbol));
            Result.AddPlayerToTimedGroup = reinterpret_cast<TimedGroupFn>(GetProcAddress(Module, AddPlayerToTimedGroupSymbol));
            Result.RemovePlayerFromTimedGroup = reinterpret_cast<GroupFn>(GetProcAddress(Module, RemovePlayerFromTimedGroupSymbol));
            Result.IsPlayerInGroup = reinterpret_cast<IsInGroupFn>(GetProcAddress(Module, IsPlayerInGroupSymbol));
            Result.GetPlayerGroups = reinterpret_cast<GetGroupsFn>(GetProcAddress(Module, GetPlayerGroupsSymbol));
            return Result;
        }

        bool IsHealthy(const Api& Resolved)
        {
            return Resolved.Usable() && Resolved.Module != FaultedModule;
        }

        // ---- SEH guard --------------------------------------------------------
        // The frame holding __try must not contain C++ objects with destructors,
        // so the actual call lives in a thunk reached through a function pointer.
        using Thunk = bool (*)(void* Context);

        bool CallWithSehGuard(const Thunk Fn, void* Context, unsigned long* FaultCode)
        {
            __try
            {
                return Fn(Context);
            }
            __except (EXCEPTION_EXECUTE_HANDLER)
            {
                *FaultCode = GetExceptionCode();
                return false;
            }
        }

        struct StepContext
        {
            const Api* Resolved;
            PermissionSync::StepKind Kind;
            uint64 SteamId;
            const FString* Group;
            int Seconds;
            OptionalMessage* Out;
        };

        bool StepThunk(void* Raw)
        {
            auto* Ctx = static_cast<StepContext*>(Raw);
            try
            {
                switch (Ctx->Kind)
                {
                    case PermissionSync::StepKind::AddPermanent:
                        *Ctx->Out = Ctx->Resolved->AddPlayerToGroup(Ctx->SteamId, *Ctx->Group);
                        return true;
                    case PermissionSync::StepKind::RemovePermanent:
                        *Ctx->Out = Ctx->Resolved->RemovePlayerFromGroup(Ctx->SteamId, *Ctx->Group);
                        return true;
                    case PermissionSync::StepKind::AddTimed:
                        *Ctx->Out = Ctx->Resolved->AddPlayerToTimedGroup(Ctx->SteamId, *Ctx->Group, Ctx->Seconds, 0);
                        return true;
                    case PermissionSync::StepKind::RemoveTimed:
                        *Ctx->Out = Ctx->Resolved->RemovePlayerFromTimedGroup(Ctx->SteamId, *Ctx->Group);
                        return true;
                }
            }
            catch (const std::exception& e)
            {
                *Ctx->Out = std::string("exception: ") + e.what();
                return true;
            }
            catch (...)
            {
                *Ctx->Out = std::string("unknown exception");
                return true;
            }
            return false;
        }

        struct IsInGroupContext
        {
            const Api* Resolved;
            uint64 SteamId;
            const FString* Group;
            bool Out;
        };

        bool IsInGroupThunk(void* Raw)
        {
            auto* Ctx = static_cast<IsInGroupContext*>(Raw);
            try
            {
                Ctx->Out = Ctx->Resolved->IsPlayerInGroup(Ctx->SteamId, *Ctx->Group);
                return true;
            }
            catch (...)
            {
                return false;
            }
        }

        struct GetGroupsContext
        {
            const Api* Resolved;
            uint64 SteamId;
            std::vector<std::string>* Out;
        };

        bool GetGroupsThunk(void* Raw)
        {
            auto* Ctx = static_cast<GetGroupsContext*>(Raw);
            try
            {
                TArray<FString> Groups = Ctx->Resolved->GetPlayerGroups(Ctx->SteamId);
                for (int i = 0; i < Groups.Num(); i++)
                {
                    Ctx->Out->push_back(Groups[i].ToString());
                }
                return true;
            }
            catch (...)
            {
                return false;
            }
        }

        void MarkFaulted(const Api& Resolved, const char* What, unsigned long Code)
        {
            FaultedModule = Resolved.Module;
            PermissionSync::SetBridgeAvailable(false);
            LastReportedAvailable = false;
            Log::GetLog()->critical(
                "Native fault 0x{:08X} in Permissions::{} was contained; Permissions bridge disabled "
                "and {} withdrawn until the Permissions plugin is reloaded",
                Code, What, PermissionSync::Capability);
        }

        FString ToFString(const std::string& Text)
        {
            return FString(ArkApi::Tools::Utf8Decode(Text).c_str());
        }
    }

    bool Refresh()
    {
        const Api Resolved = Resolve();
        const bool Available = IsHealthy(Resolved);
        PermissionSync::SetBridgeAvailable(Available);

        if (!ReportedOnce || Available != LastReportedAvailable)
        {
            ReportedOnce = true;
            LastReportedAvailable = Available;
            if (Available)
            {
                Log::GetLog()->info(
                    "Permissions plugin linked (timed groups: {}); advertising {}",
                    Resolved.Timed() ? "yes" : "no",
                    PermissionSync::Capability);
            }
            else if (!Resolved.Module)
            {
                Log::GetLog()->info(
                    "Permissions plugin not loaded; {} not advertised (VIP group sync runs on other servers)",
                    PermissionSync::Capability);
            }
            else if (Resolved.Module == FaultedModule)
            {
                Log::GetLog()->warn("Permissions bridge disabled after a native fault; {} not advertised",
                    PermissionSync::Capability);
            }
            else
            {
                Log::GetLog()->warn(
                    "Permissions plugin loaded but its group API could not be resolved "
                    "(add={}, remove={}, isInGroup={}); {} not advertised",
                    Resolved.AddPlayerToGroup != nullptr,
                    Resolved.RemovePlayerFromGroup != nullptr,
                    Resolved.IsPlayerInGroup != nullptr,
                    PermissionSync::Capability);
            }
        }
        return Available;
    }

    bool TimedSupported()
    {
        const Api Resolved = Resolve();
        return IsHealthy(Resolved) && Resolved.Timed();
    }

    ExecResult Execute(const PermissionSync::Request& Request, long long NowUnix)
    {
        ExecResult Result;
        const Api Resolved = Resolve();
        if (!IsHealthy(Resolved))
        {
            PermissionSync::SetBridgeAvailable(false);
            Result.Status = ExecResult::Kind::Unavailable;
            Result.Message = Resolved.Module ? "Permissions bridge disabled" : "Permissions plugin not loaded";
            return Result;
        }

        const PermissionSync::Plan Plan = PermissionSync::BuildPlan(Request, NowUnix, Resolved.Timed());
        if (!Plan.Note.empty())
        {
            Log::GetLog()->info("Permission sync {} {} for {}: {}",
                Request.Kind == PermissionSync::Action::Add ? "grant" : "revoke",
                Request.Group, Request.SteamIdText, Plan.Note);
        }
        if (Plan.NoOp)
        {
            Result.Status = ExecResult::Kind::Success;
            Result.Message = Plan.Note;
            return Result;
        }

        const FString Group = ToFString(Request.Group);
        for (const auto& Step : Plan.Steps)
        {
            OptionalMessage Outcome;
            StepContext Ctx{&Resolved, Step.Kind, static_cast<uint64>(Request.SteamId), &Group, Step.Seconds, &Outcome};
            unsigned long FaultCode = 0;
            if (!CallWithSehGuard(&StepThunk, &Ctx, &FaultCode))
            {
                MarkFaulted(Resolved, PermissionSync::StepName(Step.Kind), FaultCode);
                Result.Status = ExecResult::Kind::Faulted;
                Result.Message = std::string("native fault in ") + PermissionSync::StepName(Step.Kind);
                return Result;
            }

            const auto Class = PermissionSync::ClassifyResult(Step.Kind, Outcome);
            if (Class == PermissionSync::StepOutcome::Error)
            {
                Result.Status = ExecResult::Kind::Error;
                Result.Message = std::string(PermissionSync::StepName(Step.Kind)) + "(" + Request.Group +
                    ") failed: " + Outcome.value_or("unknown error");
                return Result;
            }
            Log::GetLog()->info("Permission sync {} {} {} -> {}",
                PermissionSync::StepName(Step.Kind),
                Request.SteamIdText,
                Request.Group,
                Class == PermissionSync::StepOutcome::Applied
                    ? (Step.Kind == PermissionSync::StepKind::AddTimed
                        ? "applied (" + std::to_string(Step.Seconds) + "s)"
                        : std::string("applied"))
                    : "already in state (" + Outcome.value_or("") + ")");
        }

        if (Plan.VerifyInGroup)
        {
            IsInGroupContext Ctx{&Resolved, static_cast<uint64>(Request.SteamId), &Group, false};
            unsigned long FaultCode = 0;
            if (!CallWithSehGuard(&IsInGroupThunk, &Ctx, &FaultCode))
            {
                if (FaultCode != 0)
                {
                    MarkFaulted(Resolved, "IsPlayerInGroup", FaultCode);
                    Result.Status = ExecResult::Kind::Faulted;
                    Result.Message = "native fault in IsPlayerInGroup";
                    return Result;
                }
                Result.Status = ExecResult::Kind::Error;
                Result.Message = "IsPlayerInGroup threw after the grant";
                return Result;
            }
            if (!Ctx.Out)
            {
                Result.Status = ExecResult::Kind::Error;
                Result.Message = "group '" + Request.Group + "' is not effective after the grant";
                return Result;
            }
        }

        Result.Status = ExecResult::Kind::Success;
        Result.Message = Plan.Note;
        return Result;
    }

    std::vector<std::string> GetPlayerGroups(std::uint64_t SteamId)
    {
        std::vector<std::string> Groups;
        const Api Resolved = Resolve();
        // Read-only: needs only GetPlayerGroups, not the full group-write API.
        if (!Resolved.Module || Resolved.Module == FaultedModule || !Resolved.GetPlayerGroups)
        {
            return Groups;
        }
        GetGroupsContext Ctx{&Resolved, static_cast<uint64>(SteamId), &Groups};
        unsigned long FaultCode = 0;
        if (!CallWithSehGuard(&GetGroupsThunk, &Ctx, &FaultCode))
        {
            if (FaultCode != 0)
            {
                MarkFaulted(Resolved, "GetPlayerGroups", FaultCode);
            }
            Groups.clear();
        }
        return Groups;
    }

    std::optional<bool> IsPlayerInGroup(std::uint64_t SteamId, const std::string& Group)
    {
        const Api Resolved = Resolve();
        if (!IsHealthy(Resolved) || !PermissionSync::IsValidGroupName(Group))
        {
            return std::nullopt;
        }
        const FString GroupName = ToFString(Group);
        IsInGroupContext Ctx{&Resolved, static_cast<uint64>(SteamId), &GroupName, false};
        unsigned long FaultCode = 0;
        if (!CallWithSehGuard(&IsInGroupThunk, &Ctx, &FaultCode))
        {
            if (FaultCode != 0)
            {
                MarkFaulted(Resolved, "IsPlayerInGroup", FaultCode);
            }
            return std::nullopt;
        }
        return Ctx.Out;
    }
}
