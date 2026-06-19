#pragma once

#include <API/ARK/Ark.h>
#include <string>
#include <unordered_map>
#include <chrono>
#include <mutex>

namespace HeartShop
{
namespace Protection
{
    // Protection status cache
    struct PlayerProtectionStatus
    {
        bool isProtected;
        std::chrono::system_clock::time_point protectionEndAt;
        std::string protectionType;
        std::chrono::system_clock::time_point lastChecked;
    };

    struct TribeProtectionStatus
    {
        bool isProtected;
        std::chrono::system_clock::time_point protectionEndAt;
        std::string protectionType;
        std::string ownerSteamId;
        std::chrono::system_clock::time_point lastChecked;
    };

    // Cache expiry time (seconds)
    constexpr int CACHE_EXPIRY_SECONDS = 30;

    // Global caches (defined in Protection.cpp)
    extern std::unordered_map<uint64, PlayerProtectionStatus> PlayerCache;
    extern std::unordered_map<uint64, TribeProtectionStatus> TribeCache;
    extern std::mutex CacheMutex;

    // Initialize protection system
    void Init();
    void Cleanup();

    // Check protection status (uses cache)
    bool IsPlayerProtected(uint64 SteamId);
    bool IsTribeProtected(uint64 TribeId);

    // Refresh protection from API
    void RefreshPlayerProtection(uint64 SteamId);
    void RefreshTribeProtection(uint64 TribeId);

    // Clear cache entries
    void ClearPlayerCache(uint64 SteamId);
    void ClearTribeCache(uint64 TribeId);

    // Register new player
    void RegisterNewPlayer(AShooterPlayerController* Player);

    // Player tribe events
    void OnPlayerJoinedTribe(uint64 SteamId, uint64 TribeId, const std::string& TribeName);
    void OnPlayerLeftTribe(uint64 SteamId, uint64 TribeId);

    // Log damage blocked
    void LogDamageBlocked(
        uint64 TargetSteamId,
        uint64 TargetTribeId,
        uint64 AttackerSteamId,
        uint64 AttackerTribeId,
        const std::string& Details
    );

    // Register hooks
    void RegisterHooks();
    void UnregisterHooks();

    // Hook typedefs
    typedef float(*TakeDamage_t)(APrimalStructure*, float, FDamageEvent*, AController*, AActor*);
    typedef float(*TakeDamage_Dino_t)(APrimalDinoCharacter*, float, FDamageEvent*, AController*, AActor*);
    typedef float(*TakeDamage_Player_t)(AShooterCharacter*, float, FDamageEvent*, AController*, AActor*);
    typedef void(*JoinTribe_t)(AShooterPlayerState*, FTribeData*, bool, bool);
    typedef void(*LeaveTribe_t)(AShooterPlayerState*, bool);

    // Original function pointers (defined in Protection.cpp)
    extern TakeDamage_t TakeDamage_Structure_Original;
    extern TakeDamage_Dino_t TakeDamage_Dino_Original;
    extern TakeDamage_Player_t TakeDamage_Player_Original;
    extern JoinTribe_t JoinTribe_Original;
    extern LeaveTribe_t LeaveTribe_Original;

    // Hook functions
    float Hook_TakeDamage_Structure(APrimalStructure* _this, float Damage, FDamageEvent* DamageEvent, AController* EventInstigator, AActor* DamageCauser);
    float Hook_TakeDamage_Dino(APrimalDinoCharacter* _this, float Damage, FDamageEvent* DamageEvent, AController* EventInstigator, AActor* DamageCauser);
    float Hook_TakeDamage_Player(AShooterCharacter* _this, float Damage, FDamageEvent* DamageEvent, AController* EventInstigator, AActor* DamageCauser);
    void Hook_JoinTribe(AShooterPlayerState* _this, FTribeData* TribeData, bool bMergeTribe, bool bForce);
    void Hook_LeaveTribe(AShooterPlayerState* _this, bool bMergeTribe);
}
}
