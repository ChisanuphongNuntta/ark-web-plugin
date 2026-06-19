#include "WebStore.h"
#include <API/UE/Math/ColorList.h>

namespace HeartShop::Features::WebStore
{
    void Init()
    {
        Log::GetLog()->info("HeartShop: Initializing WebStore...");

        // Setup polling timer
        int pollInterval = 30; // Default
        // TODO: Get poll interval from config
        // if (HeartShop::config.count("General") && HeartShop::config["General"].count("PollInterval"))
        //     pollInterval = HeartShop::config["General"]["PollInterval"];

        ArkApi::GetCommands().AddOnTimerCallback(
            L"HeartShop_PollOrders",
            [pollInterval]() {
                static int secondsCounter = 0;
                secondsCounter++;
                if (secondsCounter >= pollInterval)
                {
                    secondsCounter = 0;
                    PollPendingOrders();
                }
            }
        );

        Log::GetLog()->info("HeartShop: WebStore initialized (Polling every {}s)", pollInterval);
    }

    void Unload()
    {
        ArkApi::GetCommands().RemoveOnTimerCallback(L"HeartShop_PollOrders");
    }

    // Helper: GiveItemToPlayer (Ported from original HeartShop.cpp)
    bool GiveItemToPlayer(AShooterPlayerController* Player, const FString& Blueprint, int Quantity, float Quality, bool IsBlueprint)
    {
        if (!Player || !Player->GetPlayerCharacter())
            return false;

        try
        {
            FString MutableBlueprint = Blueprint;
            UClass* ItemClass = UVictoryCore::BPLoadClass(&MutableBlueprint);
            if (!ItemClass)
            {
                Log::GetLog()->error("Failed to load item class: {}", ArkApi::Tools::Utf8Encode(*Blueprint));
                return false;
            }

            UPrimalInventoryComponent* Inventory = Player->GetPlayerCharacter()->MyInventoryComponentField();
            if (!Inventory)
            {
                Log::GetLog()->error("Player has no inventory");
                return false;
            }

            UPrimalItem* Item = UPrimalItem::AddNewItem(
                ItemClass,
                Inventory,
                IsBlueprint,
                false,
                Quality,
                false,
                Quantity,
                false,
                0,
                false,
                nullptr,
                0,
                false,
                false
            );

            if (!Item)
            {
                Log::GetLog()->error("Failed to create item");
                return false;
            }

            return true;
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Exception in GiveItemToPlayer: {}", e.what());
            return false;
        }
    }

    void PollPendingOrders()
    {
        if (!HeartShop::Http) return;

        HeartShop::Http->GetPendingOrders([](bool Success, const nlohmann::json& Response) {
            if (!Success) return;

            try
            {
                if (!Response.contains("orders")) return;
                auto Orders = Response["orders"];
                for (const auto& Order : Orders)
                {
                    // Skip orders where player hasn't linked their Steam account
                    if (!Order.contains("steamId") || Order["steamId"].is_null() || !Order["steamId"].is_string())
                    {
                        std::string OId = Order.value("orderId", "unknown");
                        Log::GetLog()->warn("Order {} skipped: player has no linked Steam ID", OId);
                        continue;
                    }

                    std::string SteamIdStr = Order["steamId"].get<std::string>();
                    uint64 SteamId = std::stoull(SteamIdStr);

                    // Find online player
                    auto& Players = ArkApi::GetApiUtils().GetWorld()->PlayerControllerListField();
                    for (int i = 0; i < Players.Num(); i++)
                    {
                        AShooterPlayerController* PC = static_cast<AShooterPlayerController*>(Players[i].Get());
                        if (!PC) continue;

                        if (ArkApi::IApiUtils::GetSteamIdFromController(PC) == SteamId)
                        {
                            // Deliver Item
                            auto Item = Order["item"];
                            std::string BlueprintStr = Item["blueprint"].get<std::string>();
                            FString Blueprint = FString(ArkApi::Tools::Utf8Decode(BlueprintStr).c_str());
                            int Quantity = Item["quantity"].get<int>();
                            float Quality = Item["quality"].get<float>();
                            bool IsBlueprint = Item["isBlueprint"].get<bool>();
                            std::string OrderId = Order["orderId"].get<std::string>();

                            if (GiveItemToPlayer(PC, Blueprint, Quantity, Quality, IsBlueprint))
                            {
                                HeartShop::Http->MarkDelivered(OrderId, [](bool, const nlohmann::json&){});

                                // Send Message
                                FString Msg = FString(TEXT("Received "));
                                Msg.AppendInt(Quantity);
                                Msg.Append(TEXT(" x "));
                                Msg.Append(Blueprint);
                                ArkApi::GetApiUtils().SendChatMessage(PC, L"HeartShop", *Msg);
                            }
                            break;
                        }
                    }
                }
            }
            catch(...) {}
        });
    }
}
