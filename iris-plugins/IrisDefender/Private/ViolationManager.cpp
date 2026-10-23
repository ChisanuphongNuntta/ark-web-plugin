#include "ViolationManager.h"
#include "Config.h"
#include "Logger.h"
#include "Webhook.h"

std::string ViolationTypeToString(EViolationType type)
{
    switch (type)
    {
    case EViolationType::Speedhack: return "Speedhack";
    case EViolationType::Teleport: return "Teleport";
    case EViolationType::RapidFire: return "RapidFire";
    case EViolationType::MeleeReach: return "MeleeReach";
    case EViolationType::Flyhack: return "Flyhack";
    case EViolationType::Undermesh: return "Undermesh";
    case EViolationType::BuildingExploit: return "BuildingExploit";
    default: return "Unknown";
    }
}

int ViolationManager::GetViolationWeight(EViolationType type) const
{
    const auto vmConfig = Config::Get().GetViolationManager();
    switch (type)
    {
    case EViolationType::Speedhack: return vmConfig.PointsSpeedhack;
    case EViolationType::Teleport: return vmConfig.PointsTeleport;
    case EViolationType::RapidFire: return vmConfig.PointsRapidFire;
    case EViolationType::MeleeReach: return vmConfig.PointsMeleeReach;
    case EViolationType::Flyhack: return vmConfig.PointsFlyhack;
    case EViolationType::Undermesh: return vmConfig.PointsUndermesh;
    case EViolationType::BuildingExploit: return vmConfig.PointsBuildingExploit;
    default: return 1;
    }
}

void ViolationManager::RecordViolation(
    uint64 steamId,
    AShooterPlayerController* pc,
    EViolationType type,
    const FVector& location,
    const std::string& details,
    bool accruePoints)
{
    if (steamId == 0)
    {
        return;
    }

    double now = 0.0;
    if (ArkApi::GetApiUtils().GetWorld())
    {
        now = static_cast<double>(ArkApi::GetApiUtils().GetWorld()->TimeSecondsField());
    }

    const auto vmConfig = Config::Get().GetViolationManager();
    int currentScore = 0;
    bool shouldKick = false;
    int playerTribeId = 0;

    {
        std::unique_lock<SimpleSharedMutex> lock(mutex_);
        auto& profile = profiles_[steamId];
        profile.steamId = steamId;

        if (pc)
        {
            FString charName;
            pc->GetPlayerCharacterName(&charName);
            if (!charName.IsEmpty())
            {
                profile.playerName = charName.ToString();
            }
            profile.tribeId = pc->TargetingTeamField();
        }
        playerTribeId = profile.tribeId;

        // Apply decay if interval has passed (log-only records leave score/decay untouched)
        if (accruePoints && profile.lastViolationTime > 0.0 && vmConfig.DecayIntervalSeconds > 0.0f)
        {
            double elapsed = now - profile.lastViolationTime;
            int decaySteps = static_cast<int>(elapsed / static_cast<double>(vmConfig.DecayIntervalSeconds));
            if (decaySteps > 0)
            {
                profile.violationPoints = (std::max)(0, profile.violationPoints - (decaySteps * vmConfig.DecayAmount));
            }
        }

        if (accruePoints)
        {
            profile.violationPoints += GetViolationWeight(type);
            profile.lastViolationTime = now;
        }
        profile.history.push_back({ type, location, now, details });

        currentScore = profile.violationPoints;
        if (accruePoints && currentScore >= vmConfig.KickThresholdPoints)
        {
            shouldKick = true;
        }
    }

    std::string vTypeStr = ViolationTypeToString(type);
    std::string fullDetails = details + " [Score: " + std::to_string(currentScore) + "/" + std::to_string(vmConfig.KickThresholdPoints) + "]";

    SecurityLogger::Get().LogViolation(steamId, playerTribeId, location, vTypeStr, fullDetails);

    std::string actionTaken = shouldKick ? "Player Kicked" : (accruePoints ? "Violation Registered" : "Logged Only (No Points)");
    DiscordWebhook::Get().DispatchAlert(steamId, pc, vTypeStr, location, actionTaken, fullDetails);

    if (shouldKick)
    {
        ExecuteKick(steamId, pc, type);
    }
}

void ViolationManager::GrantTeleportImmunity(uint64 steamId, const FVector& destLocation, float durationSeconds)
{
    if (steamId == 0) return;

    double now = 0.0;
    if (ArkApi::GetApiUtils().GetWorld())
    {
        now = static_cast<double>(ArkApi::GetApiUtils().GetWorld()->TimeSecondsField());
    }

    std::unique_lock<SimpleSharedMutex> lock(mutex_);
    auto& prof = profiles_[steamId];
    prof.steamId = steamId;
    prof.teleportImmunityUntil = now + static_cast<double>(durationSeconds);
    prof.lastValidLocation = destLocation;
    prof.lastValidTime = now;
    prof.hasValidLocation = true;
}

bool ViolationManager::HasTeleportImmunity(uint64 steamId, double currentTime) const
{
    if (steamId == 0) return false;

    std::shared_lock<SimpleSharedMutex> lock(mutex_);
    auto it = profiles_.find(steamId);
    if (it != profiles_.end())
    {
        return currentTime < it->second.teleportImmunityUntil;
    }
    return false;
}

void ViolationManager::SetRubberbandCooldown(uint64 steamId, float cooldownSeconds)
{
    if (steamId == 0) return;

    double now = 0.0;
    if (ArkApi::GetApiUtils().GetWorld())
    {
        now = static_cast<double>(ArkApi::GetApiUtils().GetWorld()->TimeSecondsField());
    }

    std::unique_lock<SimpleSharedMutex> lock(mutex_);
    auto& prof = profiles_[steamId];
    prof.steamId = steamId;
    prof.rubberbandCooldownUntil = now + static_cast<double>(cooldownSeconds);
    prof.lastValidTime = now;
}

bool ViolationManager::HasRubberbandCooldown(uint64 steamId, double currentTime) const
{
    if (steamId == 0) return false;

    std::shared_lock<SimpleSharedMutex> lock(mutex_);
    auto it = profiles_.find(steamId);
    if (it != profiles_.end())
    {
        return currentTime < it->second.rubberbandCooldownUntil;
    }
    return false;
}

void ViolationManager::UpdateValidPosition(uint64 steamId, const FVector& loc, double currentTime)
{
    if (steamId == 0) return;

    std::unique_lock<SimpleSharedMutex> lock(mutex_);
    auto& prof = profiles_[steamId];
    prof.steamId = steamId;
    prof.lastValidLocation = loc;
    prof.lastValidTime = currentTime;
    prof.hasValidLocation = true;
}

bool ViolationManager::GetLastValidPosition(uint64 steamId, FVector& outLoc, double& outTime) const
{
    if (steamId == 0) return false;

    std::shared_lock<SimpleSharedMutex> lock(mutex_);
    auto it = profiles_.find(steamId);
    if (it != profiles_.end() && it->second.hasValidLocation)
    {
        outLoc = it->second.lastValidLocation;
        outTime = it->second.lastValidTime;
        return true;
    }
    return false;
}

IrisMovement::ResetReason ViolationManager::ObserveMovementState(
    uint64 steamId,
    const IrisMovement::MovementObservation& observation,
    const FVector& trackedLoc)
{
    if (steamId == 0) return IrisMovement::ResetReason::None;

    std::unique_lock<SimpleSharedMutex> lock(mutex_);
    auto& prof = profiles_[steamId];
    prof.steamId = steamId;

    IrisMovement::ResetReason reason = IrisMovement::ObserveAndEvaluate(prof.movementTrack, observation);
    if (reason != IrisMovement::ResetReason::None)
    {
        // State transition: re-baseline silently (no violation, no rubberband).
        prof.lastValidLocation = trackedLoc;
        prof.lastValidTime = observation.now;
        prof.hasValidLocation = true;
        prof.rubberbandCooldownUntil = 0.0;
    }
    return reason;
}

void ViolationManager::MarkMovementIncapacitated(uint64 steamId, const void* controller, const void* pawn, double currentTime)
{
    if (steamId == 0) return;

    std::unique_lock<SimpleSharedMutex> lock(mutex_);
    auto& prof = profiles_[steamId];
    prof.steamId = steamId;
    IrisMovement::MarkIncapacitated(prof.movementTrack, controller, pawn, currentTime);
}

void ViolationManager::InvalidateMovementTracking(uint64 steamId)
{
    if (steamId == 0) return;

    std::unique_lock<SimpleSharedMutex> lock(mutex_);
    auto it = profiles_.find(steamId);
    if (it != profiles_.end())
    {
        IrisMovement::Invalidate(it->second.movementTrack);
    }
}

bool ViolationManager::ValidateFireInterval(uint64 steamId, const std::string& weaponClass, double currentTime, double minInterval)
{
    if (steamId == 0) return true;

    std::unique_lock<SimpleSharedMutex> lock(mutex_);
    auto& prof = profiles_[steamId];
    prof.steamId = steamId;

    auto it = prof.weaponLastFireTime.find(weaponClass);
    if (it == prof.weaponLastFireTime.end())
    {
        prof.weaponLastFireTime[weaponClass] = currentTime;
        return true;
    }

    double delta = currentTime - it->second;
    if (delta < minInterval)
    {
        return false;
    }

    it->second = currentTime;
    return true;
}

void ViolationManager::ExecuteKick(uint64 steamId, AShooterPlayerController* pc, EViolationType reason)
{
    if (!pc)
    {
        pc = ArkApi::GetApiUtils().FindPlayerFromSteamId(steamId);
    }

    if (!pc)
    {
        SecurityLogger::Get().Warn("[ViolationManager] Could not find controller to kick SteamID: " + std::to_string(steamId));
        return;
    }

    const auto vmConfig = Config::Get().GetViolationManager();
    std::string kickReason = vmConfig.KickReason + " (" + ViolationTypeToString(reason) + ")";
    SendWarningNotification(pc, kickReason);

    FString steamName = ArkApi::GetApiUtils().GetSteamName(pc);
    FString steamIdStr = std::to_string(steamId).c_str();

    pc->ServerKickPlayer(&steamName, &steamIdStr);
    SecurityLogger::Get().Warn("[ViolationManager] Auto-kick executed for player: " + steamName.ToString() + " (SteamID: " + std::to_string(steamId) + ") Reason: " + ViolationTypeToString(reason));
}

void ViolationManager::SendWarningNotification(AShooterPlayerController* pc, const std::string& message)
{
    if (!pc) return;

    const auto genConfig = Config::Get().GetGeneral();
    FLinearColor redColor(1.0f, 0.15f, 0.15f, 1.0f);

    ArkApi::GetApiUtils().SendNotification(
        pc,
        redColor,
        genConfig.NotificationScale,
        genConfig.NotificationTime,
        nullptr,
        "{}",
        message.c_str()
    );
}

void ViolationManager::Clear()
{
    std::unique_lock<SimpleSharedMutex> lock(mutex_);
    profiles_.clear();
}
