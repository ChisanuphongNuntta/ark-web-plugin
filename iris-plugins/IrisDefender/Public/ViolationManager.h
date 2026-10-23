#pragma once

#include "IrisDefender.h"
#include "MovementLogic.h"

enum class EViolationType : uint8_t
{
    Speedhack,
    Teleport,
    RapidFire,
    MeleeReach,
    Flyhack,
    Undermesh,
    BuildingExploit
};

std::string ViolationTypeToString(EViolationType type);

struct ViolationRecord
{
    EViolationType type;
    FVector location;
    double timestamp;
    std::string details;
};

struct PlayerSecurityProfile
{
    uint64 steamId = 0;
    std::string playerName;
    int tribeId = 0;

    int violationPoints = 0;
    double lastViolationTime = 0.0;

    FVector lastValidLocation = FVector(0.0f, 0.0f, 0.0f);
    double lastValidTime = 0.0;
    bool hasValidLocation = false;
    double teleportImmunityUntil = 0.0;
    double rubberbandCooldownUntil = 0.0;

    // Movement state-transition tracking (pawn / controller / mounted / incapacitated)
    IrisMovement::MovementTrackState movementTrack;

    std::unordered_map<std::string, double> weaponLastFireTime;
    std::vector<ViolationRecord> history;
};

class ViolationManager
{
public:
    static ViolationManager& Get()
    {
        static ViolationManager instance;
        return instance;
    }

    void RecordViolation(
        uint64 steamId,
        AShooterPlayerController* pc,
        EViolationType type,
        const FVector& location,
        const std::string& details,
        bool accruePoints = true
    );

    void GrantTeleportImmunity(uint64 steamId, const FVector& destLocation, float durationSeconds);
    bool HasTeleportImmunity(uint64 steamId, double currentTime) const;

    void SetRubberbandCooldown(uint64 steamId, float cooldownSeconds = 0.5f);
    bool HasRubberbandCooldown(uint64 steamId, double currentTime) const;

    void UpdateValidPosition(uint64 steamId, const FVector& loc, double currentTime);
    bool GetLastValidPosition(uint64 steamId, FVector& outLoc, double& outTime) const;

    // Observes a live (pawn present, not dead) tick. If a state transition happened
    // (first sight/login, controller or pawn change, mount/dismount, recovered from
    // dead/unconscious, observation gap) the last valid position is reset to
    // `trackedLoc` WITHOUT any violation, and the reason is returned.
    IrisMovement::ResetReason ObserveMovementState(
        uint64 steamId,
        const IrisMovement::MovementObservation& observation,
        const FVector& trackedLoc);

    // Player has no pawn or is dead this tick: the next live tick resets the baseline.
    void MarkMovementIncapacitated(uint64 steamId, const void* controller, const void* pawn, double currentTime);

    // Forget movement baseline (e.g. player skipped as admin, logout).
    void InvalidateMovementTracking(uint64 steamId);

    bool ValidateFireInterval(uint64 steamId, const std::string& weaponClass, double currentTime, double minInterval);

    void ExecuteKick(uint64 steamId, AShooterPlayerController* pc, EViolationType reason);
    void SendWarningNotification(AShooterPlayerController* pc, const std::string& message);

    void Clear();

private:
    ViolationManager() = default;
    ~ViolationManager() = default;
    ViolationManager(const ViolationManager&) = delete;
    ViolationManager& operator=(const ViolationManager&) = delete;

    mutable SimpleSharedMutex mutex_;
    std::unordered_map<uint64, PlayerSecurityProfile> profiles_;

    int GetViolationWeight(EViolationType type) const;
};
