#include <Kits.h>
#include "../../HeartShop.h"

namespace ArkShop::Kits
{
    void Init()
    {
        // TODO: Register Kit commands
    }

    void Unload()
    {
        // ...
    }

    bool ChangeKitAmount(const FString& kit_name, int amount, uint64 steam_id)
    {
        return false;
    }

    bool CanUseKit(AShooterPlayerController* player_controller, uint64 steam_id, const FString& kit_name)
    {
        return false;
    }

    bool IsKitExists(const FString& kit_name)
    {
        return false;
    }

    void InitKitData(uint64 steam_id)
    {
    }
}
