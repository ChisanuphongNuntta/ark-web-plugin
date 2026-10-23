#pragma once

// Game-side bridge to the ArkApi "Permissions" plugin (V2, cluster MySQL).
//
// The Permissions plugin is optional: its exports are resolved at runtime with
// GetModuleHandle/GetProcAddress (never linked), re-resolved on every use so a
// Permissions reload or unload can never leave a dangling function pointer.
// Every call runs under an SEH guard: a native fault (e.g. Permissions loaded
// without a database) disables the bridge for that module instance, withdraws
// the `permissions.group.v1` capability and never crashes the server.
//
// All functions must be called on the game thread.

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "PermissionSync.h"

namespace HeartShop::PermissionsBridge
{
    // Re-resolves the Permissions exports and publishes the result to
    // PermissionSync::SetBridgeAvailable (read by the heartbeat). Returns the
    // new availability.
    bool Refresh();

    // True when the loaded Permissions exports the timed-group functions.
    bool TimedSupported();

    struct ExecResult
    {
        enum class Kind
        {
            Success,     // applied or already in the requested state
            Error,       // Permissions refused (DB error, group missing, ...): fail the job
            Unavailable, // Permissions not loaded / API missing: release the lease
            Faulted      // native fault: bridge disabled, release the lease
        };
        Kind Status = Kind::Unavailable;
        std::string Message;
    };

    ExecResult Execute(const PermissionSync::Request& Request, long long NowUnix);

    // Permissions::GetPlayerGroups (empty when unavailable). Used by cross-chat.
    std::vector<std::string> GetPlayerGroups(std::uint64_t SteamId);

    // Permissions::IsPlayerInGroup; nullopt when the bridge is unavailable.
    std::optional<bool> IsPlayerInGroup(std::uint64_t SteamId, const std::string& Group);
}
