#pragma once

#include "IrisDefender.h"

namespace AntiCheat
{
    void Init();
    void Unload();

    void OnTick(float deltaSeconds);
    void CheckPlayerMovement(AShooterPlayerController* pc, AShooterCharacter* character, float deltaSeconds);
    bool CheckMovementMode(AShooterPlayerController* pc, AShooterCharacter* character);
    bool CheckUndermesh(AShooterPlayerController* pc, AShooterCharacter* character, const FVector& currentLoc);
    bool HasTekFlightBuff(AShooterCharacter* character);

    void Hook_AShooterWeapon_FireWeapon(AShooterWeapon* _this);

    float Hook_APrimalCharacter_TakeDamage(
        APrimalCharacter* _this,
        float Damage,
        FDamageEvent* DamageEvent,
        AController* EventInstigator,
        AActor* DamageCauser
    );

    bool Hook_APrimalCharacter_TeleportTo(
        APrimalCharacter* _this,
        FVector* DestLocation,
        FRotator* DestRotation,
        bool bIsATest,
        bool bNoCheck
    );
}
