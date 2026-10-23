#pragma once

#include "IrisDefender.h"

struct GeneralConfig
{
    bool Enabled = true;
    std::string ServerId = "PVP-CENTER";
    bool LogToConsole = true;
    float NotificationScale = 1.3f;
    float NotificationTime = 5.0f;
    bool IgnoreAdmins = true;
};

struct BuildingExploitConfig
{
    bool Enabled = true;
    bool BlockFloatingTurrets = true;
    bool RequireSolidFloor = true;
    bool BlockGiantHatchframes = true;
    float MinTurretDistance = 150.0f;
    bool TurretStackingEnabled = true;
    bool PlatformSaddlesEnabled = true;
    std::vector<std::string> PlatformBlacklist = {
        "StorageBox_Tek",
        "TekReplicator",
        "TekTransmitter",
        "SM_MetalCeilingDoorWay_Giant_BP",
        "SM_TekCeilingDoorWay_Giant_BP",
        "StorageBox_Huge"
    };
    std::string MsgFloatingTurret = "⚠️ [IrisDefender] Placement blocked: Floating turret or Giant Hatchframe doorway support is not permitted!";
    std::string MsgTurretStacking = "⚠️ [IrisDefender] Placement blocked: Turret stacking detected! Minimum distance between turrets is required.";
    std::string MsgPlatformExploit = "⚠️ [IrisDefender] Placement blocked: This structure is blacklisted on platform saddles/rafts!";
};

struct SpeedhackConfig
{
    bool Enabled = true;
    float MaxHumanSpeed = 2400.0f;
    float MaxDinoSpeed = 9000.0f;
    float MaxTeleportDelta = 8000.0f;
    bool EnableRubberbanding = true;
    // Optional. While mounted/attached the rider is never rubberbanded; violations are
    // logged + webhooked only. Set true to also add violation points (can lead to kicks).
    bool MountedViolationsAccruePoints = false;
    std::string MsgSpeedhack = "[IrisDefender] Abnormal movement speed detected. Position corrected.";
    std::string MsgTeleport = "[IrisDefender] Unauthorized teleport detected. Position rubberbanded.";
};

struct RapidFireConfig
{
    bool Enabled = true;
    float TolerancePercent = 0.18f;
    float DefaultWeaponMinInterval = 0.10f;
    std::unordered_map<std::string, float> WeaponIntervalOverrides = {
        {"WeapShotgun", 0.70f},
        {"WeapSniper", 0.32f},
        {"WeapMachinedPistol", 0.15f},
        {"WeapRifle_Machined", 0.12f},
        {"WeapRifle", 2.10f},
        {"WeapCrossbow", 1.35f},
        {"WeapCompoundBow", 0.90f},
        {"WeapBow", 1.00f}
    };
    std::string MsgRapidFire = "[IrisDefender] Weapon rate-of-fire violation. Shot suppressed.";
};

struct MeleeReachConfig
{
    bool Enabled = true;
    float MaxHumanReach = 450.0f;
    float MaxPikeReach = 550.0f;
    std::string MsgMeleeReach = "[IrisDefender] Melee range violation rejected.";
};

struct FlyhackConfig
{
    bool Enabled = true;
    bool StrictTekSuitValidation = true;
    bool ForceGroundOnViolation = true;
    std::string MsgFlyhack = "[IrisDefender] Unassisted flight/noclip violation detected.";
};

struct UndermeshConfig
{
    bool Enabled = true;
    float TheCenterWorldFloorZ = -55000.0f;
    bool CheckInvertedTerrainNormals = true;
    std::string Action = "Rubberband"; // "Rubberband" or "Kill"
    FVector SafeSurfaceCoords = FVector(0.0f, 0.0f, 5000.0f);
    std::string MsgUndermesh = "[IrisDefender] Undermesh infiltration detected! Repositioned to safe surface.";
};

struct ViolationManagerConfig
{
    int KickThresholdPoints = 10;
    float DecayIntervalSeconds = 60.0f;
    int DecayAmount = 2;
    int PointsSpeedhack = 2;
    int PointsTeleport = 5;
    int PointsRapidFire = 3;
    int PointsMeleeReach = 2;
    int PointsFlyhack = 4;
    int PointsUndermesh = 10;
    int PointsBuildingExploit = 1;
    std::string KickReason = "IrisDefender: Anti-Cheat Violation Detected";
};

struct ObservabilityConfig
{
    bool DiscordWebhookEnabled = false;
    std::string DiscordWebhookUrl = "";
    bool LogViolationsToFile = true;
    std::string LogFilePath = "logs/IrisDefender.log";
};

struct ConfigData
{
    GeneralConfig General;
    BuildingExploitConfig BuildingExploit;
    SpeedhackConfig Speedhack;
    RapidFireConfig RapidFire;
    MeleeReachConfig MeleeReach;
    FlyhackConfig Flyhack;
    UndermeshConfig Undermesh;
    ViolationManagerConfig ViolationManager;
    ObservabilityConfig Observability;
};

class Config
{
public:
    static Config& Get()
    {
        static Config instance;
        return instance;
    }

    bool Load(const std::string& filePath);
    bool Reload();
    std::string GetFilePath() const;

    ConfigData GetData() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_;
    }

    GeneralConfig GetGeneral() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_.General;
    }

    BuildingExploitConfig GetBuildingExploit() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_.BuildingExploit;
    }

    SpeedhackConfig GetSpeedhack() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_.Speedhack;
    }

    RapidFireConfig GetRapidFire() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_.RapidFire;
    }

    MeleeReachConfig GetMeleeReach() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_.MeleeReach;
    }

    FlyhackConfig GetFlyhack() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_.Flyhack;
    }

    UndermeshConfig GetUndermesh() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_.Undermesh;
    }

    ViolationManagerConfig GetViolationManager() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_.ViolationManager;
    }

    ObservabilityConfig GetObservability() const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        return data_.Observability;
    }

    float GetWeaponMinInterval(const std::string& weaponClass) const
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        std::string bestMatchKey = "";
        float bestInterval = -1.0f;

        for (const auto& pair : data_.RapidFire.WeaponIntervalOverrides)
        {
            if (weaponClass.find(pair.first) != std::string::npos)
            {
                if (pair.first.length() > bestMatchKey.length())
                {
                    bestMatchKey = pair.first;
                    bestInterval = pair.second;
                }
            }
        }

        if (!bestMatchKey.empty() && bestInterval >= 0.0f)
        {
            return bestInterval * (1.0f - data_.RapidFire.TolerancePercent);
        }

        return data_.RapidFire.DefaultWeaponMinInterval;
    }

private:
    Config() = default;
    ~Config() = default;
    Config(const Config&) = delete;
    Config& operator=(const Config&) = delete;

    mutable SimpleSharedMutex mutex_;
    ConfigData data_;
    std::string filePath_;
};
