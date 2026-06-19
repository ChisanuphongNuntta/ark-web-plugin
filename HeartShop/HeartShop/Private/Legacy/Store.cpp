#include <Store.h>
#include "../../HeartShop.h"
#include <API/UE/Math/ColorList.h>

namespace ArkShop::Store
{
    void Init()
    {
        // TODO: Register Store commands here
        // auto& commands = ArkApi::GetCommands();
        // commands.AddChatCommand(HeartShop::GetText("BuyCmd"), &ChatBuy);
        // ...
    }

    void Unload()
    {
        // auto& commands = ArkApi::GetCommands();
        // commands.RemoveChatCommand(HeartShop::GetText("BuyCmd"));
        // ...
    }

    bool Buy(AShooterPlayerController* player_controller, const FString& item_id, int amount)
    {
        // TODO: Implement Buy logic redirection to HeartShop::Features::Store
        // For now, return false
        return false;
    }

    bool IsStoreEnabled(AShooterPlayerController* player_controller)
    {
        return true; 
    }

    void ToogleStore(bool enabled, const FString& reason)
    {
        // ...
    }
}
