#include "HeartShop.h"
#include "Commands.h"
#include "Protection.h"
#include "GameThreadDispatcher.h"
#include "DinoPayload.h"
#include "CatalogDino.h"
#include "ItemDelivery.h"
#include "RequestSigning.h"
#include <algorithm>
#include <Logger/Logger.h>
#include <Windows.h>
#include <filesystem>
#include <stdexcept>
#include <vector>

namespace HeartShop
{
    // Define global variables (declared as extern in HeartShop.h)
    const char* Version = "1.0.0";
    std::unique_ptr<Config> PluginConfig;
    std::unique_ptr<HttpClient> Http;
    std::unique_ptr<DeliveryJournal> Journal;
    bool LicenseVerified = false;

    // Permissions plugin dynamic loading
    typedef TArray<FString>(__cdecl* GetPlayerGroupsFunc)(uint64);
    static GetPlayerGroupsFunc PermissionsGetPlayerGroups = nullptr;
    static bool PermissionsChecked = false;

    // Try to get Permissions API function dynamically
    void TryLoadPermissionsAPI()
    {
        if (PermissionsChecked)
            return;

        PermissionsChecked = true;

        // Try to find the Permissions plugin DLL
        HMODULE hPermissions = GetModuleHandleA("Permissions.dll");
        if (!hPermissions)
        {
            hPermissions = GetModuleHandleA("ArkPermissions.dll");
        }

        if (hPermissions)
        {
            // Get the function pointer - the mangled name may vary
            // Try common name patterns
            PermissionsGetPlayerGroups = (GetPlayerGroupsFunc)GetProcAddress(hPermissions, "?GetPlayerGroups@Permissions@@YA?AV?$TArray@VFString@@VFDefaultAllocator@@@@_K@Z");

            if (PermissionsGetPlayerGroups)
            {
                Log::GetLog()->info("HeartShop: Permissions plugin detected and linked!");
            }
            else
            {
                Log::GetLog()->warn("HeartShop: Permissions DLL found but API not compatible");
            }
        }
        else
        {
            Log::GetLog()->info("HeartShop: Permissions plugin not detected, groups will be empty");
        }
    }

    // Get player groups from Permissions plugin (if available)
    std::vector<std::string> GetPlayerPermissionGroups(uint64 SteamId)
    {
        std::vector<std::string> Groups;

        TryLoadPermissionsAPI();

        if (PermissionsGetPlayerGroups)
        {
            try
            {
                TArray<FString> PermGroups = PermissionsGetPlayerGroups(SteamId);
                for (int i = 0; i < PermGroups.Num(); i++)
                {
                    Groups.push_back(PermGroups[i].ToString());
                }
            }
            catch (...)
            {
                Log::GetLog()->warn("HeartShop: Exception calling Permissions API");
            }
        }

        return Groups;
    }
    HandleNewPlayer_t AShooterGameMode_HandleNewPlayer_original = nullptr;
    Logout_t AShooterGameMode_Logout_original = nullptr;

    // Chat state
    std::string LastChatTimestamp = "";
    bool ChatEnabled = true;

    int CountOnlinePlayers()
    {
        try
        {
            auto* World = ArkApi::GetApiUtils().GetWorld();
            if (!World)
            {
                return 0;
            }

            int Count = 0;
            auto& Players = World->PlayerControllerListField();
            for (int i = 0; i < Players.Num(); i++)
            {
                if (static_cast<AShooterPlayerController*>(Players[i].Get()))
                {
                    Count++;
                }
            }
            return Count;
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->warn("HeartShop heartbeat player count failed: {}", e.what());
        }
        catch (...)
        {
            Log::GetLog()->warn("HeartShop heartbeat player count failed with unknown exception");
        }

        return 0;
    }

    // Wallet notification sync state
    std::string LastWalletEventTimestamp = "";
    WalletNotifications WalletNotifier;

    // Chat message callback function
    DECLARE_HOOK(AShooterGameMode_SendChatMessage, void, AShooterGameMode*, FString*, FString*, EChatSendMode::Type, bool, int, int);

    void Hook_AShooterGameMode_SendChatMessage(AShooterGameMode* _this, FString* Sender, FString* Message, EChatSendMode::Type Mode, bool bAdmin, int SenderSteamID, int SendingTribeID)
    {
        // Call original first
        AShooterGameMode_SendChatMessage_original(_this, Sender, Message, Mode, bAdmin, SenderSteamID, SendingTribeID);

        // Don't process if chat is disabled or not licensed
        if (!ChatEnabled || !LicenseVerified)
            return;

        // Only process global chat
        if (Mode != EChatSendMode::GlobalChat)
            return;

        // Get message content
        std::string SenderName = Sender ? Sender->ToString() : "Unknown";
        std::string Content = Message ? Message->ToString() : "";

        if (Content.empty())
            return;

        // Don't forward command messages
        if (Content[0] == '/')
            return;

        // Get player's permission groups (uses dynamic loading)
        uint64 SteamId64 = static_cast<uint64>(SenderSteamID);
        std::vector<std::string> PlayerGroups = GetPlayerPermissionGroups(SteamId64);

        // Send to cross-chat API with groups
        std::string SteamIdStr = std::to_string(SenderSteamID);
        Http->SendChatMessage(SteamIdStr, SenderName, Content, PlayerGroups, [](bool Success, const nlohmann::json&) {
            if (!Success)
            {
                Log::GetLog()->warn("Failed to send chat message to cross-chat API");
            }
        });
    }

    void ConfirmPreparedDinoListing(
        const std::string& AssetLockId,
        const nlohmann::json& Payload,
        uint64 NotifySteamId)
    {
        if (!Http || !Journal || AssetLockId.empty())
        {
            return;
        }

        nlohmann::json Confirmation = Payload;
        Confirmation["assetLockId"] = AssetLockId;
        Http->ConfirmDinoLock(Confirmation, [AssetLockId, NotifySteamId, Payload](bool Success, const nlohmann::json& Response) {
            if (!Success)
            {
                Log::GetLog()->warn(
                    "Dino listing confirmation {} is pending retry; the removed asset remains protected by the local journal",
                    AssetLockId);
                return;
            }

            if (!Journal || !Journal->Complete("dino_listing", AssetLockId))
            {
                Log::GetLog()->critical(
                    "Dino listing {} was confirmed by backend but local journal completion failed",
                    AssetLockId);
                return;
            }

            const std::string ListingId = Response.value("listingId", "");
            Log::GetLog()->info("Dino listing confirmed: {} (lock {})", ListingId, AssetLockId);
            if (NotifySteamId != 0)
            {
                if (auto* Player = ArkApi::GetApiUtils().FindPlayerFromSteamId(NotifySteamId))
                {
                    const std::string DinoName = Payload.value("dinoName", Payload.value("species", "Dino"));
                    const int Price = Payload.value("price", 0);
                    const std::string Message = "Successfully listed " + DinoName +
                        " for " + std::to_string(Price) + " points!";
                    SendMessage(Player, FString(ArkApi::Tools::Utf8Decode(Message).c_str()));
                }
            }
        });
    }

    void RecoverPendingDinoListings()
    {
        if (!Journal || !Http)
        {
            return;
        }

        for (const auto& Record : Journal->Pending("dino_listing"))
        {
            if (Record.Payload.empty())
            {
                Log::GetLog()->error("Cannot recover dino listing {}: journal payload missing", Record.DeliveryId);
                continue;
            }

            try
            {
                const auto Payload = nlohmann::json::parse(Record.Payload);
                if (Record.State == "prepared")
                {
                    // The journal was durable but mutation was never declared. Keep the
                    // in-game asset and abandon the expiring backend lock.
                    Journal->Abort("dino_listing", Record.DeliveryId);
                    continue;
                }
                if (Record.State != "mutating")
                {
                    continue;
                }

                const unsigned int DinoId1 = Payload.value("dinoId1", 0u);
                const unsigned int DinoId2 = Payload.value("dinoId2", 0u);
                auto* World = ArkApi::GetApiUtils().GetWorld();
                auto* Existing = World && DinoId1 && DinoId2
                    ? APrimalDinoCharacter::FindDinoWithID(World, DinoId1, DinoId2)
                    : nullptr;
                if (Existing)
                {
                    // Crash happened before the destructive mutation. The dino is still
                    // alive, so cancel locally and let the backend lock expire.
                    Journal->Abort("dino_listing", Record.DeliveryId);
                    Log::GetLog()->warn(
                        "Recovered listing lock {} without removing dino; listing cancelled safely",
                        Record.DeliveryId);
                    continue;
                }

                // Dino no longer exists: confirmation is safe and idempotent.
                ConfirmPreparedDinoListing(Record.DeliveryId, Payload);
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->error("Cannot recover dino listing {}: {}", Record.DeliveryId, e.what());
            }
        }
    }

    void Load()
    {
        // IMPORTANT: Must initialize logger FIRST before any Log::GetLog() calls!
        Log::Get().Init("HeartShop");
        Log::GetLog()->info("HeartShop v{} - Initializing...", Version);

        GameThreadDispatcher::Initialize();

        const std::filesystem::path JournalPath =
            std::filesystem::path(ArkApi::Tools::GetCurrentDir()) /
            "ArkApi" / "Plugins" / "HeartShop" / "data" / "delivery-journal.json";
        Journal = std::make_unique<DeliveryJournal>(JournalPath);
        if (!Journal->Load())
        {
            Log::GetLog()->error(
                "Delivery journal could not be loaded; all game deliveries will be blocked");
            Journal.reset();
        }

        // STEP 1: Load Config
        try
        {
            Log::GetLog()->info("HeartShop: Loading config...");
            PluginConfig = std::make_unique<Config>();
            if (!PluginConfig->Load())
            {
                Log::GetLog()->error("Failed to load config!");
            }
            Log::GetLog()->info("HeartShop: Config loaded");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Config exception: {}", e.what());
        }

        // STEP 2: Create HTTP Client
        try
        {
            Log::GetLog()->info("HeartShop: Creating HTTP client...");
            std::string apiUrl = PluginConfig ? PluginConfig->GetApiUrl() : "";
            std::string apiKey = PluginConfig ? PluginConfig->GetApiKey() : "";
            std::string keyId = PluginConfig ? PluginConfig->GetKeyId() : "";
            int serverId = PluginConfig ? PluginConfig->GetServerId() : 1;
            bool allowInvalidCertificates = PluginConfig
                ? PluginConfig->GetAllowInvalidCertificates()
                : false;
            Http = std::make_unique<HttpClient>(
                apiUrl,
                apiKey,
                keyId,
                serverId,
                allowInvalidCertificates);
            Log::GetLog()->info("HeartShop: HTTP client created");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("HTTP client exception: {}", e.what());
        }

        // STEP 3: Verify License
        try
        {
            Log::GetLog()->info("HeartShop: Verifying license...");
            Http->VerifyLicense([](bool Success, const nlohmann::json& Response) {
                if (Success)
                {
                    try
                    {
                        // Check if this is an error response from backend
                        if (Response.contains("error"))
                        {
                            LicenseVerified = false;
                            std::string errorMsg = Response.value("error", "Unknown error");
                            Log::GetLog()->error("License verification FAILED: {}", errorMsg);
                            return;
                        }
                        if (Response.contains("message") && !Response.contains("valid"))
                        {
                            LicenseVerified = false;
                            std::string errorMsg = Response.value("message", "Unknown error");
                            Log::GetLog()->error("License verification FAILED: {}", errorMsg);
                            return;
                        }

                        bool valid = Response.value("valid", false);
                        std::string serverName = Response.value("serverName", "Unknown");
                        std::string expiresAt = Response.value("expiresAt", "N/A");

                        if (valid)
                        {
                            LicenseVerified = true;
                            Log::GetLog()->info("License VERIFIED successfully!");
                            Log::GetLog()->info("  Server: {}", serverName);
                            Log::GetLog()->info("  Expires: {}", expiresAt);
                        }
                        else
                        {
                            LicenseVerified = false;
                            std::string reason = Response.value("reason", "Invalid license");
                            Log::GetLog()->error("License verification FAILED: {}", reason);
                        }
                    }
                    catch (const std::exception& e)
                    {
                        LicenseVerified = false;
                        Log::GetLog()->error("License response parse error: {}", e.what());
                    }
                }
                else
                {
                    LicenseVerified = false;
                    Log::GetLog()->error("License verification FAILED: Could not connect to server");
                }
            });
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("License verification exception: {}", e.what());
        }

        // STEP 4: Register Commands
        try
        {
            Log::GetLog()->info("HeartShop: Registering commands...");
            Commands::Register();
            Log::GetLog()->info("HeartShop: Commands registered");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Commands exception: {}", e.what());
        }

        // STEP 5: Setup Order Polling Timer
        try
        {
            int pollInterval = PluginConfig ? PluginConfig->GetPollInterval() : 30;
            Log::GetLog()->info("HeartShop: Setting up order polling (every {}s)...", pollInterval);

            // Add timer callback for polling orders (called every second)
            ArkApi::GetCommands().AddOnTimerCallback(
                L"HeartShop_PollOrders",
                [](){
                    static int secondsCounter = 0;
                    static int pollIntervalSec = PluginConfig ? PluginConfig->GetPollInterval() : 30;

                    secondsCounter++;
                    if (secondsCounter >= pollIntervalSec)
                    {
                        secondsCounter = 0;
                        if (LicenseVerified)
                        {
                            PollPendingOrders();
                            RecoverPendingDinoListings();
                        }
                    }
                }
            );

            Log::GetLog()->info("HeartShop: Order polling timer started");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Timer setup exception: {}", e.what());
        }

        // STEP 6: Setup Chat Polling Timer (every 3 seconds)
        try
        {
            Log::GetLog()->info("HeartShop: Setting up cross-chat polling (every 3s)...");

            ArkApi::GetCommands().AddOnTimerCallback(
                L"HeartShop_PollChat",
                [](){
                    static int chatCounter = 0;
                    chatCounter++;
                    if (chatCounter >= 3) // Every 3 seconds
                    {
                        chatCounter = 0;
                        if (LicenseVerified && ChatEnabled)
                        {
                            PollChatMessages();
                        }
                    }
                }
            );

            Log::GetLog()->info("HeartShop: Chat polling timer started");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Chat timer setup exception: {}", e.what());
        }

        // STEP 6b: Setup Wallet Notification Sync Timer (every 5 seconds)
        try
        {
            Log::GetLog()->info("HeartShop: Setting up wallet notification sync (every 5s)...");

            ArkApi::GetCommands().AddOnTimerCallback(
                L"HeartShop_PollWalletEvents",
                [](){
                    static int walletCounter = 0;
                    walletCounter++;
                    if (walletCounter >= 5) // Every 5 seconds
                    {
                        walletCounter = 0;
                        if (LicenseVerified)
                        {
                            PollWalletNotifications();
                        }
                    }
                }
            );

            Log::GetLog()->info("HeartShop: Wallet notification sync timer started");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Wallet sync timer setup exception: {}", e.what());
        }

        // STEP 7: Setup signed heartbeat timer for backend/server visibility
        try
        {
            int heartbeatInterval = PluginConfig ? static_cast<int>(PluginConfig->GetHeartbeatInterval()) : 60;
            if (heartbeatInterval <= 0)
            {
                heartbeatInterval = 60;
            }

            Log::GetLog()->info("HeartShop: Setting up heartbeat (every {}s)...", heartbeatInterval);

            ArkApi::GetCommands().AddOnTimerCallback(
                L"HeartShop_Heartbeat",
                [heartbeatInterval]() {
                    static int heartbeatCounter = heartbeatInterval;
                    heartbeatCounter++;
                    if (heartbeatCounter >= heartbeatInterval)
                    {
                        heartbeatCounter = 0;

                        if (!Http)
                        {
                            Log::GetLog()->warn("HeartShop heartbeat skipped: HTTP client not initialized");
                            return;
                        }

                        // Game thread: resolve the cryopod class before the heartbeat so the
                        // cryopod capability is only advertised when this server can make pods.
                        RefreshCryopodCapability();

                        Http->SendHeartbeat(CountOnlinePlayers(), [](bool Success, const nlohmann::json&) {
                            static bool LoggedSuccess = false;
                            if (Success)
                            {
                                if (!LoggedSuccess)
                                {
                                    Log::GetLog()->info("HeartShop heartbeat sent successfully");
                                    LoggedSuccess = true;
                                }
                            }
                            else
                            {
                                Log::GetLog()->warn("HeartShop heartbeat failed");
                            }
                        });
                    }
                }
            );

            Log::GetLog()->info("HeartShop: Heartbeat timer started");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Heartbeat timer setup exception: {}", e.what());
        }

        // STEP 7: Register Chat Hook
        try
        {
            Log::GetLog()->info("HeartShop: Registering chat hook...");
            ArkApi::GetHooks().SetHook(
                "AShooterGameMode.SendChatMessage",
                &Hook_AShooterGameMode_SendChatMessage,
                &AShooterGameMode_SendChatMessage_original
            );
            Log::GetLog()->info("HeartShop: Chat hook registered");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Chat hook exception: {}", e.what());
        }

        // STEP 8: Protection System
        try
        {
            Log::GetLog()->info("HeartShop: Initializing protection system...");
            Protection::Init();
            Protection::RegisterHooks();
            Log::GetLog()->info("HeartShop: Protection system initialized");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Protection exception: {}", e.what());
        }

        // STEP 9: Player Join/Logout Hooks
        try
        {
            ArkApi::GetHooks().SetHook(
                "AShooterGameMode.HandleNewPlayer_Implementation",
                &Hook_AShooterGameMode_HandleNewPlayer,
                &AShooterGameMode_HandleNewPlayer_original
            );
            Log::GetLog()->info("HeartShop: HandleNewPlayer hook registered");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("HandleNewPlayer hook exception: {}", e.what());
        }

        try
        {
            ArkApi::GetHooks().SetHook(
                "AShooterGameMode.Logout",
                &Hook_AShooterGameMode_Logout,
                &AShooterGameMode_Logout_original
            );
            Log::GetLog()->info("HeartShop: Logout hook registered");
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Logout hook exception: {}", e.what());
        }

        try
        {
            Log::GetLog()->info("HeartShop initialized successfully!");
        }
        catch (...)
        {
            // Ignore
        }
    }

    void Unload()
    {
        try
        {
            Log::GetLog()->info("HeartShop - Unloading...");
        }
        catch (...) {}

        // Remove timer callbacks
        try
        {
            ArkApi::GetCommands().RemoveOnTimerCallback(L"HeartShop_PollOrders");
            ArkApi::GetCommands().RemoveOnTimerCallback(L"HeartShop_PollChat");
            ArkApi::GetCommands().RemoveOnTimerCallback(L"HeartShop_PollWalletEvents");
            Log::GetLog()->info("HeartShop: Timers removed");
        }
        catch (...) {}

        // Stop new HTTP callbacks before clearing queued game-thread work.
        Http.reset();
        GameThreadDispatcher::Shutdown();
        Journal.reset();

        // Remove chat hook
        try
        {
            ArkApi::GetHooks().DisableHook(
                "AShooterGameMode.SendChatMessage",
                &Hook_AShooterGameMode_SendChatMessage
            );
            Log::GetLog()->info("HeartShop: Chat hook removed");
        }
        catch (...) {}

        // Unregister commands
        try
        {
            Commands::Unregister();
            Log::GetLog()->info("HeartShop: Commands unregistered");
        }
        catch (...) {}

        // Protection cleanup
        try
        {
            Protection::UnregisterHooks();
            Protection::Cleanup();
            Log::GetLog()->info("HeartShop: Protection cleaned up");
        }
        catch (...) {}

        // Remove player hooks
        try
        {
            ArkApi::GetHooks().DisableHook(
                "AShooterGameMode.HandleNewPlayer_Implementation",
                &Hook_AShooterGameMode_HandleNewPlayer
            );
        }
        catch (...) {}

        try
        {
            ArkApi::GetHooks().DisableHook(
                "AShooterGameMode.Logout",
                &Hook_AShooterGameMode_Logout
            );
        }
        catch (...) {}

        try
        {
            Log::GetLog()->info("HeartShop unloaded!");
        }
        catch (...) {}
    }

    bool SpawnExactDinoForPlayer(
        AShooterPlayerController* Player,
        const nlohmann::json& Payload)
    {
        if (!Player || !Player->GetPlayerCharacter())
            return false;

        try
        {
            if (Payload.value("schemaVersion", 0) != 2 ||
                Payload.value("dinoDataVersion", 0) != 1)
            {
                Log::GetLog()->error("Rejected non-native dino delivery payload version");
                return false;
            }

            const std::string Encoded = Payload.value("cryopodData", "");
            const std::string ExpectedHash = Payload.value("dinoDataSha256", "");
            const int ExpectedSize = Payload.value("dinoDataSize", 0);
            std::vector<unsigned char> NativeBytes;
            if (!DinoPayload::DecodeBase64(Encoded, NativeBytes) ||
                ExpectedSize <= 0 ||
                static_cast<std::size_t>(ExpectedSize) != NativeBytes.size())
            {
                Log::GetLog()->error("Rejected malformed native dino delivery payload");
                return false;
            }

            const std::string NativeBytesString(
                reinterpret_cast<const char*>(NativeBytes.data()),
                NativeBytes.size());
            if (ExpectedHash.size() != 64 ||
                RequestSigning::CalculateSha256Hex(NativeBytesString) != ExpectedHash)
            {
                Log::GetLog()->critical("Native dino delivery SHA-256 mismatch");
                return false;
            }

            const std::string BlueprintPath = Payload.value("blueprintPath", "");
            FString Blueprint(ArkApi::Tools::Utf8Decode(BlueprintPath).c_str());
            UClass* DinoClass = UVictoryCore::BPLoadClass(&Blueprint);
            if (!DinoClass)
            {
                Log::GetLog()->error("Could not load native dino class: {}", BlueprintPath);
                return false;
            }

            FARKDinoData NativeData{};
            NativeData.DinoClass = DinoClass;
            for (const auto Byte : NativeBytes)
            {
                NativeData.DinoData.Add(Byte);
            }
            NativeData.DinoName = FString(ArkApi::Tools::Utf8Decode(
                Payload.value("nativeDinoName", Payload.value("dinoName", ""))).c_str());
            NativeData.DinoNameInMap = FString(ArkApi::Tools::Utf8Decode(
                Payload.value("nativeDinoNameInMap", Payload.value("species", ""))).c_str());

            FVector SpawnLocation = Player->GetPlayerCharacter()
                ->RootComponentField()->RelativeLocationField();
            SpawnLocation.Z += 200.0f;
            FRotator SpawnRotation(0.0f, 0.0f, 0.0f);
            bool WasDuplicate = false;
            APrimalDinoCharacter* Dino = APrimalDinoCharacter::SpawnFromDinoDataEx(
                &NativeData,
                ArkApi::GetApiUtils().GetWorld(),
                &SpawnLocation,
                &SpawnRotation,
                &WasDuplicate,
                Player->TargetingTeamField(),
                true,
                Player,
                true);
            if (!Dino || !Dino->IsValidLowLevel())
            {
                Log::GetLog()->error("ARK rejected native dino snapshot for {}", BlueprintPath);
                return false;
            }

            Log::GetLog()->info(
                "Restored native dino snapshot {} for SteamID {} (newDinoId=true, duplicate={})",
                BlueprintPath,
                GetSteamId(Player),
                WasDuplicate ? "true" : "false");

            return true;
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Exception in SpawnExactDinoForPlayer: {}", e.what());
            return false;
        }
    }

    static UClass* LoadClassFromUtf8(const std::string& Path)
    {
        FString Blueprint(ArkApi::Tools::Utf8Decode(Path).c_str());
        return UVictoryCore::BPLoadClass(&Blueprint);
    }

    // True when Class is a UPrimalItem subclass, so it is safe to hand to
    // UPrimalItem::AddNewItem / IncrementItemTemplateQuantity.
    static bool IsItemClass(UClass* Class)
    {
        UClass* ItemBase = UPrimalItem::StaticClass();
        return Class && (!ItemBase || Class->IsChildOf(ItemBase));
    }

    // Writes a blueprint variable on an actor by name. Done by hand because the
    // SDK's UProperty::Set offsets a UObject* (pointer arithmetic in sizeof
    // units) and checks UObject's own class instead of the actor's. Only
    // 1-byte (bool/byte) and 4-byte (int) properties are written.
    static bool WriteBlueprintVariable(UObject* Object, const char* Name, const int Value)
    {
        UProperty* Property = Object->FindProperty(FName(Name, EFindName::FNAME_Find));
        if (!Property)
        {
            return false;
        }
        char* Address = reinterpret_cast<char*>(Object) + Property->Offset_InternalField();
        switch (Property->ElementSizeField())
        {
            case 1: *reinterpret_cast<unsigned char*>(Address) = static_cast<unsigned char>(Value); return true;
            case 4: *reinterpret_cast<int*>(Address) = Value; return true;
            default: return false;
        }
    }

    // ArkShop HandleStryder: swap the Tek Stryder's default head/chest attachment
    // for the bought one. False only when an attachment existed and could not be
    // replaced (the caller then treats the spawn as failed).
    static bool ReplaceStryderAttachment(
        APrimalDinoCharacter* Dino,
        const EPrimalEquipmentType::Type Slot,
        const char* AttachmentBlueprint,
        const char* SetVariable,
        const char* IndexVariable,
        const int Index)
    {
        UPrimalInventoryComponent* DinoInventory = Dino->MyInventoryComponentField();
        if (!DinoInventory || !AttachmentBlueprint)
        {
            return false;
        }
        UPrimalItem* Current = DinoInventory->GetEquippedItemOfType(Slot);
        if (!Current)
        {
            // Same as ArkShop: nothing equipped in that slot, nothing to replace.
            return true;
        }
        UClass* AttachmentClass = LoadClassFromUtf8(AttachmentBlueprint);
        if (!IsItemClass(AttachmentClass))
        {
            Log::GetLog()->error("Could not load Tek Stryder attachment {}", AttachmentBlueprint);
            return false;
        }
        Current->bForceDropDestruction() = true;
        Current->RemoveItemFromInventory(true, false);
        UPrimalItem* Attachment = UPrimalItem::AddNewItem(
            AttachmentClass, DinoInventory, true, true, 1, true, 1, false, 0, false, nullptr, 0, false, false);
        if (!Attachment)
        {
            return false;
        }
        if (!WriteBlueprintVariable(Dino, SetVariable, 1) || !WriteBlueprintVariable(Dino, IndexVariable, Index))
        {
            Log::GetLog()->warn(
                "Tek Stryder attachment {} equipped but blueprint variables '{}'/'{}' were not found",
                AttachmentBlueprint, SetVariable, IndexVariable);
        }
        return true;
    }

    // Optional ArkShop GiveDino extras that act on the freshly spawned actor
    // (gender, Tek Stryder attachments). Saddles are handled by the caller
    // (inside the cryopod, or equipped on a live tame).
    static bool ApplyCatalogDinoExtras(APrimalDinoCharacter* Dino, const CatalogDino::Request& Request)
    {
        if (Request.Sex != CatalogDino::Gender::Random && Dino->bUsesGender()())
        {
            Dino->bIsFemale() = (Request.Sex == CatalogDino::Gender::Female);
        }

        if (CatalogDino::IsTekStryderBlueprint(Request.Blueprint))
        {
            if (Request.StryderHead != CatalogDino::StryderAttachmentNone &&
                !ReplaceStryderAttachment(
                    Dino, EPrimalEquipmentType::Hat, CatalogDino::StryderHeadBlueprint(Request.StryderHead),
                    "set head attachment", "head attachment index", Request.StryderHead))
            {
                return false;
            }
            if (Request.StryderChest != CatalogDino::StryderAttachmentNone &&
                !ReplaceStryderAttachment(
                    Dino, EPrimalEquipmentType::Shirt, CatalogDino::StryderChestBlueprint(Request.StryderChest),
                    "set chest attachment", "chest attachment index", Request.StryderChest))
            {
                return false;
            }
        }
        return true;
    }

    // Equips a saddle on a live tame (ArkShop only puts saddles in cryopods; for
    // a live delivery the buyer gets it on the dino). Falls back to the buyer's
    // inventory; logs when neither accepted it (the dino is still delivered).
    static void GiveSaddleWithLiveTame(
        AShooterPlayerController* Player,
        APrimalDinoCharacter* Dino,
        UClass* SaddleClass,
        const std::string& SaddleBlueprint)
    {
        if (!SaddleClass)
        {
            return;
        }
        UPrimalInventoryComponent* DinoInventory =
            (Dino && Dino->IsValidLowLevel()) ? Dino->MyInventoryComponentField() : nullptr;
        if (DinoInventory &&
            UPrimalItem::AddNewItem(SaddleClass, DinoInventory, true, true, 0, true, 1, false, 0, false, nullptr, 0, false, false))
        {
            return;
        }
        AShooterCharacter* Character = Player ? Player->GetPlayerCharacter() : nullptr;
        UPrimalInventoryComponent* PlayerInventory = Character ? Character->MyInventoryComponentField() : nullptr;
        if (PlayerInventory &&
            UPrimalItem::AddNewItem(SaddleClass, PlayerInventory, false, false, 0, true, 1, false, 0, false, nullptr, 0, false, false))
        {
            Log::GetLog()->warn("Saddle {} could not be equipped on the live tame; placed in the buyer inventory", SaddleBlueprint);
            return;
        }
        Log::GetLog()->critical(
            "Saddle {} could not be equipped on the live tame nor placed in the buyer inventory (SteamID {})",
            SaddleBlueprint, GetSteamId(Player));
    }

    // Catalog spawn: force-tamed for the buyer's team next to the buyer (the
    // pre-cryopod call, unchanged), then the optional extras. If an extra cannot
    // be applied the actor is destroyed and nullptr returned (nothing given).
    static APrimalDinoCharacter* SpawnCatalogDinoActor(
        AShooterPlayerController* Player,
        const CatalogDino::Request& Request)
    {
        FString Blueprint(ArkApi::Tools::Utf8Decode(Request.Blueprint).c_str());
        auto* Dino = ArkApi::GetApiUtils().SpawnDino(
            Player,
            Blueprint,
            nullptr,
            Request.Level,
            true,
            Request.Neutered);
        if (!Dino || !Dino->IsValidLowLevel())
        {
            Log::GetLog()->error("ARK rejected catalog dino {} level {}", Request.Blueprint, Request.Level);
            return nullptr;
        }
        if (!ApplyCatalogDinoExtras(Dino, Request))
        {
            Log::GetLog()->error(
                "Catalog dino {} extras (stryderHead={}, stryderChest={}) could not be applied; spawn removed",
                Request.Blueprint, Request.StryderHead, Request.StryderChest);
            if (!(Dino->Destroy(true, false) || Dino->IsPendingKillPending()))
            {
                // The tame survives: it is the delivery (without the extra).
                Log::GetLog()->critical("Catalog dino {} could not be removed after a failed extra; delivered as is",
                    Request.Blueprint);
                return Dino;
            }
            return nullptr;
        }
        return Dino;
    }

    // Cryopod custom data for a live dino. Mirrors ArkShop::GetDinoCustomItemData
    // (non-modded branch) from ASE-Plugins-master/ArkShop, which is the layout the
    // vanilla Extinction cryopod reads back when the dino is released. When Saddle
    // is given its item bytes follow the dino bytes (ByteArrays[1]), exactly like
    // ArkShop, so the saddle comes out equipped when the pod is released.
    // No durability/cryo-sickness limits are applied.
    static FCustomItemData BuildCryopodCustomData(APrimalDinoCharacter* Dino, UPrimalItem* Saddle)
    {
        FCustomItemData Data;

        FARKDinoData DinoData;
        Dino->GetDinoData(&DinoData);

        Data.CustomDataName = FName("Dino", EFindName::FNAME_Add);
        Data.CustomDataNames.Add(FName("MissionTemporary", EFindName::FNAME_Add));
        Data.CustomDataNames.Add(FName("None", EFindName::FNAME_Find));

        UPrimalCharacterStatusComponent* Status = Dino->MyCharacterStatusComponentField();
        if (!Status)
        {
            throw std::runtime_error("spawned dino has no status component");
        }

        float* Current = Status->CurrentStatusValuesField()();
        float* Max = Status->MaxStatusValuesField()();
        const EPrimalCharacterStatusValue::Type StatOrder[] = {
            EPrimalCharacterStatusValue::Health,
            EPrimalCharacterStatusValue::Stamina,
            EPrimalCharacterStatusValue::Torpidity,
            EPrimalCharacterStatusValue::Oxygen,
            EPrimalCharacterStatusValue::Food,
            EPrimalCharacterStatusValue::Water,
            EPrimalCharacterStatusValue::Temperature,
            EPrimalCharacterStatusValue::Weight,
            EPrimalCharacterStatusValue::MeleeDamageMultiplier,
            EPrimalCharacterStatusValue::SpeedMultiplier,
            EPrimalCharacterStatusValue::TemperatureFortitude,
            EPrimalCharacterStatusValue::CraftingSpeedMultiplier,
        };
        for (const auto Stat : StatOrder) Data.CustomDataFloats.Add(Current[Stat]);
        for (const auto Stat : StatOrder) Data.CustomDataFloats.Add(Max[Stat]);
        Data.CustomDataFloats.Add(Dino->bIsFemale()() ? 1.0f : 0.0f);

        const double Now = static_cast<double>(ArkApi::GetApiUtils().GetWorld()->TimeSecondsField());
        Data.CustomDataDoubles.Doubles.Add(Now);
        Data.CustomDataDoubles.Doubles.Add(static_cast<double>(Dino->BabyNextCuddleTimeField()) - Now);
        Data.CustomDataDoubles.Doubles.Add(static_cast<double>(Dino->NextAllowedMatingTimeField()));
        Data.CustomDataDoubles.Doubles.Add(static_cast<double>(Dino->RandomMutationsMaleField()));
        Data.CustomDataDoubles.Doubles.Add(static_cast<double>(Dino->RandomMutationsFemaleField()));
        Data.CustomDataDoubles.Doubles.Add(static_cast<double>(Status->DinoImprintingQualityField()));

        FString ColorIndices;
        Dino->GetColorSetInidcesAsString(&ColorIndices);
        Data.CustomDataStrings.Add(DinoData.DinoNameInMap);
        Data.CustomDataStrings.Add(DinoData.DinoName);
        Data.CustomDataStrings.Add(ColorIndices);
        Data.CustomDataStrings.Add(Dino->bNeutered()() ? FString("NEUTERED") : FString(""));
        Data.CustomDataStrings.Add(Dino->bIsFemale()() ? FString("FEMALE") : FString("Male"));

        Data.CustomDataClasses.Add(DinoData.DinoClass);

        FCustomItemByteArray DinoBytes;
        DinoBytes.Bytes = DinoData.DinoData;
        if (DinoBytes.Bytes.Num() <= 0)
        {
            throw std::runtime_error("spawned dino produced an empty native snapshot");
        }
        Data.CustomDataBytes.ByteArrays.Add(DinoBytes);

        if (Saddle)
        {
            FCustomItemByteArray SaddleBytes;
            Saddle->GetItemBytes(&SaddleBytes.Bytes);
            if (SaddleBytes.Bytes.Num() <= 0)
            {
                throw std::runtime_error("saddle item produced no item bytes");
            }
            Data.CustomDataBytes.ByteArrays.Add(SaddleBytes);
        }
        return Data;
    }

    // ---- Native fault guard for the cryopod path -------------------------------
    // The plugin is built with /EHsc, so catch(...) does NOT see SEH faults such as
    // an access violation inside a NativeCall (GetDinoData, SetCustomItemData,
    // AddItemObject, Destroy, ...). Each native cryopod step therefore runs through
    // CallWithSehGuard, which converts a native fault into a failed step (logged as
    // critical) instead of crashing the live server. The frame holding __try must
    // not contain C++ objects with destructors, hence the plain thunk signature.
    // Caveat: after a converted fault, destructors of objects inside the faulting
    // step may not have run (a small leak is accepted over a server crash), and the
    // step's partial effect is unknown; the runner's ordering keeps the buyer from
    // receiving two assets either way.
    using NativeStepThunk = bool (*)(void* Context);

    static bool CallWithSehGuard(const NativeStepThunk Thunk, void* Context, unsigned long* FaultCode)
    {
        __try
        {
            return Thunk(Context);
        }
        __except (EXCEPTION_EXECUTE_HANDLER)
        {
            *FaultCode = GetExceptionCode();
            return false;
        }
    }

    struct GuardedStepContext
    {
        const std::function<bool()>* Step;
        const char* Name;
    };

    static bool InvokeGuardedStep(void* Context)
    {
        const auto* Guarded = static_cast<GuardedStepContext*>(Context);
        try
        {
            return (*Guarded->Step)();
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Catalog dino cryopod step '{}' threw: {}", Guarded->Name, e.what());
            return false;
        }
        catch (...)
        {
            Log::GetLog()->error("Catalog dino cryopod step '{}' threw an unknown exception", Guarded->Name);
            return false;
        }
    }

    // Runs Step now; C++ exceptions and native (SEH) faults both become `false`.
    static bool RunNativeStep(const char* Name, const std::function<bool()>& Step)
    {
        GuardedStepContext Context{&Step, Name};
        unsigned long FaultCode = 0;
        const bool Ok = CallWithSehGuard(&InvokeGuardedStep, &Context, &FaultCode);
        if (FaultCode != 0)
        {
            Log::GetLog()->critical(
                "Native fault 0x{:08X} in catalog dino cryopod step '{}' was contained; step treated as failed",
                FaultCode,
                Name);
            return false;
        }
        return Ok;
    }

    static UClass* LoadCryopodItemClass()
    {
        FString CryopodPath(CatalogDino::CryopodItemBlueprint);
        return UVictoryCore::BPLoadClass(&CryopodPath);
    }

    // Resolves the cryopod item class on the game thread and publishes the result
    // to the heartbeat (delivery.dino.cryopod.v1 is only advertised once it loads).
    // Called before every heartbeat until it succeeds; once it has succeeded the
    // capability stays on. Only the availability is cached, never the UClass
    // pointer: delivery re-resolves it, so a GC'd class can never be dereferenced.
    void RefreshCryopodCapability()
    {
        if (CatalogDino::IsCryopodDeliveryAvailable())
        {
            return;
        }

        UClass* CryopodClass = nullptr;
        const bool Ran = RunNativeStep("resolve cryopod class", [&CryopodClass]() {
            CryopodClass = LoadCryopodItemClass();
            return CryopodClass != nullptr;
        });

        static bool LoggedFailure = false;
        if (Ran && CryopodClass)
        {
            CatalogDino::SetCryopodDeliveryAvailable(true);
            Log::GetLog()->info(
                "Cryopod item class resolved; advertising {} (catalog dinos are delivered in cryopods)",
                CatalogDino::CryopodCapability);
        }
        else if (!LoggedFailure)
        {
            LoggedFailure = true;
            Log::GetLog()->warn(
                "Cryopod item class {} could not be loaded; {} not advertised, catalog dinos keep the live spawn",
                CatalogDino::CryopodItemBlueprint,
                CatalogDino::CryopodCapability);
        }
    }

    struct CatalogDinoDelivery
    {
        CatalogDino::Outcome Outcome = CatalogDino::Outcome::Failed;
        bool CryopodRequested = false;
        bool InventoryFull = false;
        int Level = 0;
        std::string Error;
    };

    // Delivers a `dino_catalog` payload. Runs on the game thread inside the
    // journal's mutating window (PrepareDelivery -> MarkMutating already done by
    // the caller), so a re-sent/acknowledged delivery never reaches this again.
    CatalogDinoDelivery DeliverCatalogDinoForPlayer(
        AShooterPlayerController* Player,
        const nlohmann::json& Payload)
    {
        CatalogDinoDelivery Result;

        CatalogDino::Request Request;
        if (!Player || !Player->GetPlayerCharacter())
        {
            Result.Error = "Player is not spawned";
            return Result;
        }
        if (!CatalogDino::ParseRequest(Payload, Request, Result.Error))
        {
            Log::GetLog()->error("Rejected catalog dino delivery payload: {}", Result.Error);
            Result.Error = "Rejected catalog dino payload: " + Result.Error;
            return Result;
        }
        Result.Level = Request.Level;
        Result.CryopodRequested = Request.Cryopod;

        // Optional saddle: resolved before anything is touched so a bad blueprint
        // fails the delivery (nothing given) instead of silently dropping it.
        UClass* SaddleClass = nullptr;
        if (!Request.SaddleBlueprint.empty())
        {
            const bool Ran = RunNativeStep("resolve saddle class", [&]() {
                SaddleClass = LoadClassFromUtf8(Request.SaddleBlueprint);
                return IsItemClass(SaddleClass);
            });
            if (!Ran || !SaddleClass)
            {
                Log::GetLog()->error("Could not load catalog dino saddle class {}", Request.SaddleBlueprint);
                Result.Error = "Could not load saddle item class";
                return Result;
            }
        }

        if (!Request.Cryopod)
        {
            try
            {
                if (APrimalDinoCharacter* LiveDino = SpawnCatalogDinoActor(Player, Request))
                {
                    GiveSaddleWithLiveTame(Player, LiveDino, SaddleClass, Request.SaddleBlueprint);
                    Log::GetLog()->info(
                        "Spawned catalog dino {} level {} for SteamID {} (neutered={}, gender={}, saddle={})",
                        Request.Blueprint,
                        Request.Level,
                        GetSteamId(Player),
                        Request.Neutered ? "true" : "false",
                        CatalogDino::GenderName(Request.Sex),
                        Request.SaddleBlueprint.empty() ? "none" : Request.SaddleBlueprint);
                    Result.Outcome = CatalogDino::Outcome::DeliveredAsLiveTame;
                }
                else
                {
                    Result.Error = "Catalog dino spawn failed";
                }
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->error("Catalog dino spawn exception: {}", e.what());
                Result.Error = std::string("Catalog dino spawn exception: ") + e.what();
            }
            return Result;
        }

        UPrimalInventoryComponent* Inventory = nullptr;
        UClass* CryopodClass = nullptr;
        APrimalDinoCharacter* Dino = nullptr;
        UPrimalItem* Cryopod = nullptr;

        CatalogDino::CryopodSteps Steps;
        Steps.Preflight = [&](std::string& Error) {
            CatalogDino::PreflightResult Preflight = CatalogDino::PreflightResult::Fail;
            const bool Ran = RunNativeStep("preflight", [&]() {
                AShooterCharacter* Character = Player->GetPlayerCharacter();
                Inventory = Character ? Character->MyInventoryComponentField() : nullptr;
                if (!Inventory || !Inventory->IsValidLowLevel())
                {
                    // Transient (character mid-respawn): retry later without using an attempt.
                    Inventory = nullptr;
                    Error = "Player has no inventory yet; cryopod delivery deferred";
                    Preflight = CatalogDino::PreflightResult::Defer;
                    return true;
                }
                if (Inventory->IsAtMaxInventoryItems())
                {
                    Result.InventoryFull = true;
                    Error = "Player inventory is full; cryopod delivery deferred until a slot is free";
                    Preflight = CatalogDino::PreflightResult::Defer;
                    return true;
                }
                CryopodClass = LoadCryopodItemClass();
                if (!CryopodClass)
                {
                    // Permanent for this server: never burn retries on it.
                    Error = "Could not load cryopod item class";
                    Preflight = CatalogDino::PreflightResult::FallbackToLiveSpawn;
                    return true;
                }
                Preflight = CatalogDino::PreflightResult::Ready;
                return true;
            });
            if (!Ran)
            {
                Error = "Cryopod delivery preflight faulted";
                return CatalogDino::PreflightResult::Fail;
            }
            return Preflight;
        };
        Steps.SpawnDino = [&]() {
            return RunNativeStep("spawn dino", [&]() {
                Dino = SpawnCatalogDinoActor(Player, Request);
                return Dino != nullptr;
            });
        };
        Steps.BuildCryopod = [&]() {
            return RunNativeStep("build cryopod", [&]() {
                if (!Dino || !Dino->IsValidLowLevel() || !CryopodClass)
                {
                    return false;
                }
                Cryopod = UPrimalItem::AddNewItem(
                    CryopodClass, nullptr, false, false, 0, false, 0, false, 0, false, nullptr, 0, false, false);
                if (!Cryopod)
                {
                    return false;
                }
                // ArkShop GiveDino: a loose saddle item (no inventory) whose bytes
                // ride inside the pod; unreferenced afterwards, collected by GC.
                UPrimalItem* Saddle = nullptr;
                if (SaddleClass)
                {
                    Saddle = UPrimalItem::AddNewItem(
                        SaddleClass, nullptr, false, false, 0, false, 0, false, 0, false, nullptr, 0, false, false);
                    if (!Saddle)
                    {
                        Log::GetLog()->error("Could not create saddle item {} for the cryopod", Request.SaddleBlueprint);
                        return false;
                    }
                }
                FCustomItemData CustomData = BuildCryopodCustomData(Dino, Saddle);
                Cryopod->SetCustomItemData(&CustomData);
                Cryopod->UpdatedItem(true);
                return true;
            });
        };
        Steps.DestroyDino = [&]() {
            return RunNativeStep("destroy dino", [&]() {
                if (!Dino)
                {
                    return true;
                }
                if (!Dino->IsValidLowLevel())
                {
                    return false;
                }
                const bool Destroyed = Dino->Destroy(true, false) || Dino->IsPendingKillPending();
                if (Destroyed)
                {
                    Dino = nullptr;
                }
                return Destroyed;
            });
        };
        Steps.AddCryopodToInventory = [&]() {
            return RunNativeStep("add cryopod to inventory", [&]() {
                if (!Cryopod || !Inventory || !Inventory->IsValidLowLevel())
                {
                    Log::GetLog()->error("Cryopod or player inventory became invalid before the cryopod was added");
                    return false;
                }
                if (!Inventory->AddItemObject(Cryopod))
                {
                    // The tame was already destroyed; record the capacity so a Failed
                    // result after the destroy can be diagnosed (the retry spawns again).
                    Log::GetLog()->error(
                        "AddItemObject refused the cryopod: inventory items={} max={} atMax={}",
                        Inventory->InventoryItemsField().Num(),
                        Inventory->GetMaxInventoryItems(false),
                        Inventory->IsAtMaxInventoryItems() ? "true" : "false");
                    return false;
                }
                Cryopod = nullptr; // now owned by the inventory
                return true;
            });
        };
        Steps.DiscardCryopod = [&]() {
            // Never added to an inventory: unreferenced, collected by the engine GC.
            Cryopod = nullptr;
        };

        Result.Outcome = CatalogDino::RunCryopodDelivery(Steps, Result.Error);
        if (Result.Outcome == CatalogDino::Outcome::DeliveredAsLiveTame && SaddleClass && Dino)
        {
            // The pod (and the saddle bytes inside it) was not delivered; the tame is
            // alive next to the buyer, so equip the saddle on it instead.
            RunNativeStep("equip saddle on live tame", [&]() {
                GiveSaddleWithLiveTame(Player, Dino, SaddleClass, Request.SaddleBlueprint);
                return true;
            });
        }
        switch (Result.Outcome)
        {
            case CatalogDino::Outcome::DeliveredInCryopod:
                Log::GetLog()->info(
                    "Delivered catalog dino {} level {} in cryopod to SteamID {} (neutered={})",
                    Request.Blueprint,
                    Request.Level,
                    GetSteamId(Player),
                    Request.Neutered ? "true" : "false");
                break;
            case CatalogDino::Outcome::DeliveredAsLiveTame:
                Log::GetLog()->warn(
                    "Catalog dino {} level {} for SteamID {} delivered as live tame (cryopod fallback): {}",
                    Request.Blueprint,
                    Request.Level,
                    GetSteamId(Player),
                    Result.Error);
                break;
            case CatalogDino::Outcome::Deferred:
                Log::GetLog()->info(
                    "Catalog dino {} level {} cryopod delivery to SteamID {} deferred, nothing touched: {}",
                    Request.Blueprint,
                    Request.Level,
                    GetSteamId(Player),
                    Result.Error);
                break;
            case CatalogDino::Outcome::Failed:
                Log::GetLog()->warn(
                    "Catalog dino {} level {} cryopod delivery to SteamID {} failed, nothing given: {}",
                    Request.Blueprint,
                    Request.Level,
                    GetSteamId(Player),
                    Result.Error);
                break;
        }
        return Result;
    }

    // ArkShop ShouldPreventStoreUse equivalent, evaluated before any delivery
    // touches the game. Returns a non-empty reason when the delivery must be
    // DEFERRED (lease released, no attempt consumed): the buyer has no character
    // yet, is Noglin-controlled / controlling, unconscious, or being carried.
    // Buff classes are re-resolved per call (never cached), like the cryopod class.
    static std::string DeliveryDeferReason(AShooterPlayerController* Player)
    {
        std::string Reason;
        const bool Ran = RunNativeStep("delivery guard", [&]() {
            AShooterCharacter* Character = Player ? Player->GetPlayerCharacter() : nullptr;
            if (!Character || !Character->IsValidLowLevel() || Character->IsDead())
            {
                Reason = "player has no living character";
                return true;
            }
            if (!PluginConfig || PluginConfig->GetDeferWhileNoglinControlled())
            {
                static const char* NoglinBuffs[] = {
                    // controlling player (post-process), controlled human, controlled dino
                    "Blueprint'/Game/Genesis2/Dinos/BrainSlug/Buff_BrainSlugPostProccess.Buff_BrainSlugPostProccess'",
                    "Blueprint'/Game/Genesis2/Dinos/BrainSlug/Buff_BrainSlug_HumanControl.Buff_BrainSlug_HumanControl'",
                    "Blueprint'/Game/Genesis2/Dinos/BrainSlug/Buff_BrainSlugControl.Buff_BrainSlugControl'",
                };
                for (const char* BuffPath : NoglinBuffs)
                {
                    UClass* BuffClass = LoadClassFromUtf8(BuffPath);
                    if (BuffClass && Character->HasBuff(BuffClass, true))
                    {
                        Reason = "player is Noglin-controlled";
                        return true;
                    }
                }
            }
            if ((!PluginConfig || PluginConfig->GetDeferWhileUnconscious()) && !Character->IsConscious())
            {
                Reason = "player is unconscious";
                return true;
            }
            if ((!PluginConfig || PluginConfig->GetDeferWhileCarried()) && Character->bIsCarried()())
            {
                Reason = "player is being carried";
                return true;
            }
            return true;
        });
        if (!Ran)
        {
            return "delivery guard faulted";
        }
        return Reason;
    }

    // Interpret the structured response the backend returns from POST /deliveries/{key}/fail.
    // Per the M3 contract the body carries { success, retry, deadLetter, nextRetryAt, attempts,
    // duplicate }. The plugin does not drive the retry itself (the backend owns the queue and
    // exponential backoff); we surface the outcome to the operational log so dead-letters and
    // backoff scheduling are observable. A dead-letter means the order has moved to `failed`
    // and is now refundable on the web side.
    static void LogFailOutcome(const std::string& DeliveryKey, const nlohmann::json& Response)
    {
        if (!Response.is_object())
        {
            Log::GetLog()->warn(
                "Delivery {} fail reported but backend returned no structured body", DeliveryKey);
            return;
        }

        const bool Retry = Response.value("retry", false);
        const bool DeadLetter = Response.value("deadLetter", false);
        const bool Duplicate = Response.value("duplicate", false);
        const int Attempts = Response.value("attempts", 0);
        std::string NextRetryAt;
        if (Response.contains("nextRetryAt") && Response["nextRetryAt"].is_string())
        {
            NextRetryAt = Response["nextRetryAt"].get<std::string>();
        }

        if (Duplicate)
        {
            // The job had already completed; failing it is a no-op. No asset was re-granted.
            Log::GetLog()->info(
                "Delivery {} fail was a no-op: job already completed (duplicate)", DeliveryKey);
            return;
        }

        if (DeadLetter)
        {
            Log::GetLog()->critical(
                "Delivery {} dead-lettered after {} attempt(s); order moved to failed (refundable)",
                DeliveryKey,
                Attempts);
            return;
        }

        if (Retry)
        {
            Log::GetLog()->warn(
                "Delivery {} will be retried (attempt {}); re-claimable after backoff{}",
                DeliveryKey,
                Attempts,
                NextRetryAt.empty() ? "" : (" at " + NextRetryAt));
            return;
        }

        Log::GetLog()->warn(
            "Delivery {} fail recorded (attempts {}, retry=false, deadLetter=false)",
            DeliveryKey,
            Attempts);
    }

    void PollPendingOrders()
    {
        int ServerId = PluginConfig ? PluginConfig->GetServerId() : 1;
        Http->ClaimDeliveries(ServerId, [ServerId](bool Success, const nlohmann::json& Response) {
            if (!Success)
            {
                Log::GetLog()->warn("Failed to claim pending deliveries");
                return;
            }

            try
            {
                if (!Response.is_array())
                {
                    Log::GetLog()->warn("ClaimDeliveries response is not an array");
                    return;
                }

                for (const auto& Delivery : Response)
                {
                    if (!Delivery.is_object()) continue;

                    std::string DeliveryKey = Delivery.value("deliveryKey", "");
                    std::string LeaseToken = Delivery.value("leaseToken", "");
                    std::string SteamIdStr = Delivery.value("playerSteamId", "");
                    std::string DeliveryType = Delivery.value("deliveryType", "");
                    std::string PayloadHash = Delivery.value("payloadHash", "");

                    if (DeliveryKey.empty() || LeaseToken.empty() || SteamIdStr.empty())
                    {
                        continue;
                    }

                    uint64 SteamId = std::stoull(SteamIdStr);

                    // Find online player with this Steam ID
                    AShooterPlayerController* TargetPC = nullptr;
                    auto& Players = ArkApi::GetApiUtils().GetWorld()->PlayerControllerListField();
                    for (int i = 0; i < Players.Num(); i++)
                    {
                        AShooterPlayerController* PC = static_cast<AShooterPlayerController*>(Players[i].Get());
                        if (PC && GetSteamId(PC) == SteamId)
                        {
                            TargetPC = PC;
                            break;
                        }
                    }

                    if (!TargetPC)
                    {
                        // Player is offline, release the lease immediately
                        Http->ReleaseDelivery(DeliveryKey, LeaseToken, [DeliveryKey](bool Success, const nlohmann::json&) {
                            if (Success)
                            {
                                Log::GetLog()->info("Released offline delivery lease: {}", DeliveryKey);
                            }
                            else
                            {
                                Log::GetLog()->warn("Failed to release offline delivery lease: {}", DeliveryKey);
                            }
                        });
                        continue;
                    }

                    // Player is online, prepare delivery in local journal
                    nlohmann::json Payload = Delivery["payload"];
                    std::string PayloadStr = Payload.dump();

                    const DeliveryAction Action = PrepareDelivery(
                        DeliveryType,
                        DeliveryKey,
                        PayloadStr);

                    if (Action == DeliveryAction::AcknowledgeOnly)
                    {
                        // Already completed locally, just re-acknowledge to backend. Backend
                        // /complete is idempotent on deliveryKey: a duplicate returns the ORIGINAL
                        // receipt with duplicate:true and does NOT re-deliver or re-settle. The
                        // lease token is not re-checked on an already-completed job, so a stale
                        // lease here is safe. This is the local-journal half of the idempotency
                        // guarantee: the player never receives the item twice.
                        std::string ReceiptId = DeliveryJournal::MakeKey(DeliveryType, DeliveryKey);
                        Http->CompleteDelivery(DeliveryKey, LeaseToken, SteamIdStr, PayloadHash, ReceiptId, [DeliveryKey](bool Success, const nlohmann::json& Response) {
                            if (Success)
                            {
                                const bool Duplicate = Response.is_object() && Response.value("duplicate", false);
                                Log::GetLog()->info(
                                    "Re-acknowledged already-processed delivery {} (backend duplicate={})",
                                    DeliveryKey,
                                    Duplicate ? "true" : "false");
                            }
                        });
                        continue;
                    }

                    if (Action == DeliveryAction::Deferred)
                    {
                        // Transient local condition (journal unavailable / unpersisted / uncertain).
                        // Nothing was delivered. Release the lease so the backend re-queues the job
                        // WITHOUT consuming a delivery attempt — this avoids prematurely
                        // dead-lettering and refunding an order that just needs a retry.
                        Http->ReleaseDelivery(DeliveryKey, LeaseToken, [DeliveryKey](bool Success, const nlohmann::json&) {
                            if (Success)
                            {
                                Log::GetLog()->warn("Deferred delivery lease released (no attempt consumed): {}", DeliveryKey);
                            }
                            else
                            {
                                Log::GetLog()->warn("Failed to release deferred delivery lease: {}", DeliveryKey);
                            }
                        });
                        continue;
                    }

                    if (Action == DeliveryAction::Blocked)
                    {
                        // Hard integrity failure (payload mismatch). Consume an attempt so the
                        // backend can dead-letter and refund rather than retrying a poisoned job.
                        Http->FailDelivery(DeliveryKey, LeaseToken, "Delivery blocked by local idempotency journal (payload mismatch)", [DeliveryKey](bool, const nlohmann::json& Response) {
                            LogFailOutcome(DeliveryKey, Response);
                        });
                        continue;
                    }

                    // Persist the transition from prepared to mutating before any ARK
                    // inventory/dino state is changed. A crash after this point becomes an
                    // explicit reconciliation case and can never be auto-delivered twice.
                    if (!Journal || !Journal->MarkMutating(DeliveryType, DeliveryKey))
                    {
                        Http->ReleaseDelivery(DeliveryKey, LeaseToken, [DeliveryKey](bool, const nlohmann::json&) {
                            Log::GetLog()->critical(
                                "Delivery {} was not mutated because the journal transition failed",
                                DeliveryKey);
                        });
                        continue;
                    }

                    // Action is Execute
                    bool SpawnSuccess = false;
                    // Set only when the game was NOT touched and the cause is transient
                    // (inventory full, buyer Noglin-controlled, ...). Released, not failed.
                    bool DeferDelivery = false;
                    // Set when the game WAS partly mutated and the rest could not be given.
                    // The journal entry is left "mutating" (never auto-redelivered) and the
                    // lease is released for manual reconciliation.
                    bool UncertainMutation = false;
                    std::string ErrorMessage = "";

                    // ArkShop ShouldPreventStoreUse: never deliver while the buyer is
                    // Noglin-controlled, unconscious, carried or has no character.
                    const std::string DeferReason = DeliveryDeferReason(TargetPC);
                    if (!DeferReason.empty())
                    {
                        DeferDelivery = true;
                        ErrorMessage = "Delivery deferred: " + DeferReason;
                        static CatalogDino::NoticeThrottle GuardNotices(std::chrono::seconds(60));
                        if (GuardNotices.ShouldNotify(DeliveryKey, CatalogDino::NoticeThrottle::Clock::now()))
                        {
                            SendMessage(TargetPC, FString(ArkApi::Tools::Utf8Decode(
                                "A delivery is waiting: it will arrive once you are free to receive it (" +
                                DeferReason + ").").c_str()));
                        }
                    }
                    else if (DeliveryType == "order")
                    {
                        try
                        {
                            std::vector<ItemDelivery::Line> Lines;
                            std::string ParseError;
                            if (!ItemDelivery::ParseLines(Payload, Lines, ParseError))
                            {
                                Log::GetLog()->error("Rejected item delivery payload {}: {}", DeliveryKey, ParseError);
                                ErrorMessage = "Bundle contains an invalid item definition: " + ParseError;
                            }
                            else
                            {
                                const ItemGiveResult Given = GiveItemsToPlayer(TargetPC, Lines);
                                if (Given.Status == ItemGiveStatus::Delivered)
                                {
                                    SpawnSuccess = true;
                                }
                                else if (Given.Status == ItemGiveStatus::Deferred)
                                {
                                    DeferDelivery = true;
                                    ErrorMessage = Given.Error;
                                    static CatalogDino::NoticeThrottle ItemInventoryNotices(std::chrono::seconds(60));
                                    if (Given.InventoryFull &&
                                        ItemInventoryNotices.ShouldNotify(DeliveryKey, CatalogDino::NoticeThrottle::Clock::now()))
                                    {
                                        const std::string Message = "Your inventory needs " + std::to_string(Given.SlotsNeeded) +
                                            " free slot(s) for " + Payload.value("productName", std::string("your order")) +
                                            " (you have " + std::to_string(Given.FreeSlots) +
                                            "). Free some space - delivery will retry automatically.";
                                        SendMessage(TargetPC, FString(ArkApi::Tools::Utf8Decode(Message).c_str()));
                                    }
                                }
                                else if (Given.Status == ItemGiveStatus::PartiallyDelivered)
                                {
                                    UncertainMutation = true;
                                    ErrorMessage = Given.Error;
                                }
                                else
                                {
                                    ErrorMessage = Given.Error.empty()
                                        ? "Game inventory mutation failed for a bundle item"
                                        : Given.Error;
                                }
                            }

                            if (SpawnSuccess)
                            {
                                long long DeliveredQuantity = 0;
                                for (const auto& Line : Lines) DeliveredQuantity += Line.Quantity;

                                // Notify player
                                std::string ProductName = Payload.value("productName", "Item");
                                std::string MessageTemplate = PluginConfig->GetMessage("ClaimSuccess");

                                FString Message = FString(ArkApi::Tools::Utf8Decode(MessageTemplate).c_str());
                                FString ProductNameFS = FString(ArkApi::Tools::Utf8Decode(ProductName).c_str());
                                FString QuantityStr(std::to_wstring(DeliveredQuantity).c_str());

                                Message = Message.Replace(L"{item}", *ProductNameFS, ESearchCase::IgnoreCase);
                                Message = Message.Replace(L"{quantity}", *QuantityStr, ESearchCase::IgnoreCase);
                                SendMessage(TargetPC, Message);
                            }
                            else if (ErrorMessage.empty())
                            {
                                ErrorMessage = "Game inventory mutation failed";
                            }
                        }
                        catch (const std::exception& e)
                        {
                            ErrorMessage = std::string("Inventory spawn exception: ") + e.what();
                        }
                    }
                    else if (DeliveryType == "dino_marketplace")
                    {
                        try
                        {
                            std::string Species = Payload.value("species", "");
                            std::string DinoName = Payload.value("dinoName", "");
                            int Level = Payload.value("level", 1);

                            if (SpawnExactDinoForPlayer(TargetPC, Payload))
                            {
                                SpawnSuccess = true;

                                // Notify player
                                FString DinoNameFS = FString(ArkApi::Tools::Utf8Decode(DinoName).c_str());
                                FString LevelStr = FString::FromInt(Level);
                                FString Message = L"Successfully claimed your " + DinoNameFS + L" (Level " + LevelStr + L")!";
                                SendMessage(TargetPC, Message);
                            }
                            else
                            {
                                ErrorMessage = "Dino spawn command failed";
                            }
                        }
                        catch (const std::exception& e)
                        {
                            ErrorMessage = std::string("Dino spawn exception: ") + e.what();
                        }
                    }
                    else if (DeliveryType == "dino_catalog")
                    {
                        try
                        {
                            const std::string ProductName = Payload.value("productName", "Dino");
                            const CatalogDinoDelivery Delivered = DeliverCatalogDinoForPlayer(TargetPC, Payload);
                            if (Delivered.Outcome == CatalogDino::Outcome::DeliveredInCryopod)
                            {
                                SpawnSuccess = true;
                                const std::string Message = "Successfully delivered " + ProductName +
                                    " (Level " + std::to_string(Delivered.Level) + ") in a cryopod - check your inventory!";
                                SendMessage(TargetPC, FString(ArkApi::Tools::Utf8Decode(Message).c_str()));
                            }
                            else if (Delivered.Outcome == CatalogDino::Outcome::DeliveredAsLiveTame)
                            {
                                SpawnSuccess = true;
                                // A cryopod was requested but the tame is standing next to the
                                // buyer: say so, so water/large dinos can be looked after.
                                const std::string Message = Delivered.CryopodRequested
                                    ? "Delivered " + ProductName + " (Level " + std::to_string(Delivered.Level) +
                                        ") next to you - cryopod unavailable, the dino is NOT in your inventory!"
                                    : "Successfully delivered " + ProductName +
                                        " (Level " + std::to_string(Delivered.Level) + ")!";
                                SendMessage(TargetPC, FString(ArkApi::Tools::Utf8Decode(Message).c_str()));
                            }
                            else if (Delivered.Outcome == CatalogDino::Outcome::Deferred)
                            {
                                // Nothing touched (inventory full / no inventory yet): release the
                                // lease below without consuming a backend attempt.
                                DeferDelivery = true;
                                ErrorMessage = Delivered.Error;
                                static CatalogDino::NoticeThrottle InventoryFullNotices(std::chrono::seconds(60));
                                if (Delivered.InventoryFull &&
                                    InventoryFullNotices.ShouldNotify(DeliveryKey, CatalogDino::NoticeThrottle::Clock::now()))
                                {
                                    const std::string Message = "Your inventory is full. Free a slot to receive " +
                                        ProductName + " in a cryopod - delivery will retry automatically.";
                                    SendMessage(TargetPC, FString(ArkApi::Tools::Utf8Decode(Message).c_str()));
                                }
                            }
                            else
                            {
                                ErrorMessage = Delivered.Error.empty() ? "Catalog dino spawn failed" : Delivered.Error;
                            }
                        }
                        catch (const std::exception& e)
                        {
                            ErrorMessage = std::string("Catalog dino delivery exception: ") + e.what();
                        }
                    }
                    else
                    {
                        ErrorMessage = "Unknown delivery type: " + DeliveryType;
                    }

                    if (SpawnSuccess)
                    {
                        if (CompleteDelivery(DeliveryType, DeliveryKey))
                        {
                            std::string ReceiptId = DeliveryJournal::MakeKey(DeliveryType, DeliveryKey);
                            Http->CompleteDelivery(DeliveryKey, LeaseToken, SteamIdStr, PayloadHash, ReceiptId, [DeliveryKey](bool Success, const nlohmann::json& Response) {
                                if (Success)
                                {
                                    const bool Duplicate = Response.is_object() && Response.value("duplicate", false);
                                    if (Duplicate)
                                    {
                                        // We mutated the game and journalled completion, but the backend
                                        // had already recorded this delivery (e.g. a prior ack we did not
                                        // observe succeed). The backend did NOT settle twice.
                                        Log::GetLog()->warn(
                                            "Delivery {} acknowledged but backend reported duplicate; "
                                            "order was already delivered/settled", DeliveryKey);
                                    }
                                    else
                                    {
                                        Log::GetLog()->info("Delivery {} completed and acknowledged successfully", DeliveryKey);
                                    }
                                }
                            });
                        }
                        else
                        {
                            Log::GetLog()->critical(
                                "Delivery {} mutated game state but journal completion failed; backend acknowledgement suppressed",
                                DeliveryKey);
                        }
                    }
                    else if (UncertainMutation)
                    {
                        // Part of the delivery reached the inventory. Do NOT abort the journal:
                        // the entry stays "mutating", so every later claim of this key is
                        // reported as UncertainPrepared and deferred (never re-given). Release
                        // the lease without consuming an attempt; an operator reconciles it.
                        Log::GetLog()->critical(
                            "Delivery {} partially delivered ({}); journal left in mutating state for manual "
                            "reconciliation, automatic redelivery blocked",
                            DeliveryKey, ErrorMessage);
                        SendMessage(TargetPC, FString(ArkApi::Tools::Utf8Decode(
                            "Part of your order could not be delivered. Staff have been alerted - please contact an admin.").c_str()));
                        Http->ReleaseDelivery(DeliveryKey, LeaseToken, [DeliveryKey](bool Success, const nlohmann::json&) {
                            if (!Success)
                            {
                                Log::GetLog()->warn("Failed to release partially delivered lease {}", DeliveryKey);
                            }
                        });
                    }
                    else if (DeferDelivery)
                    {
                        // Nothing was mutated. Roll back the local prepared record and release
                        // the lease (same as DeliveryAction::Deferred): the backend re-queues the
                        // job WITHOUT consuming an attempt, so a full inventory can never
                        // dead-letter/refund a paid order.
                        if (!AbortDelivery(DeliveryType, DeliveryKey))
                        {
                            Log::GetLog()->error(
                                "Deferred delivery {} could not be rolled back in the local journal", DeliveryKey);
                        }
                        Http->ReleaseDelivery(DeliveryKey, LeaseToken, [DeliveryKey, ErrorMessage](bool Success, const nlohmann::json&) {
                            if (Success)
                            {
                                Log::GetLog()->info("Delivery {} deferred (no attempt consumed): {}", DeliveryKey, ErrorMessage);
                            }
                            else
                            {
                                Log::GetLog()->warn("Failed to release deferred delivery lease {}: {}", DeliveryKey, ErrorMessage);
                            }
                        });
                    }
                    else
                    {
                        // Genuine game-mutation failure. Roll back the local prepared record so a
                        // later retry can run cleanly, then report the failure. The backend decides
                        // (per its attempt counter / backoff) whether this retries or dead-letters;
                        // we observe that decision via the structured response.
                        AbortDelivery(DeliveryType, DeliveryKey);
                        Http->FailDelivery(DeliveryKey, LeaseToken, ErrorMessage, [DeliveryKey, ErrorMessage](bool, const nlohmann::json& Response) {
                            Log::GetLog()->warn("Delivery {} failed: {}", DeliveryKey, ErrorMessage);
                            LogFailOutcome(DeliveryKey, Response);
                        });
                    }
                }
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->error("Error processing claimed deliveries: {}", e.what());
            }
        });
    }

    void PollChatMessages()
    {
        Http->GetChatMessages(LastChatTimestamp, [](bool Success, const nlohmann::json& Response) {
            if (!Success)
            {
                return; // Silent fail for chat polling
            }

            try
            {
                // Validate response is an object
                if (!Response.is_object())
                {
                    Log::GetLog()->warn("Chat API returned non-object response");
                    return;
                }

                // Check for success field
                if (Response.contains("success") && !Response["success"].get<bool>())
                {
                    return; // API returned error, skip
                }

                // Check if messages array exists
                if (!Response.contains("messages") || !Response["messages"].is_array())
                {
                    return; // No messages to process
                }

                auto Messages = Response["messages"];
                for (const auto& Msg : Messages)
                {
                    if (!Msg.is_object())
                        continue;

                    std::string Source = Msg.value("source", "");
                    std::string SenderName = Msg.value("senderName", "Unknown");
                    std::string Content = Msg.value("content", "");

                    if (!Content.empty())
                    {
                        BroadcastChatMessage(Source, SenderName, Content);
                    }
                }

                // Update last timestamp for next poll
                if (Response.contains("lastTimestamp") && !Response["lastTimestamp"].is_null())
                {
                    LastChatTimestamp = Response["lastTimestamp"].get<std::string>();
                }
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->warn("Error processing chat messages: {}", e.what());
            }
        });
    }

    void PollWalletNotifications()
    {
        Http->GetWalletEvents(LastWalletEventTimestamp, [](bool Success, const nlohmann::json& Response) {
            if (!Success || !Response.is_object())
            {
                return; // Silent fail; this is a non-critical projection poll.
            }

            try
            {
                if (Response.contains("success") && !Response["success"].get<bool>())
                {
                    return;
                }

                if (!Response.contains("events") || !Response["events"].is_array())
                {
                    return;
                }

                for (const auto& Event : Response["events"])
                {
                    if (!Event.is_object())
                        continue;

                    // The backend wallet-events projection annotates each event with the
                    // target playerSteamId for routing (additive field; see CR-PLUGIN-008).
                    // The double-entry payload itself is keyed by the backend userId, also
                    // annotated for matching.
                    std::string PlayerSteamId = Event.value("playerSteamId", "");
                    std::string UserId = Event.value("userId", "");
                    if (PlayerSteamId.empty() || UserId.empty())
                    {
                        continue;
                    }

                    // WalletNotifier handles per-eventId idempotency + message formatting.
                    // It surfaces only the entry belonging to this user and never computes
                    // any balance locally.
                    auto Notification = WalletNotifier.ConsumeEvent(Event, UserId);
                    if (!Notification.has_value())
                    {
                        continue;
                    }

                    // Route to the matching online player only.
                    uint64 TargetSteamId = 0;
                    try
                    {
                        TargetSteamId = std::stoull(PlayerSteamId);
                    }
                    catch (...)
                    {
                        continue;
                    }

                    auto& Players = ArkApi::GetApiUtils().GetWorld()->PlayerControllerListField();
                    for (int i = 0; i < Players.Num(); i++)
                    {
                        AShooterPlayerController* PC = static_cast<AShooterPlayerController*>(Players[i].Get());
                        if (PC && GetSteamId(PC) == TargetSteamId)
                        {
                            FString Msg = FString(ArkApi::Tools::Utf8Decode(Notification->Message).c_str());
                            SendMessage(PC, Msg);
                            break;
                        }
                    }
                }

                if (Response.contains("lastTimestamp") && !Response["lastTimestamp"].is_null())
                {
                    LastWalletEventTimestamp = Response["lastTimestamp"].get<std::string>();
                }
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->warn("Error processing wallet events: {}", e.what());
            }
        });
    }

    void BroadcastChatMessage(const std::string& Source, const std::string& SenderName, const std::string& Content)
    {
        // Format: [Source] SenderName: Content
        std::string SourceTag = (Source == "web") ? "[Web]" : (Source == "discord") ? "[Discord]" : "[" + Source + "]";
        std::string FullMessage = SourceTag + " " + SenderName + ": " + Content;

        FString MessageFS = FString(ArkApi::Tools::Utf8Decode(FullMessage).c_str());
        FString SenderFS = FString(ArkApi::Tools::Utf8Decode("CrossChat").c_str());

        // Broadcast to all online players
        try
        {
            auto& Players = ArkApi::GetApiUtils().GetWorld()->PlayerControllerListField();
            for (int i = 0; i < Players.Num(); i++)
            {
                AShooterPlayerController* PC = static_cast<AShooterPlayerController*>(Players[i].Get());
                if (PC)
                {
                    ArkApi::GetApiUtils().SendChatMessage(PC, *SenderFS, *MessageFS);
                }
            }
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Error broadcasting chat: {}", e.what());
        }
    }

    void SendMessage(AShooterPlayerController* Player, const FString& Message)
    {
        if (!Player)
            return;

        std::string PrefixStr = PluginConfig->GetMessagePrefix();
        FString Prefix = FString(ArkApi::Tools::Utf8Decode(PrefixStr).c_str());
        ArkApi::GetApiUtils().SendChatMessage(Player, *Prefix, *Message);
    }

    void SendAnnouncement(AShooterPlayerController* Player, const FString& Message, float DisplayTime)
    {
        if (!Player)
            return;

        // ARK's native HUD notification is substantially easier to scan than a burst
        // of individual chat rows. Keep this player-scoped: shop results may be ranked
        // or filtered for that player's cluster/server compatibility.
        ArkApi::GetApiUtils().SendNotification(
            Player,
            FLinearColor(0.12f, 0.90f, 0.88f, 1.0f),
            0.85f,
            DisplayTime,
            nullptr,
            *Message);
    }

    uint64 GetSteamId(AShooterPlayerController* Player)
    {
        if (Player)
        {
            return ArkApi::IApiUtils::GetSteamIdFromController(Player);
        }
        return 0;
    }

    // ArkShop::ApplyItemStats equivalent for one freshly created item: sets the
    // raw ItemStatValues entry so the item shows the configured Armor /
    // Durability / Damage. A stat the item does not use (bUsed false) is skipped.
    static void ApplyItemStatOverrides(UPrimalItem* Item, const ItemDelivery::Line& Line)
    {
        if (!Item || !Line.HasStatOverrides())
        {
            return;
        }

        // FItemStatInfo is opaque in the SDK; size the out-buffer from the engine's
        // struct size (ArkShop's fixed 0x24 as a floor), zeroed, 16-byte aligned.
        static const int StatInfoSize = (std::max)(GetStructSize<FItemStatInfo>(), 0x24);
        const auto ReadStat = [&](const EPrimalItemStat::Type Stat, const int Desired, const bool AddOne, float& Out) {
            std::vector<unsigned char> Buffer(static_cast<std::size_t>(StatInfoSize) + 16, 0);
            auto* Info = reinterpret_cast<FItemStatInfo*>(Buffer.data());
            Item->GetItemStatInfo(Info, Stat);
            if (!Info->bUsed()())
            {
                return false;
            }
            Out = ItemDelivery::StatValueFor(
                static_cast<float>(Desired),
                Info->InitialValueConstantField(),
                Info->RandomizerRangeMultiplierField(),
                Info->StateModifierScaleField(),
                Info->bDisplayAsPercent()(),
                AddOne);
            return true;
        };

        bool Updated = false;
        float Value = 0.0f;
        if (Line.Armor > 0 && ReadStat(EPrimalItemStat::Armor, Line.Armor, false, Value))
        {
            Item->ItemStatValuesField()()[EPrimalItemStat::Armor] = static_cast<unsigned __int16>(Value);
            Updated = true;
        }
        if (Line.Durability > 0 && ReadStat(EPrimalItemStat::MaxDurability, Line.Durability, true, Value))
        {
            Item->ItemStatValuesField()()[EPrimalItemStat::MaxDurability] = static_cast<unsigned __int16>(Value);
            Item->ItemDurabilityField() = Item->GetItemStatModifier(EPrimalItemStat::MaxDurability);
            Updated = true;
        }
        if (Line.Damage > 0 && ReadStat(EPrimalItemStat::WeaponDamagePercent, Line.Damage, false, Value))
        {
            Item->SetItemStatValues(EPrimalItemStat::WeaponDamagePercent, static_cast<int>(Value));
            Updated = true;
        }
        if (Updated)
        {
            Item->UpdatedItem(false);
        }
    }

    // Gives every line of an `order` payload, all-or-nothing (ArkShop
    // Store::BuyItem semantics, see ItemDelivery.h):
    //   1. Preflight (no mutation): inventory present, every class loads and is an
    //      item, and the inventory has room for ALL lines at once:
    //        slots needed = sum(PerUnit lines: quantity)
    //                     + sum(stackable lines: ceil(quantity / max stack))
    //        free slots   = GetMaxInventoryItems(false) - GetCurrentNumInventoryItems()
    //                       (0 when IsAtMaxInventoryItems(); unlimited when the
    //                       inventory ignores the item cap)
    //      Not enough room -> Deferred, nothing given.
    //   2. Give each line. PerUnit: AddNewItem(class, inventory, bEquipItem=false,
    //      bDontStack=false, quality, bForceNoBlueprint=!isBlueprint, quantity 1,
    //      bForceBlueprint=isBlueprint, ...) once per unit + stat overrides.
    //      Stackable: IncrementItemTemplateQuantity(class, quantity, ...,
    //      bDontExceedMaxItems=true), which tops up and splits stacks.
    //   3. Any shortfall or native fault after the first unit was given ->
    //      PartiallyDelivered: the caller must NOT abort the journal (a retry could
    //      give the delivered part twice).
    ItemGiveResult GiveItemsToPlayer(AShooterPlayerController* Player, const std::vector<ItemDelivery::Line>& Lines)
    {
        ItemGiveResult Result;
        if (Lines.empty())
        {
            Result.Error = "payload has no items";
            return Result;
        }

        struct ResolvedLine
        {
            const ItemDelivery::Line* Line = nullptr;
            UClass* Class = nullptr;
            int MaxStack = 1;
            ItemDelivery::GiveMode Mode = ItemDelivery::GiveMode::PerUnit;
        };
        std::vector<ResolvedLine> Resolved;
        UPrimalInventoryComponent* Inventory = nullptr;

        enum class Preflight { Ready, Defer, Fail };
        Preflight State = Preflight::Fail;
        const bool PreflightRan = RunNativeStep("item preflight", [&]() {
            AShooterCharacter* Character = Player ? Player->GetPlayerCharacter() : nullptr;
            Inventory = Character ? Character->MyInventoryComponentField() : nullptr;
            if (!Inventory || !Inventory->IsValidLowLevel())
            {
                Inventory = nullptr;
                Result.Error = "Player has no inventory yet; item delivery deferred";
                State = Preflight::Defer;
                return true;
            }

            UWorld* World = ArkApi::GetApiUtils().GetWorld();
            for (const auto& Line : Lines)
            {
                ResolvedLine Entry;
                Entry.Line = &Line;
                Entry.Class = LoadClassFromUtf8(Line.Blueprint);
                if (!IsItemClass(Entry.Class))
                {
                    Log::GetLog()->error("Failed to load item class: {}", Line.Blueprint);
                    Result.Error = "Failed to load item class: " + Line.Blueprint;
                    State = Preflight::Fail;
                    return true;
                }
                auto* Default = static_cast<UPrimalItem*>(Entry.Class->GetDefaultObject(true));
                Entry.MaxStack = Default ? Default->GetMaxItemQuantity(World) : 1;
                Entry.Mode = ItemDelivery::ChooseGiveMode(Entry.MaxStack, Line.IsBlueprint);
                Result.SlotsNeeded += ItemDelivery::SlotsForLine(Line.Quantity, Entry.MaxStack, Line.IsBlueprint);
                Resolved.push_back(Entry);
            }

            Result.FreeSlots = Inventory->IsAtMaxInventoryItems() && !Inventory->bIgnoreMaxInventoryItems()()
                ? 0
                : ItemDelivery::FreeSlots(
                    Inventory->GetCurrentNumInventoryItems(),
                    Inventory->GetMaxInventoryItems(false),
                    Inventory->bIgnoreMaxInventoryItems()());
            if (!ItemDelivery::HasRoomFor(Result.SlotsNeeded, Result.FreeSlots))
            {
                Result.InventoryFull = true;
                Result.Error = "Player inventory needs " + std::to_string(Result.SlotsNeeded) +
                    " free slot(s), has " + std::to_string(Result.FreeSlots) + "; item delivery deferred";
                State = Preflight::Defer;
                return true;
            }
            State = Preflight::Ready;
            return true;
        });

        if (!PreflightRan)
        {
            Result.Error = "Item delivery preflight faulted";
            return Result; // Failed, nothing touched
        }
        if (State == Preflight::Defer)
        {
            Result.Status = ItemGiveStatus::Deferred;
            return Result;
        }
        if (State != Preflight::Ready)
        {
            return Result; // Failed, nothing touched
        }

        bool AnyMutation = false;
        for (const auto& Entry : Resolved)
        {
            const ItemDelivery::Line& Line = *Entry.Line;
            int Given = 0;
            bool StepFaulted = false;
            const bool Ran = RunNativeStep("give item", [&]() {
                if (!Inventory->IsValidLowLevel())
                {
                    return false;
                }
                if (Entry.Mode == ItemDelivery::GiveMode::PerUnit)
                {
                    for (int Unit = 0; Unit < Line.Quantity; ++Unit)
                    {
                        UPrimalItem* Item = UPrimalItem::AddNewItem(
                            Entry.Class,
                            Inventory,
                            false,              // bEquipItem
                            false,              // bDontStack
                            Line.Quality,       // ItemQuality
                            !Line.IsBlueprint,  // bForceNoBlueprint
                            1,                  // quantityOverride
                            Line.IsBlueprint,   // bForceBlueprint
                            0,                  // MaxItemDifficultyClamp
                            false,              // CreateOnClient
                            nullptr,            // ApplyItemSkin
                            0,                  // MinRandomQuality
                            false,              // clampStats
                            false);             // bIgnoreAbsolueMaxInventory
                        if (!Item)
                        {
                            break;
                        }
                        ++Given;
                        AnyMutation = true;
                        ApplyItemStatOverrides(Item, Line);
                    }
                    return true;
                }

                // Stackable: one call for the total; the engine fills existing stacks
                // first and splits the rest into max-size stacks.
                const int Before = Inventory->GetItemTemplateQuantity(Entry.Class, nullptr, true, false, true, false);
                AnyMutation = true; // from here on the inventory may have changed
                const int Returned = Inventory->IncrementItemTemplateQuantity(
                    Entry.Class,
                    Line.Quantity,
                    true,   // bReplicateToClient
                    false,  // bIsBlueprint (blueprints are always PerUnit)
                    nullptr,
                    nullptr,
                    true,   // bRequireExactClassMatch (same class the count above uses)
                    false,  // bIsCraftingResourceConsumption
                    false,  // bIsFromUseConsumption
                    false,  // bIsArkTributeItem
                    true,   // ShowHUDNotification
                    false,  // bDontRecalcSpoilingTime
                    true);  // bDontExceedMaxItems
                const int After = Inventory->GetItemTemplateQuantity(Entry.Class, nullptr, true, false, true, false);
                const int Delta = After - Before;
                // Either measurement reaching the total counts as delivered; a short
                // count from both is a real shortfall.
                Given = (Delta >= Line.Quantity || Returned >= Line.Quantity)
                    ? Line.Quantity
                    : (std::max)(0, (std::max)(Delta, Returned));
                if (Given < Line.Quantity)
                {
                    Log::GetLog()->error(
                        "IncrementItemTemplateQuantity short for {}: wanted {}, returned {}, inventory delta {}",
                        Line.Blueprint, Line.Quantity, Returned, Delta);
                }
                return true;
            });
            if (!Ran)
            {
                StepFaulted = true;
            }

            Result.UnitsDelivered += Given;
            if (StepFaulted || Given < Line.Quantity)
            {
                const bool Partial = AnyMutation || Given > 0;
                Result.Status = Partial ? ItemGiveStatus::PartiallyDelivered : ItemGiveStatus::Failed;
                Result.Error = std::string(StepFaulted ? "Native fault while giving " : "Inventory accepted only ") +
                    (StepFaulted ? Line.Blueprint : (std::to_string(Given) + "/" + std::to_string(Line.Quantity) + " of " + Line.Blueprint));
                Log::GetLog()->critical(
                    "Item delivery to SteamID {} stopped: {} (partial={})",
                    GetSteamId(Player), Result.Error, Partial ? "true" : "false");
                return Result;
            }

            Log::GetLog()->info("Gave item {} x{} ({}, max stack {}) to player (SteamID: {})",
                Line.Blueprint,
                Line.Quantity,
                Entry.Mode == ItemDelivery::GiveMode::PerUnit ? "per unit" : "stacked",
                Entry.MaxStack,
                GetSteamId(Player));
        }

        Result.Status = ItemGiveStatus::Delivered;
        return Result;
    }

    bool GiveItemToPlayer(AShooterPlayerController* Player, const FString& Blueprint, int Quantity, float Quality, bool IsBlueprint)
    {
        ItemDelivery::Line Line;
        Line.Blueprint = ArkApi::Tools::Utf8Encode(*Blueprint);
        Line.Quantity = Quantity;
        Line.Quality = Quality;
        Line.IsBlueprint = IsBlueprint;
        if (Line.Blueprint.empty() || Line.Quantity < 1)
        {
            return false;
        }
        return GiveItemsToPlayer(Player, {Line}).Status == ItemGiveStatus::Delivered;
    }

    DeliveryAction PrepareDelivery(
        const std::string& DeliveryType,
        const std::string& DeliveryId,
        const std::string& Payload)
    {
        if (!Journal)
        {
            // The journal failed to load at startup. We cannot guarantee idempotency, so we
            // must not mutate game state. This is transient (operator can fix the data dir
            // and reload), so defer the lease rather than burning a backend attempt.
            Log::GetLog()->error(
                "Delivery {}:{} deferred: local idempotency journal is unavailable",
                DeliveryType,
                DeliveryId);
            return DeliveryAction::Deferred;
        }

        switch (Journal->Begin(DeliveryType, DeliveryId, Payload))
        {
            case DeliveryJournal::BeginResult::Started:
                return DeliveryAction::Execute;
            case DeliveryJournal::BeginResult::AlreadyCompleted:
                Log::GetLog()->info(
                    "Delivery {}:{} already completed locally; acknowledgement will be retried",
                    DeliveryType,
                    DeliveryId);
                return DeliveryAction::AcknowledgeOnly;
            case DeliveryJournal::BeginResult::UncertainPrepared:
                // A prepared-but-not-completed record from a prior attempt/crash. We do not
                // know whether the game mutation ran, so we must not run it again. This needs
                // manual reconciliation, not an automatic /fail that would consume attempts and
                // eventually dead-letter (refund) the order. Defer so the backoff/lease cycle
                // keeps the job recoverable while an operator inspects the journal.
                Log::GetLog()->critical(
                    "Delivery {}:{} is in uncertain prepared state; automatic redelivery blocked, "
                    "lease deferred for manual reconciliation",
                    DeliveryType,
                    DeliveryId);
                return DeliveryAction::Deferred;
            case DeliveryJournal::BeginResult::PayloadMismatch:
                // The payload changed for a delivery id we have already seen. This is a real
                // integrity violation (the immutable payload should never change for a fixed
                // deliveryKey). Report it as a hard failure so the backend records an attempt
                // and can route to dead-letter/refund rather than retrying a poisoned job.
                Log::GetLog()->critical(
                    "Delivery {}:{} payload changed for an existing delivery ID; failing hard",
                    DeliveryType,
                    DeliveryId);
                return DeliveryAction::Blocked;
            case DeliveryJournal::BeginResult::PersistenceError:
            default:
                // We could not durably record the prepared state, so we will not mutate the
                // game (doing so would risk a duplicate grant on retry). This is a transient
                // local I/O problem; defer the lease without consuming a backend attempt.
                Log::GetLog()->critical(
                    "Delivery {}:{} could not be persisted before game mutation; deferring lease",
                    DeliveryType,
                    DeliveryId);
                return DeliveryAction::Deferred;
        }
    }

    bool CompleteDelivery(const std::string& DeliveryType, const std::string& DeliveryId)
    {
        return Journal && Journal->Complete(DeliveryType, DeliveryId);
    }

    bool AbortDelivery(const std::string& DeliveryType, const std::string& DeliveryId)
    {
        return Journal && Journal->Abort(DeliveryType, DeliveryId);
    }

    void Hook_AShooterGameMode_HandleNewPlayer(AShooterGameMode* _this, AShooterPlayerController* NewPlayer, UPrimalPlayerData* PlayerData, AShooterCharacter* PlayerCharacter, bool bIsFromLogin)
    {
        // Call original first
        AShooterGameMode_HandleNewPlayer_original(_this, NewPlayer, PlayerData, PlayerCharacter, bIsFromLogin);

        if (NewPlayer && bIsFromLogin)
        {
            // Check for pending orders when player joins
            uint64 SteamId = GetSteamId(NewPlayer);
            std::string SteamIdStr = std::to_string(SteamId);

            Log::GetLog()->info("Player joined - SteamID: {}", SteamIdStr);

            Http->GetPlayerInfo(SteamIdStr, [NewPlayer, SteamId](bool Success, const nlohmann::json& Response) {
                if (!Success || !NewPlayer)
                    return;

                try
                {
                    int PendingOrders = Response["player"]["pendingOrders"].get<int>();
                    if (PendingOrders > 0)
                    {
                        FString Message = L"You have " + FString::FromInt(PendingOrders) +
                            L" pending orders! Type /claim to receive them.";
                        SendMessage(NewPlayer, Message);

                        Log::GetLog()->info("Notified player {} about {} pending orders", SteamId, PendingOrders);
                    }
                }
                catch (const std::exception& e)
                {
                    Log::GetLog()->warn("Failed to get player info: {}", e.what());
                }
            });
        }
    }

    void Hook_AShooterGameMode_Logout(AShooterGameMode* _this, AController* Exiting)
    {
        // Log player logout
        AShooterPlayerController* PC = static_cast<AShooterPlayerController*>(Exiting);
        if (PC)
        {
            uint64 SteamId = GetSteamId(PC);
            Log::GetLog()->info("Player logout - SteamID: {}", SteamId);
        }

        // Call original
        AShooterGameMode_Logout_original(_this, Exiting);
    }
}

// ARK API Plugin Entry Points
// IMPORTANT: Must use __fastcall calling convention as expected by ArkApi!
extern "C" __declspec(dllexport) void __fastcall Plugin_Init()
{
    HeartShop::Load();
}

extern "C" __declspec(dllexport) void __fastcall Plugin_Unload()
{
    HeartShop::Unload();
}

// DLL entry point - only for basic DLL housekeeping, NOT plugin init
BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    switch (ul_reason_for_call)
    {
    case DLL_PROCESS_ATTACH:
        DisableThreadLibraryCalls(hModule);
        break;
    case DLL_PROCESS_DETACH:
        break;
    }
    return TRUE;
}
