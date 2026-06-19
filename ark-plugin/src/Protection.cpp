#include "Protection.h"
#include "HeartShop.h"
#include <Logger/Logger.h>

namespace HeartShop
{
namespace Protection
{
    // Define global variables (declared as extern in Protection.h)
    std::unordered_map<uint64, PlayerProtectionStatus> PlayerCache;
    std::unordered_map<uint64, TribeProtectionStatus> TribeCache;
    std::mutex CacheMutex;

    // Define function pointers (declared as extern in Protection.h)
    TakeDamage_t TakeDamage_Structure_Original = nullptr;
    TakeDamage_Dino_t TakeDamage_Dino_Original = nullptr;
    TakeDamage_Player_t TakeDamage_Player_Original = nullptr;
    JoinTribe_t JoinTribe_Original = nullptr;
    LeaveTribe_t LeaveTribe_Original = nullptr;

    void Init()
    {
        Log::GetLog()->info("Protection system initializing...");

        std::lock_guard<std::mutex> lock(CacheMutex);
        PlayerCache.clear();
        TribeCache.clear();

        Log::GetLog()->info("Protection system initialized");
    }

    void Cleanup()
    {
        Log::GetLog()->info("Protection system cleaning up...");

        std::lock_guard<std::mutex> lock(CacheMutex);
        PlayerCache.clear();
        TribeCache.clear();

        Log::GetLog()->info("Protection system cleaned up");
    }

    bool IsPlayerProtected(uint64 SteamId)
    {
        auto now = std::chrono::system_clock::now();

        {
            std::lock_guard<std::mutex> lock(CacheMutex);

            auto it = PlayerCache.find(SteamId);
            if (it != PlayerCache.end())
            {
                // Check if cache is still valid
                auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - it->second.lastChecked).count();
                if (elapsed < CACHE_EXPIRY_SECONDS)
                {
                    // Check if protection is still active
                    if (it->second.isProtected && now < it->second.protectionEndAt)
                    {
                        return true;
                    }
                    return false;
                }
            }
        }

        // Cache miss or expired - refresh in background
        RefreshPlayerProtection(SteamId);

        // Return cached value if available, otherwise false
        {
            std::lock_guard<std::mutex> lock(CacheMutex);
            auto it = PlayerCache.find(SteamId);
            if (it != PlayerCache.end() && it->second.isProtected && now < it->second.protectionEndAt)
            {
                return true;
            }
        }

        return false;
    }

    bool IsTribeProtected(uint64 TribeId)
    {
        if (TribeId == 0)
            return false;

        auto now = std::chrono::system_clock::now();

        {
            std::lock_guard<std::mutex> lock(CacheMutex);

            auto it = TribeCache.find(TribeId);
            if (it != TribeCache.end())
            {
                auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - it->second.lastChecked).count();
                if (elapsed < CACHE_EXPIRY_SECONDS)
                {
                    if (it->second.isProtected && now < it->second.protectionEndAt)
                    {
                        return true;
                    }
                    return false;
                }
            }
        }

        // Cache miss or expired - refresh in background
        RefreshTribeProtection(TribeId);

        {
            std::lock_guard<std::mutex> lock(CacheMutex);
            auto it = TribeCache.find(TribeId);
            if (it != TribeCache.end() && it->second.isProtected && now < it->second.protectionEndAt)
            {
                return true;
            }
        }

        return false;
    }

    void RefreshPlayerProtection(uint64 SteamId)
    {
        if (!Http)
            return;

        std::string SteamIdStr = std::to_string(SteamId);

        Http->Request("GET", "/protection/player/" + SteamIdStr, "",
            [SteamId](bool Success, const nlohmann::json& Response) {
                if (!Success)
                {
                    Log::GetLog()->warn("Failed to refresh player protection for {}", SteamId);
                    return;
                }

                try
                {
                    PlayerProtectionStatus status;
                    status.isProtected = Response["isProtected"].get<bool>();
                    status.lastChecked = std::chrono::system_clock::now();

                    if (status.isProtected && Response.contains("player") && !Response["player"].is_null())
                    {
                        auto player = Response["player"];

                        // Parse ISO8601 date
                        std::string endAtStr = player["protectionEndAt"].get<std::string>();
                        // Simple parsing - assume format "YYYY-MM-DDTHH:MM:SS.sssZ"
                        std::tm tm = {};
                        int ms = 0;
                        sscanf(endAtStr.c_str(), "%d-%d-%dT%d:%d:%d.%dZ",
                            &tm.tm_year, &tm.tm_mon, &tm.tm_mday,
                            &tm.tm_hour, &tm.tm_min, &tm.tm_sec, &ms);
                        tm.tm_year -= 1900;
                        tm.tm_mon -= 1;

                        auto time = std::mktime(&tm);
                        status.protectionEndAt = std::chrono::system_clock::from_time_t(time);
                        status.protectionType = player["protectionType"].get<std::string>();
                    }

                    {
                        std::lock_guard<std::mutex> lock(CacheMutex);
                        PlayerCache[SteamId] = status;
                    }

                    Log::GetLog()->debug("Refreshed player protection for {}: protected={}",
                        SteamId, status.isProtected);
                }
                catch (const std::exception& e)
                {
                    Log::GetLog()->error("Error parsing player protection response: {}", e.what());
                }
            });
    }

    void RefreshTribeProtection(uint64 TribeId)
    {
        if (!Http)
            return;

        std::string TribeIdStr = std::to_string(TribeId);

        Http->Request("GET", "/protection/tribe/" + TribeIdStr, "",
            [TribeId](bool Success, const nlohmann::json& Response) {
                if (!Success)
                {
                    Log::GetLog()->warn("Failed to refresh tribe protection for {}", TribeId);
                    return;
                }

                try
                {
                    TribeProtectionStatus status;
                    status.isProtected = Response["isProtected"].get<bool>();
                    status.lastChecked = std::chrono::system_clock::now();

                    if (status.isProtected && Response.contains("tribe") && !Response["tribe"].is_null())
                    {
                        auto tribe = Response["tribe"];

                        std::string endAtStr = tribe["protectionEndAt"].get<std::string>();
                        std::tm tm = {};
                        int ms = 0;
                        sscanf(endAtStr.c_str(), "%d-%d-%dT%d:%d:%d.%dZ",
                            &tm.tm_year, &tm.tm_mon, &tm.tm_mday,
                            &tm.tm_hour, &tm.tm_min, &tm.tm_sec, &ms);
                        tm.tm_year -= 1900;
                        tm.tm_mon -= 1;

                        auto time = std::mktime(&tm);
                        status.protectionEndAt = std::chrono::system_clock::from_time_t(time);
                        status.protectionType = tribe["protectionType"].get<std::string>();
                        status.ownerSteamId = tribe["ownerSteamId"].get<std::string>();
                    }

                    {
                        std::lock_guard<std::mutex> lock(CacheMutex);
                        TribeCache[TribeId] = status;
                    }

                    Log::GetLog()->debug("Refreshed tribe protection for {}: protected={}",
                        TribeId, status.isProtected);
                }
                catch (const std::exception& e)
                {
                    Log::GetLog()->error("Error parsing tribe protection response: {}", e.what());
                }
            });
    }

    void ClearPlayerCache(uint64 SteamId)
    {
        std::lock_guard<std::mutex> lock(CacheMutex);
        PlayerCache.erase(SteamId);
    }

    void ClearTribeCache(uint64 TribeId)
    {
        std::lock_guard<std::mutex> lock(CacheMutex);
        TribeCache.erase(TribeId);
    }

    void RegisterNewPlayer(AShooterPlayerController* Player)
    {
        if (!Player || !Http)
            return;

        uint64 SteamId = GetSteamId(Player);
        std::string SteamIdStr = std::to_string(SteamId);

        // Get player name
        FString PlayerName;
        Player->GetPlayerCharacterName(&PlayerName);
        std::string PlayerNameStr = ArkApi::Tools::Utf8Encode(*PlayerName);

        nlohmann::json body;
        body["steamId"] = SteamIdStr;
        body["playerName"] = PlayerNameStr;

        Http->Request("POST", "/protection/player/register", body.dump(),
            [Player, SteamId](bool Success, const nlohmann::json& Response) {
                if (!Success || !Player)
                    return;

                try
                {
                    bool isNew = Response["isNew"].get<bool>();

                    if (isNew)
                    {
                        // Notify player about new protection
                        std::string MsgStr = PluginConfig->GetMessage("ProtectionGranted");
                        FString Msg = FString(ArkApi::Tools::Utf8Decode(MsgStr).c_str());

                        int days = Response["protection"]["protectionDays"].get<int>();
                        FString DaysStr = FString::FromInt(days);
                        Msg = Msg.Replace(L"{days}", *DaysStr, ESearchCase::IgnoreCase);

                        SendMessage(Player, Msg);

                        Log::GetLog()->info("New player {} granted {} days protection", SteamId, days);
                    }
                    else
                    {
                        // Check if protection is still active
                        auto protection = Response["protection"];
                        if (protection["isActive"].get<bool>())
                        {
                            std::string MsgStr = PluginConfig->GetMessage("ProtectionActive");
                            FString Msg = FString(ArkApi::Tools::Utf8Decode(MsgStr).c_str());
                            SendMessage(Player, Msg);
                        }
                    }

                    // Refresh cache
                    RefreshPlayerProtection(SteamId);
                }
                catch (const std::exception& e)
                {
                    Log::GetLog()->error("Error in RegisterNewPlayer: {}", e.what());
                }
            });
    }

    void OnPlayerJoinedTribe(uint64 SteamId, uint64 TribeId, const std::string& TribeName)
    {
        if (!Http)
            return;

        nlohmann::json body;
        body["steamId"] = std::to_string(SteamId);
        body["tribeId"] = std::to_string(TribeId);
        body["tribeName"] = TribeName;

        Http->Request("POST", "/protection/player/join-tribe", body.dump(),
            [SteamId, TribeId](bool Success, const nlohmann::json& Response) {
                if (!Success)
                    return;

                try
                {
                    bool tribeProtected = Response["tribeProtected"].get<bool>();

                    if (tribeProtected)
                    {
                        Log::GetLog()->info("Player {} protected tribe {}", SteamId, TribeId);

                        // Clear tribe cache to force refresh
                        ClearTribeCache(TribeId);
                    }
                }
                catch (const std::exception& e)
                {
                    Log::GetLog()->error("Error in OnPlayerJoinedTribe: {}", e.what());
                }
            });
    }

    void OnPlayerLeftTribe(uint64 SteamId, uint64 TribeId)
    {
        if (!Http)
            return;

        nlohmann::json body;
        body["steamId"] = std::to_string(SteamId);
        body["tribeId"] = std::to_string(TribeId);

        Http->Request("POST", "/protection/player/leave-tribe", body.dump(),
            [TribeId](bool Success, const nlohmann::json& Response) {
                if (!Success)
                    return;

                try
                {
                    bool protectionEnded = Response["protectionEnded"].get<bool>();

                    if (protectionEnded)
                    {
                        Log::GetLog()->info("Tribe {} protection ended (owner left)", TribeId);
                        ClearTribeCache(TribeId);
                    }
                }
                catch (const std::exception& e)
                {
                    Log::GetLog()->error("Error in OnPlayerLeftTribe: {}", e.what());
                }
            });
    }

    void LogDamageBlocked(
        uint64 TargetSteamId,
        uint64 TargetTribeId,
        uint64 AttackerSteamId,
        uint64 AttackerTribeId,
        const std::string& Details)
    {
        if (!Http)
            return;

        nlohmann::json body;
        body["targetSteamId"] = std::to_string(TargetSteamId);
        body["targetTribeId"] = std::to_string(TargetTribeId);
        body["attackerSteamId"] = std::to_string(AttackerSteamId);
        body["attackerTribeId"] = std::to_string(AttackerTribeId);
        body["details"] = Details;

        Http->Request("POST", "/protection/log/damage-blocked", body.dump(),
            [](bool Success, const nlohmann::json&) {
                // Fire and forget
            });
    }

    // ==========================================
    // Hook Implementations
    // ==========================================

    float Hook_TakeDamage_Structure(APrimalStructure* _this, float Damage, FDamageEvent* DamageEvent, AController* EventInstigator, AActor* DamageCauser)
    {
        if (Damage <= 0 || !_this)
            return TakeDamage_Structure_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

        // Get structure's tribe
        int TargetTeam = _this->TargetingTeamField();
        uint64 TargetTribeId = static_cast<uint64>(TargetTeam);

        // Skip if no tribe
        if (TargetTribeId == 0)
            return TakeDamage_Structure_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

        // Check if structure's tribe is protected
        if (IsTribeProtected(TargetTribeId))
        {
            // Get attacker info
            uint64 AttackerSteamId = 0;
            uint64 AttackerTribeId = 0;

            if (EventInstigator)
            {
                AShooterPlayerController* AttackerPC = static_cast<AShooterPlayerController*>(EventInstigator);
                if (AttackerPC)
                {
                    AttackerSteamId = GetSteamId(AttackerPC);
                    AShooterPlayerState* AttackerPS = static_cast<AShooterPlayerState*>(AttackerPC->PlayerStateField());
                    if (AttackerPS)
                    {
                        AttackerTribeId = AttackerPS->TargetingTeamField();
                    }
                }
            }

            // Don't block friendly fire
            if (AttackerTribeId == TargetTribeId)
                return TakeDamage_Structure_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

            // Log and block damage
            LogDamageBlocked(0, TargetTribeId, AttackerSteamId, AttackerTribeId, "structure");

            return 0.0f;
        }

        return TakeDamage_Structure_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);
    }

    float Hook_TakeDamage_Dino(APrimalDinoCharacter* _this, float Damage, FDamageEvent* DamageEvent, AController* EventInstigator, AActor* DamageCauser)
    {
        if (Damage <= 0 || !_this)
            return TakeDamage_Dino_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

        // Get dino's tribe
        int TargetTeam = _this->TargetingTeamField();
        uint64 TargetTribeId = static_cast<uint64>(TargetTeam);

        // Skip wild dinos (wild dinos have low team IDs, tamed dinos have tribe team IDs > 50000)
        if (TargetTribeId < 50000)
            return TakeDamage_Dino_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

        // Check if dino's tribe is protected
        if (IsTribeProtected(TargetTribeId))
        {
            uint64 AttackerSteamId = 0;
            uint64 AttackerTribeId = 0;

            if (EventInstigator)
            {
                AShooterPlayerController* AttackerPC = static_cast<AShooterPlayerController*>(EventInstigator);
                if (AttackerPC)
                {
                    AttackerSteamId = GetSteamId(AttackerPC);
                    AShooterPlayerState* AttackerPS = static_cast<AShooterPlayerState*>(AttackerPC->PlayerStateField());
                    if (AttackerPS)
                    {
                        AttackerTribeId = AttackerPS->TargetingTeamField();
                    }
                }
            }

            // Don't block friendly fire
            if (AttackerTribeId == TargetTribeId)
                return TakeDamage_Dino_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

            LogDamageBlocked(0, TargetTribeId, AttackerSteamId, AttackerTribeId, "dino");

            return 0.0f;
        }

        return TakeDamage_Dino_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);
    }

    float Hook_TakeDamage_Player(AShooterCharacter* _this, float Damage, FDamageEvent* DamageEvent, AController* EventInstigator, AActor* DamageCauser)
    {
        if (Damage <= 0 || !_this)
            return TakeDamage_Player_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

        // Get player's Steam ID
        AShooterPlayerController* TargetPC = static_cast<AShooterPlayerController*>(_this->GetOwnerController());
        if (!TargetPC)
            return TakeDamage_Player_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

        uint64 TargetSteamId = GetSteamId(TargetPC);
        uint64 TargetTribeId = 0;

        AShooterPlayerState* TargetPS = static_cast<AShooterPlayerState*>(TargetPC->PlayerStateField());
        if (TargetPS)
        {
            TargetTribeId = TargetPS->TargetingTeamField();
        }

        // Check if player is protected
        if (IsPlayerProtected(TargetSteamId))
        {
            uint64 AttackerSteamId = 0;
            uint64 AttackerTribeId = 0;

            if (EventInstigator)
            {
                AShooterPlayerController* AttackerPC = static_cast<AShooterPlayerController*>(EventInstigator);
                if (AttackerPC)
                {
                    AttackerSteamId = GetSteamId(AttackerPC);
                    AShooterPlayerState* AttackerPS = static_cast<AShooterPlayerState*>(AttackerPC->PlayerStateField());
                    if (AttackerPS)
                    {
                        AttackerTribeId = AttackerPS->TargetingTeamField();
                    }
                }
            }

            // Don't block friendly fire or self damage
            if (AttackerSteamId == TargetSteamId || (AttackerTribeId != 0 && AttackerTribeId == TargetTribeId))
                return TakeDamage_Player_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

            LogDamageBlocked(TargetSteamId, TargetTribeId, AttackerSteamId, AttackerTribeId, "player");

            return 0.0f;
        }

        return TakeDamage_Player_Original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);
    }

    void Hook_JoinTribe(AShooterPlayerState* _this, FTribeData* TribeData, bool bMergeTribe, bool bForce)
    {
        // Call original first
        JoinTribe_Original(_this, TribeData, bMergeTribe, bForce);

        if (!_this || !TribeData)
            return;

        try
        {
            uint64 TribeId = TribeData->TribeIDField();
            std::string TribeName = ArkApi::Tools::Utf8Encode(*TribeData->TribeNameField());

            // Try to get Steam ID from player data
            uint64 SteamId = 0;
            FPrimalPlayerDataStruct* PlayerData = _this->MyPlayerDataStructField();
            if (PlayerData)
            {
                // The player's linked ID is usually the Steam ID
                SteamId = _this->TargetingTeamField(); // Use team ID as fallback identifier
            }

            Log::GetLog()->info("Player (team {}) joined tribe {} ({})", SteamId, TribeName, TribeId);

            if (SteamId != 0)
            {
                OnPlayerJoinedTribe(SteamId, TribeId, TribeName);
            }
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Error in Hook_JoinTribe: {}", e.what());
        }
    }

    void Hook_LeaveTribe(AShooterPlayerState* _this, bool bMergeTribe)
    {
        if (!_this)
        {
            LeaveTribe_Original(_this, bMergeTribe);
            return;
        }

        try
        {
            // Get tribe ID before leaving
            uint64 TribeId = _this->TargetingTeamField();

            // Use team ID as player identifier since we can't get Steam ID easily
            uint64 PlayerId = TribeId;

            // Call original
            LeaveTribe_Original(_this, bMergeTribe);

            if (TribeId != 0)
            {
                Log::GetLog()->info("Player left tribe {}", TribeId);
                OnPlayerLeftTribe(PlayerId, TribeId);
            }
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Error in Hook_LeaveTribe: {}", e.what());
            LeaveTribe_Original(_this, bMergeTribe);
        }
    }

    void RegisterHooks()
    {
        Log::GetLog()->info("Registering protection hooks...");

        try
        {
            // Structure damage hook
            ArkApi::GetHooks().SetHook(
                "APrimalStructure.TakeDamage",
                &Hook_TakeDamage_Structure,
                &TakeDamage_Structure_Original
            );
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Failed to set structure damage hook: {}", e.what());
        }

        try
        {
            // Dino damage hook
            ArkApi::GetHooks().SetHook(
                "APrimalDinoCharacter.TakeDamage",
                &Hook_TakeDamage_Dino,
                &TakeDamage_Dino_Original
            );
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Failed to set dino damage hook: {}", e.what());
        }

        try
        {
            // Player damage hook
            ArkApi::GetHooks().SetHook(
                "AShooterCharacter.TakeDamage",
                &Hook_TakeDamage_Player,
                &TakeDamage_Player_Original
            );
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Failed to set player damage hook: {}", e.what());
        }

        try
        {
            // Tribe join hook
            ArkApi::GetHooks().SetHook(
                "AShooterPlayerState.ServerRequestJoinTribe_Implementation",
                &Hook_JoinTribe,
                &JoinTribe_Original
            );
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Failed to set tribe join hook: {}", e.what());
        }

        try
        {
            // Tribe leave hook
            ArkApi::GetHooks().SetHook(
                "AShooterPlayerState.ServerLeaveTribe_Implementation",
                &Hook_LeaveTribe,
                &LeaveTribe_Original
            );
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Failed to set tribe leave hook: {}", e.what());
        }

        Log::GetLog()->info("Protection hooks registered");
    }

    void UnregisterHooks()
    {
        Log::GetLog()->info("Unregistering protection hooks...");

        try
        {
            ArkApi::GetHooks().DisableHook("APrimalStructure.TakeDamage", &Hook_TakeDamage_Structure);
        }
        catch (...) {}

        try
        {
            ArkApi::GetHooks().DisableHook("APrimalDinoCharacter.TakeDamage", &Hook_TakeDamage_Dino);
        }
        catch (...) {}

        try
        {
            ArkApi::GetHooks().DisableHook("AShooterCharacter.TakeDamage", &Hook_TakeDamage_Player);
        }
        catch (...) {}

        try
        {
            ArkApi::GetHooks().DisableHook("AShooterPlayerState.ServerRequestJoinTribe_Implementation", &Hook_JoinTribe);
        }
        catch (...) {}

        try
        {
            ArkApi::GetHooks().DisableHook("AShooterPlayerState.ServerLeaveTribe_Implementation", &Hook_LeaveTribe);
        }
        catch (...) {}

        Log::GetLog()->info("Protection hooks unregistered");
    }
}
}
