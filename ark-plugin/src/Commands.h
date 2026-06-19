#pragma once

#include <API/ARK/Ark.h>

namespace HeartShop
{
namespace Commands
{
    void Register();
    void Unregister();

    // Command handlers - EChatSendMode::Type is required, not int!
    void ClaimCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode);
    void PointsCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode);
    void ShopCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode);
    void LinkCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode);
    void ProtectionCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode);

    // Dino Marketplace Commands
    void SellDinoCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode);
    void MarketCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode);
    void ClaimDinoCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode);

    // Unified ecosystem companion (read-only): wallet balance + pending deliveries.
    void IrisCommand(AShooterPlayerController* Player, FString* Message, EChatSendMode::Type Mode);
}
}
