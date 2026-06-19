#include "Commands.h"
#include "HeartShop.h"
#include "Protection.h"
#include <Logger/Logger.h>

namespace HeartShop
{
namespace Commands
{
    // Helper function to check if plugin is licensed
    static bool CheckLicense(AShooterPlayerController* Player)
    {
        if (!LicenseVerified)
        {
            Log::GetLog()->warn("Command blocked - License not verified");
            if (Player)
            {
                FString ErrorMsg = L"[HeartShop] Plugin not licensed. Contact server admin.";
                ArkApi::GetApiUtils().SendChatMessage(Player, L"HeartShop", *ErrorMsg);
            }
            return false;
        }
        return true;
    }

    void Register()
    {
        ArkApi::GetCommands().AddChatCommand(L"/claim", &ClaimCommand);
        ArkApi::GetCommands().AddChatCommand(L"/points", &PointsCommand);
        ArkApi::GetCommands().AddChatCommand(L"/shop", &ShopCommand);
        ArkApi::GetCommands().AddChatCommand(L"/link", &LinkCommand);
        ArkApi::GetCommands().AddChatCommand(L"/protection", &ProtectionCommand);

        // Dino Marketplace Commands
        ArkApi::GetCommands().AddChatCommand(L"/sell", &SellDinoCommand);
        ArkApi::GetCommands().AddChatCommand(L"/market", &MarketCommand);
        ArkApi::GetCommands().AddChatCommand(L"/claimdino", &ClaimDinoCommand);

        // Unified ecosystem companion
        ArkApi::GetCommands().AddChatCommand(L"/iris", &IrisCommand);

        Log::GetLog()->info("HeartShop commands registered");
    }

    void Unregister()
    {
        ArkApi::GetCommands().RemoveChatCommand(L"/claim");
        ArkApi::GetCommands().RemoveChatCommand(L"/points");
        ArkApi::GetCommands().RemoveChatCommand(L"/shop");
        ArkApi::GetCommands().RemoveChatCommand(L"/link");
        ArkApi::GetCommands().RemoveChatCommand(L"/protection");

        // Dino Marketplace Commands
        ArkApi::GetCommands().RemoveChatCommand(L"/sell");
        ArkApi::GetCommands().RemoveChatCommand(L"/market");
        ArkApi::GetCommands().RemoveChatCommand(L"/claimdino");

        // Unified ecosystem companion
        ArkApi::GetCommands().RemoveChatCommand(L"/iris");

        Log::GetLog()->info("HeartShop commands unregistered");
    }

    void ClaimCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode)
    {
        if (!Player)
            return;

        if (!CheckLicense(Player))
            return;

        uint64 SteamId = GetSteamId(Player);
        Log::GetLog()->info("Player {} triggered manual /claim", SteamId);

        SendMessage(Player, L"Checking for pending deliveries...");
        PollPendingOrders();
    }

    void PointsCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode)
    {
        if (!Player)
            return;

        if (!CheckLicense(Player))
            return;

        uint64 SteamId = GetSteamId(Player);
        std::string SteamIdStr = std::to_string(SteamId);

        Log::GetLog()->info("Player {} used /points command", SteamIdStr);

        Http->GetPlayerInfo(SteamIdStr, [Player](bool Success, const nlohmann::json& Response) {
            if (!Player)
                return;

            if (!Success)
            {
                std::string NotLinkedMsgStr = PluginConfig->GetMessage("NotLinked");
                FString NotLinkedMsg = FString(ArkApi::Tools::Utf8Decode(NotLinkedMsgStr).c_str());
                SendMessage(Player, NotLinkedMsg);
                return;
            }

            try
            {
                int Points = Response["player"]["pointsBalance"].get<int>();
                std::string MessageTemplate = PluginConfig->GetMessage("PointsBalance");

                FString Message = FString(ArkApi::Tools::Utf8Decode(MessageTemplate).c_str());
                FString PointsStr = FString::FromInt(Points);

                Message = Message.Replace(L"{points}", *PointsStr, ESearchCase::IgnoreCase);
                SendMessage(Player, Message);
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->error("Error in PointsCommand: {}", e.what());
                std::string NotLinkedMsgStr = PluginConfig->GetMessage("NotLinked");
                FString NotLinkedMsg = FString(ArkApi::Tools::Utf8Decode(NotLinkedMsgStr).c_str());
                SendMessage(Player, NotLinkedMsg);
            }
        });
    }

    void ShopCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode)
    {
        if (!Player)
            return;

        if (!CheckLicense(Player))
            return;

        Log::GetLog()->info("Player {} used /shop command", GetSteamId(Player));

        std::string ShopUrlTemplate = PluginConfig->GetMessage("ShopUrl");
        FString ShopMessage = FString(ArkApi::Tools::Utf8Decode(ShopUrlTemplate).c_str());
        ShopMessage = ShopMessage.Replace(L"{url}", L"https://yourshop.com", ESearchCase::IgnoreCase);

        SendMessage(Player, ShopMessage);
    }

    void LinkCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode)
    {
        if (!Player)
            return;

        if (!CheckLicense(Player))
            return;

        uint64 SteamId = GetSteamId(Player);

        Log::GetLog()->info("Player {} used /link command", SteamId);

        // Convert uint64 to FString safely
        std::string SteamIdStr = std::to_string(SteamId);
        FString SteamIdFS = FString(ArkApi::Tools::Utf8Decode(SteamIdStr).c_str());

        FString LinkMessage = L"Your Steam ID: " + SteamIdFS +
            L" - Visit our website and link this ID to your Discord account";

        SendMessage(Player, LinkMessage);
    }

    void ProtectionCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode)
    {
        if (!Player)
            return;

        if (!CheckLicense(Player))
            return;

        uint64 SteamId = GetSteamId(Player);
        std::string SteamIdStr = std::to_string(SteamId);

        Log::GetLog()->info("Player {} used /protection command", SteamIdStr);

        // Check player protection status
        bool isPlayerProtected = Protection::IsPlayerProtected(SteamId);

        // Get tribe protection status
        AShooterPlayerState* PS = static_cast<AShooterPlayerState*>(Player->PlayerStateField());
        uint64 TribeId = 0;
        bool isTribeProtected = false;

        if (PS)
        {
            TribeId = PS->TargetingTeamField();
            if (TribeId != 0)
            {
                isTribeProtected = Protection::IsTribeProtected(TribeId);
            }
        }

        // Build status message
        FString StatusMsg;
        if (isPlayerProtected)
        {
            StatusMsg = L"[HeartShop] Your Protection Status: ACTIVE";
            SendMessage(Player, StatusMsg);

            StatusMsg = L"Your base, dinos, and character are protected from PvP damage.";
            SendMessage(Player, StatusMsg);
        }
        else if (isTribeProtected)
        {
            StatusMsg = L"[HeartShop] Tribe Protection Status: ACTIVE";
            SendMessage(Player, StatusMsg);

            StatusMsg = L"Your tribe's base and dinos are protected from PvP damage.";
            SendMessage(Player, StatusMsg);
        }
        else
        {
            StatusMsg = L"[HeartShop] Protection Status: INACTIVE";
            SendMessage(Player, StatusMsg);

            StatusMsg = L"You are not currently protected. New players receive temporary protection.";
            SendMessage(Player, StatusMsg);
        }

        // Refresh protection status in background
        Protection::RefreshPlayerProtection(SteamId);
        if (TribeId != 0)
        {
            Protection::RefreshTribeProtection(TribeId);
        }
    }

    // ==========================================
    // Dino Marketplace Commands
    // ==========================================

    void SellDinoCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode)
    {
        if (!Player)
            return;

        if (!CheckLicense(Player))
            return;

        uint64 SteamId = GetSteamId(Player);
        std::string SteamIdStr = std::to_string(SteamId);

        // Parse price from message: /sell <price>
        FString Command = Message->TrimStartAndEnd();
        TArray<FString> Parts;
        Command.ParseIntoArray(Parts, L" ", true);

        if (Parts.Num() < 2)
        {
            FString UsageMsg = L"[HeartShop] Usage: /sell <price> - Look at your tamed dino to list it for sale";
            SendMessage(Player, UsageMsg);
            return;
        }

        int Price = FCString::Atoi(*Parts[1]);
        if (Price <= 0)
        {
            FString ErrorMsg = L"[HeartShop] Invalid price. Please enter a positive number.";
            SendMessage(Player, ErrorMsg);
            return;
        }

        Log::GetLog()->info("Player {} attempting to sell dino for {} points", SteamIdStr, Price);

        // Get the dino the player is looking at or riding
        AShooterCharacter* PlayerChar = Player->GetPlayerCharacter();
        if (!PlayerChar)
        {
            FString ErrorMsg = L"[HeartShop] Unable to find your character.";
            SendMessage(Player, ErrorMsg);
            return;
        }

        APrimalDinoCharacter* TargetDino = nullptr;

        // First check if riding a dino
        if (PlayerChar->GetRidingDino())
        {
            TargetDino = PlayerChar->GetRidingDino();
        }
        else
        {
            // Check what the player is looking at using GetAimedUseActor
            UActorComponent* UseComp = nullptr;
            int HitBodyIndex = 0;
            AActor* AimedActor = Player->GetAimedUseActor(&UseComp, &HitBodyIndex, false);

            if (AimedActor && AimedActor->IsA(APrimalDinoCharacter::GetPrivateStaticClass()))
            {
                TargetDino = static_cast<APrimalDinoCharacter*>(AimedActor);
            }
        }

        if (!TargetDino)
        {
            FString ErrorMsg = L"[HeartShop] You must be looking at or riding a tamed dino to sell it.";
            SendMessage(Player, ErrorMsg);
            return;
        }

        // Check if player owns the dino
        int PlayerTeam = Player->TargetingTeamField();
        int DinoTeam = TargetDino->TargetingTeamField();
        if (PlayerTeam != DinoTeam)
        {
            FString ErrorMsg = L"[HeartShop] You can only sell dinos that belong to your tribe.";
            SendMessage(Player, ErrorMsg);
            return;
        }

        // Get dino name
        FString DinoName;
        TargetDino->GetDescriptiveName(&DinoName);
        std::string DinoNameStr = DinoName.ToString();

        // Get blueprint path
        FString BlueprintPath = ArkApi::GetApiUtils().GetBlueprint(TargetDino);
        std::string BlueprintPathStr = BlueprintPath.ToString();

        // Get species name from blueprint path
        std::string ClassNameStr = BlueprintPathStr;
        size_t LastDot = ClassNameStr.rfind('.');
        if (LastDot != std::string::npos)
        {
            ClassNameStr = ClassNameStr.substr(LastDot + 1);
            // Remove _C suffix if present
            if (ClassNameStr.size() > 2 && ClassNameStr.substr(ClassNameStr.size() - 2) == "_C")
            {
                ClassNameStr = ClassNameStr.substr(0, ClassNameStr.size() - 2);
            }
        }

        // Get basic stats
        UPrimalCharacterStatusComponent* StatusComp = TargetDino->MyCharacterStatusComponentField();
        int Level = StatusComp ? static_cast<int>(StatusComp->BaseCharacterLevelField()) + StatusComp->ExtraCharacterLevelField() : 1;

        // Gender
        bool bIsFemale = TargetDino->bIsFemale()();
        std::string Gender = bIsFemale ? "Female" : "Male";

        // Get base stats (wild levels) using FieldArray correctly
        int BaseHealth = 0, BaseStamina = 0, BaseOxygen = 0, BaseFood = 0, BaseWeight = 0, BaseMelee = 0, BaseSpeed = 0;
        int AddedHealth = 0, AddedStamina = 0, AddedOxygen = 0, AddedFood = 0, AddedWeight = 0, AddedMelee = 0, AddedSpeed = 0;
        float ImprintQuality = 0.0f;

        if (StatusComp)
        {
            // Get pointer to the arrays via operator()
            auto BaseStats = StatusComp->NumberOfLevelUpPointsAppliedField()();
            auto TamedStats = StatusComp->NumberOfLevelUpPointsAppliedTamedField()();

            if (BaseStats)
            {
                BaseHealth = BaseStats[0];
                BaseStamina = BaseStats[1];
                BaseOxygen = BaseStats[3];
                BaseFood = BaseStats[4];
                BaseWeight = BaseStats[7];
                BaseMelee = BaseStats[8];
                BaseSpeed = BaseStats[9];
            }

            if (TamedStats)
            {
                AddedHealth = TamedStats[0];
                AddedStamina = TamedStats[1];
                AddedOxygen = TamedStats[3];
                AddedFood = TamedStats[4];
                AddedWeight = TamedStats[7];
                AddedMelee = TamedStats[8];
                AddedSpeed = TamedStats[9];
            }

            // Get imprint quality from status component
            ImprintQuality = StatusComp->DinoImprintingQualityField();
        }

        // Get colors (6 color regions)
        int ColorRegions[6] = {-1, -1, -1, -1, -1, -1};
        auto ColorIndices = TargetDino->ColorSetIndicesField()();
        if (ColorIndices)
        {
            for (int i = 0; i < 6; i++)
            {
                ColorRegions[i] = static_cast<int>(ColorIndices[i]);
            }
        }

        // Get mutations
        int MaternalMutations = 0;
        int PaternalMutations = 0;
        // Mutations are stored in ancestry data - simplified for now

        // Build JSON payload
        nlohmann::json Payload;
        Payload["steamId"] = SteamIdStr;
        Payload["species"] = ClassNameStr;
        Payload["blueprintPath"] = BlueprintPathStr;
        Payload["dinoName"] = DinoNameStr;
        Payload["level"] = Level;
        Payload["gender"] = Gender;
        Payload["baseHealth"] = BaseHealth;
        Payload["baseStamina"] = BaseStamina;
        Payload["baseOxygen"] = BaseOxygen;
        Payload["baseFood"] = BaseFood;
        Payload["baseWeight"] = BaseWeight;
        Payload["baseMelee"] = BaseMelee;
        Payload["baseSpeed"] = BaseSpeed;
        Payload["addedHealth"] = AddedHealth;
        Payload["addedStamina"] = AddedStamina;
        Payload["addedOxygen"] = AddedOxygen;
        Payload["addedFood"] = AddedFood;
        Payload["addedWeight"] = AddedWeight;
        Payload["addedMelee"] = AddedMelee;
        Payload["addedSpeed"] = AddedSpeed;
        Payload["imprintQuality"] = ImprintQuality;
        Payload["colorRegion0"] = ColorRegions[0];
        Payload["colorRegion1"] = ColorRegions[1];
        Payload["colorRegion2"] = ColorRegions[2];
        Payload["colorRegion3"] = ColorRegions[3];
        Payload["colorRegion4"] = ColorRegions[4];
        Payload["colorRegion5"] = ColorRegions[5];
        Payload["maternalMutations"] = MaternalMutations;
        Payload["paternalMutations"] = PaternalMutations;
        Payload["price"] = Price;

        // Send to API
        Http->CreateDinoListing(Payload, [Player, TargetDino, DinoNameStr, Price](bool Success, const nlohmann::json& Response) {
            if (!Player)
                return;

            if (Success)
            {
                try
                {
                    std::string ListingId = Response["listing"]["id"].get<std::string>();

                    // Destroy the dino since it's now listed for sale
                    if (TargetDino && TargetDino->IsValidLowLevel())
                    {
                        TargetDino->Destroy(false, false);
                    }

                    std::string SuccessMsg = "[HeartShop] Successfully listed " + DinoNameStr + " for " + std::to_string(Price) + " points!";
                    FString SuccessMsgFS = FString(ArkApi::Tools::Utf8Decode(SuccessMsg).c_str());
                    SendMessage(Player, SuccessMsgFS);

                    Log::GetLog()->info("Dino listing created: {}", ListingId);
                }
                catch (const std::exception& e)
                {
                    Log::GetLog()->error("Error parsing sell response: {}", e.what());
                    FString ErrorMsg = L"[HeartShop] Error creating listing. Please try again.";
                    SendMessage(Player, ErrorMsg);
                }
            }
            else
            {
                FString ErrorMsg = L"[HeartShop] Failed to create listing. Make sure your account is linked.";
                SendMessage(Player, ErrorMsg);
            }
        });
    }

    void MarketCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode)
    {
        if (!Player)
            return;

        if (!CheckLicense(Player))
            return;

        Log::GetLog()->info("Player {} used /market command", GetSteamId(Player));

        FString MarketMsg = L"[HeartShop] Dino Marketplace";
        SendMessage(Player, MarketMsg);

        FString UrlMsg = L"Visit our website to browse and buy dinos!";
        SendMessage(Player, UrlMsg);

        FString CommandsMsg = L"Commands: /sell <price> - List your dino for sale";
        SendMessage(Player, CommandsMsg);

        FString ClaimMsg = L"/claimdino - Claim purchased dinos";
        SendMessage(Player, ClaimMsg);
    }

    void ClaimDinoCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode)
    {
        if (!Player)
            return;

        if (!CheckLicense(Player))
            return;

        uint64 SteamId = GetSteamId(Player);
        Log::GetLog()->info("Player {} triggered manual /claimdino", SteamId);

        SendMessage(Player, L"Checking for pending deliveries...");
        PollPendingOrders();
    }

    // ==========================================
    // Unified Ecosystem Companion (read-only)
    // ==========================================
    //
    // /iris [companion]
    //   Shows the player's IRIS Wallet balance and pending deliveries.
    //
    // STRICT READ-ONLY: every value displayed here is owned by the backend
    // (wallet ledger projection + delivery queue). The plugin renders the
    // backend-supplied amounts verbatim as strings and never performs any
    // arithmetic, currency conversion, caching, or local balance tracking.
    // See ENTERPRISE_REDESIGN_PLAN_TH.md sections 14 and 20.
    void IrisCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode)
    {
        if (!Player)
            return;

        if (!CheckLicense(Player))
            return;

        uint64 SteamId = GetSteamId(Player);
        std::string SteamIdStr = std::to_string(SteamId);

        Log::GetLog()->info("Player {} used /iris companion command", SteamIdStr);

        SendMessage(Player, L"IRIS Companion - fetching your wallet and deliveries...");

        // 1) Wallet balance (read-only projection of the ledger).
        Http->GetWalletBalance(SteamIdStr, [Player, SteamIdStr](bool Success, const nlohmann::json& Response) {
            if (!Player)
                return;

            if (!Success || !Response.is_object())
            {
                std::string NotLinkedMsgStr = PluginConfig->GetMessage("NotLinked");
                FString NotLinkedMsg = FString(ArkApi::Tools::Utf8Decode(NotLinkedMsgStr).c_str());
                SendMessage(Player, NotLinkedMsg);
                return;
            }

            try
            {
                // Per the wallet contract, balances are decimal STRINGS. Display verbatim;
                // do not parse to a number or compute totals client-side.
                std::string Currency = Response.value("currency", "IC");
                std::string Available = "0";
                std::string Total = "0";

                if (Response.contains("accounts") && Response["accounts"].is_object())
                {
                    const auto& Accounts = Response["accounts"];
                    Available = Accounts.value("available", std::string("0"));
                }
                Total = Response.value("total", Available);

                std::string WalletLine = "IRIS Wallet: " + Available + " " + Currency +
                    " available (total " + Total + " " + Currency + ")";
                FString WalletMsg = FString(ArkApi::Tools::Utf8Decode(WalletLine).c_str());
                SendMessage(Player, WalletMsg);
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->warn("IrisCommand wallet parse error: {}", e.what());
                SendMessage(Player, L"Wallet is temporarily unavailable. Please try again later.");
            }
        });

        // 2) Pending deliveries (read-only count from the delivery queue projection).
        Http->GetPendingDeliveries(SteamIdStr, [Player](bool Success, const nlohmann::json& Response) {
            if (!Player)
                return;

            if (!Success || !Response.is_object())
            {
                // Non-fatal: the wallet line above already told the player something.
                return;
            }

            try
            {
                int Pending = 0;
                if (Response.contains("pending") && Response["pending"].is_number_integer())
                {
                    Pending = Response["pending"].get<int>();
                }
                else if (Response.contains("deliveries") && Response["deliveries"].is_array())
                {
                    Pending = static_cast<int>(Response["deliveries"].size());
                }

                FString Line;
                if (Pending > 0)
                {
                    Line = L"Pending deliveries: " + FString::FromInt(Pending) +
                        L" - type /claim to receive items or /claimdino for dinos.";
                }
                else
                {
                    Line = L"Pending deliveries: none.";
                }
                SendMessage(Player, Line);
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->warn("IrisCommand pending-deliveries parse error: {}", e.what());
            }
        });
    }
}
}
