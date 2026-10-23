#pragma once

// Pure movement-tracking logic shared by AntiCheat/ViolationManager.
// Deliberately has NO ArkApi / Unreal dependencies so it can be unit tested
// with a plain `cl` build (see tests/test_movement_logic.cpp).

#include <cmath>
#include <cstdint>
#include <cstring>

namespace IrisMovement
{
    struct Vec3
    {
        float X;
        float Y;
        float Z;
    };

    // ARK maps live well inside +/-1e6 UU; anything beyond this is garbage memory.
    constexpr float kMaxSaneCoordinate = 1.0e7f;

    // Byte layout of UE4 FTransform in ShooterGameServer (verified against the live
    // ShooterGameServer.pdb: size 48, Rotation@0x00, Translation@0x10, Scale3D@0x20,
    // each an __m128 / VectorRegister of 4 floats).
    constexpr size_t kTransformSize = 48;
    constexpr size_t kTransformTranslationOffset = 16;

    // A usable world location is finite, within map bounds and not the exact origin.
    // (0,0,0) is what an uninitialised / identity ComponentToWorld reports, and is the
    // exact value that produced the "[Coords: 0, 0, 0] [Teleport]" false positives.
    inline bool IsUsableWorldLocation(float x, float y, float z)
    {
        if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z))
        {
            return false;
        }
        if (std::fabs(x) > kMaxSaneCoordinate || std::fabs(y) > kMaxSaneCoordinate || std::fabs(z) > kMaxSaneCoordinate)
        {
            return false;
        }
        if (x == 0.0f && y == 0.0f && z == 0.0f)
        {
            return false;
        }
        return true;
    }

    // Extracts the Translation of an FTransform located at `transform`.
    // Copies byte-wise (alignment agnostic, equivalent to _mm_storeu_ps into float[4])
    // so no aligned SSE load is ever issued against game memory.
    inline bool ExtractTransformTranslation(const void* transform, Vec3& out)
    {
        if (transform == nullptr)
        {
            return false;
        }

        const unsigned char* base = static_cast<const unsigned char*>(transform);
        float lanes[4] = { 0.0f, 0.0f, 0.0f, 0.0f };
        std::memcpy(lanes, base + kTransformTranslationOffset, sizeof(lanes));

        if (!IsUsableWorldLocation(lanes[0], lanes[1], lanes[2]))
        {
            return false;
        }

        out.X = lanes[0];
        out.Y = lanes[1];
        out.Z = lanes[2];
        return true;
    }

    // Why the per-player "last valid position" was reset this tick.
    enum class ResetReason : uint8_t
    {
        None = 0,
        FirstObservation,          // never seen / explicitly invalidated (login, plugin load)
        ControllerChanged,         // reconnect / login: new PlayerController for this SteamID
        PawnChanged,               // respawn, new survivor, server transfer
        RecoveredFromIncapacitated,// was dead / unconscious / pawn-less last tick
        MountStateChanged,         // mount / dismount / passenger seat / carried / chair
        ObservationGap             // not observed for a while (e.g. admin skip, stall, time reset)
    };

    inline const char* ResetReasonToString(ResetReason reason)
    {
        switch (reason)
        {
        case ResetReason::None: return "None";
        case ResetReason::FirstObservation: return "FirstObservation";
        case ResetReason::ControllerChanged: return "ControllerChanged";
        case ResetReason::PawnChanged: return "PawnChanged";
        case ResetReason::RecoveredFromIncapacitated: return "RecoveredFromIncapacitated";
        case ResetReason::MountStateChanged: return "MountStateChanged";
        case ResetReason::ObservationGap: return "ObservationGap";
        default: return "Unknown";
        }
    }

    struct MovementTrackState
    {
        bool initialized = false;
        const void* lastController = nullptr;
        const void* lastPawn = nullptr;
        int lastPawnIndex = -1;           // UObjectBase::InternalIndex (guards pointer re-use)
        bool lastAttached = false;
        bool lastIncapacitated = false;
        double lastSeenTime = 0.0;
    };

    struct MovementObservation
    {
        const void* controller = nullptr;
        const void* pawn = nullptr;
        int pawnIndex = -1;
        bool attached = false;      // riding / passenger / carried / seated
        bool incapacitated = false; // unconscious this tick
        double now = 0.0;
    };

    constexpr double kDefaultMaxObservationGapSeconds = 5.0;

    // Records a live (pawn present, not dead) observation and reports whether the
    // movement baseline must be reset instead of being compared against.
    inline ResetReason ObserveAndEvaluate(
        MovementTrackState& state,
        const MovementObservation& obs,
        double maxGapSeconds = kDefaultMaxObservationGapSeconds)
    {
        ResetReason reason = ResetReason::None;

        if (!state.initialized)
        {
            reason = ResetReason::FirstObservation;
        }
        else if (obs.controller != state.lastController)
        {
            reason = ResetReason::ControllerChanged;
        }
        else if (obs.pawn != state.lastPawn || obs.pawnIndex != state.lastPawnIndex)
        {
            reason = ResetReason::PawnChanged;
        }
        else if (state.lastIncapacitated)
        {
            reason = ResetReason::RecoveredFromIncapacitated;
        }
        else if (obs.attached != state.lastAttached)
        {
            reason = ResetReason::MountStateChanged;
        }
        else if (obs.now < state.lastSeenTime || (obs.now - state.lastSeenTime) > maxGapSeconds)
        {
            reason = ResetReason::ObservationGap;
        }

        state.initialized = true;
        state.lastController = obs.controller;
        state.lastPawn = obs.pawn;
        state.lastPawnIndex = obs.pawnIndex;
        state.lastAttached = obs.attached;
        state.lastIncapacitated = obs.incapacitated;
        state.lastSeenTime = obs.now;

        return reason;
    }

    // Called on ticks where the player has no pawn or the pawn is dead; the next
    // live observation is then guaranteed to reset the baseline.
    inline void MarkIncapacitated(MovementTrackState& state, const void* controller, const void* pawn, double now)
    {
        state.initialized = true;
        state.lastController = controller;
        state.lastPawn = pawn;
        state.lastIncapacitated = true;
        state.lastSeenTime = now;
    }

    inline void Invalidate(MovementTrackState& state)
    {
        state = MovementTrackState{};
    }
}
