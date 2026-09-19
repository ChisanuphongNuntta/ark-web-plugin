#pragma once

#include <API/ARK/Ark.h>
#include <API/UE/Math/ColorList.h>
#include <string>
#include <memory>

#include "Config.h"
#include "HttpClient.h"
#include "DeliveryJournal.h"
#include "WalletNotifications.h"

namespace HeartShop
{
    // Plugin info (defined in HeartShop.cpp)
    extern const char* Version;

    // Global instances (defined in HeartShop.cpp)
    extern std::unique_ptr<Config> PluginConfig;
    extern std::unique_ptr<HttpClient> Http;
    extern std::unique_ptr<DeliveryJournal> Journal;
    extern bool LicenseVerified;

    // Initialize plugin
    void Load();
    void Unload();

    // Core functions
    void PollPendingOrders();
    void PollChatMessages();
    void BroadcastChatMessage(const std::string& Source, const std::string& SenderName, const std::string& Content);

    // Wallet notification sync (consumes wallet.transaction-posted events by polling).
    void PollWalletNotifications();

    // Chat state
    extern std::string LastChatTimestamp;
    extern bool ChatEnabled;

    // Wallet notification sync state
    extern std::string LastWalletEventTimestamp;
    extern WalletNotifications WalletNotifier;

    // Player helpers
    void SendMessage(AShooterPlayerController* Player, const FString& Message);
    void SendAnnouncement(AShooterPlayerController* Player, const FString& Message, float DisplayTime = 15.0f);
    uint64 GetSteamId(AShooterPlayerController* Player);
    bool GiveItemToPlayer(AShooterPlayerController* Player, const FString& Blueprint, int Quantity, float Quality, bool IsBlueprint);

    enum class DeliveryAction
    {
        Execute,
        AcknowledgeOnly,
        // Permanent block: a real integrity problem (payload changed for an existing
        // delivery id). Report with /fail so the backend consumes an attempt and can
        // eventually dead-letter + refund.
        Blocked,
        // Transient block: the plugin could not safely *attempt* the delivery right now
        // (journal not loaded, could not persist the prepared record, or an uncertain
        // prepared record from a prior crash). Nothing was delivered. Return the lease
        // with /release so the backend does NOT consume an attempt and does NOT
        // prematurely dead-letter/refund an order that simply needs a retry.
        Deferred
    };

    DeliveryAction PrepareDelivery(
        const std::string& DeliveryType,
        const std::string& DeliveryId,
        const std::string& Payload);
    bool CompleteDelivery(const std::string& DeliveryType, const std::string& DeliveryId);
    bool AbortDelivery(const std::string& DeliveryType, const std::string& DeliveryId);
    void ConfirmPreparedDinoListing(
        const std::string& AssetLockId,
        const nlohmann::json& Payload,
        uint64 NotifySteamId = 0);
    void RecoverPendingDinoListings();

    // Hook typedefs
    typedef void(*HandleNewPlayer_t)(AShooterGameMode*, AShooterPlayerController*, UPrimalPlayerData*, AShooterCharacter*, bool);
    typedef void(*Logout_t)(AShooterGameMode*, AController*);

    // Hook originals (defined in HeartShop.cpp)
    extern HandleNewPlayer_t AShooterGameMode_HandleNewPlayer_original;
    extern Logout_t AShooterGameMode_Logout_original;

    // Hook functions
    void Hook_AShooterGameMode_HandleNewPlayer(AShooterGameMode* _this, AShooterPlayerController* NewPlayer, UPrimalPlayerData* PlayerData, AShooterCharacter* PlayerCharacter, bool bIsFromLogin);
    void Hook_AShooterGameMode_Logout(AShooterGameMode* _this, AController* Exiting);
}
