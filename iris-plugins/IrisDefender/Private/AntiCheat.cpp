#include "AntiCheat.h"
#include "Config.h"
#include "Logger.h"
#include "ViolationManager.h"
#include "WorldLocation.h"
#include <cmath>

namespace AntiCheat
{
    DECLARE_HOOK(AShooterWeapon_FireWeapon, void, AShooterWeapon*);
    DECLARE_HOOK(APrimalCharacter_TakeDamage, float, APrimalCharacter*, float, FDamageEvent*, AController*, AActor*);
    DECLARE_HOOK(APrimalCharacter_TeleportTo, bool, APrimalCharacter*, FVector*, FRotator*, bool, bool);

    void Init()
    {
        ArkApi::GetCommands().AddOnTickCallback("IrisDefender.AntiCheatTick", &AntiCheat::OnTick);

        ArkApi::GetHooks().SetHook(
            "AShooterWeapon.FireWeapon",
            &Hook_AShooterWeapon_FireWeapon,
            &AShooterWeapon_FireWeapon_original
        );

        ArkApi::GetHooks().SetHook(
            "APrimalCharacter.TakeDamage",
            &Hook_APrimalCharacter_TakeDamage,
            &APrimalCharacter_TakeDamage_original
        );

        ArkApi::GetHooks().SetHook(
            "APrimalCharacter.TeleportTo",
            &Hook_APrimalCharacter_TeleportTo,
            &APrimalCharacter_TeleportTo_original
        );

        SecurityLogger::Get().Info("[AntiCheat] Hooks and tick callbacks registered.");
    }

    void Unload()
    {
        ArkApi::GetCommands().RemoveOnTickCallback("IrisDefender.AntiCheatTick");

        ArkApi::GetHooks().DisableHook(
            "AShooterWeapon.FireWeapon",
            &Hook_AShooterWeapon_FireWeapon
        );

        ArkApi::GetHooks().DisableHook(
            "APrimalCharacter.TakeDamage",
            &Hook_APrimalCharacter_TakeDamage
        );

        ArkApi::GetHooks().DisableHook(
            "APrimalCharacter.TeleportTo",
            &Hook_APrimalCharacter_TeleportTo
        );

        SecurityLogger::Get().Info("[AntiCheat] Hooks and tick callbacks disabled.");
    }

    bool HasTekFlightBuff(AShooterCharacter* character)
    {
        if (!character)
        {
            return false;
        }

        TArray<APrimalBuff*> buffs = character->BuffsField();
        for (APrimalBuff* buff : buffs)
        {
            if (buff && buff->ClassField())
            {
                FString buffName = buff->ClassField()->NameField().ToString();
                if (buffName.Contains("TekShirt") || buffName.Contains("TekSuit") || buffName.Contains("Jetpack"))
                {
                    return true;
                }

                FString bp = ArkApi::GetApiUtils().GetBlueprint(buff);
                if (bp.Contains("TekShirt") || bp.Contains("TekSuit") || bp.Contains("Jetpack"))
                {
                    return true;
                }
            }
        }
        return false;
    }

    bool CheckUndermesh(AShooterPlayerController* pc, AShooterCharacter* character, const FVector& currentLoc)
    {
        if (!Config::Get().GetUndermesh().Enabled)
        {
            return true;
        }

        float floorZ = Config::Get().GetUndermesh().TheCenterWorldFloorZ;
        if (currentLoc.Z < floorZ)
        {
            uint64 steamId = pc->GetUniqueNetIdAsUINT64();
            ViolationManager::Get().RecordViolation(
                steamId,
                pc,
                EViolationType::Undermesh,
                currentLoc,
                "Player below world floor Z: " + std::to_string(static_cast<int>(currentLoc.Z)) + " < " + std::to_string(static_cast<int>(floorZ))
            );
            ViolationManager::Get().SendWarningNotification(pc, Config::Get().GetUndermesh().MsgUndermesh);

            if (Config::Get().GetUndermesh().Action == "Kill")
            {
                character->Suicide();
            }
            else
            {
                FVector safe = Config::Get().GetUndermesh().SafeSurfaceCoords;
                pc->SetPlayerPos(safe.X, safe.Y, safe.Z);
                if (character->CharacterMovementField().Object)
                {
                    character->CharacterMovementField()->VelocityField() = FVector(0.0f, 0.0f, 0.0f);
                }
                ViolationManager::Get().GrantTeleportImmunity(steamId, safe, 3.0f);
            }
            return false;
        }

        return true;
    }

    bool CheckMovementMode(AShooterPlayerController* pc, AShooterCharacter* character)
    {
        if (!Config::Get().GetFlyhack().Enabled)
        {
            return true;
        }

        EMovementMode mode = character->GetPrimalCharMovementMode();
        if (mode == EMovementMode::MOVE_Flying)
        {
            bool bAuthorized = false;
            if (pc->bIsAdmin()())
            {
                bAuthorized = true;
            }
            else if (IrisWorld::IsAttachedOrMounted(character))
            {
                // Riding, passenger seat, carried by a flyer or seated: movement is driven by the parent
                bAuthorized = true;
            }
            else if (HasTekFlightBuff(character))
            {
                bAuthorized = true;
            }

            if (!bAuthorized)
            {
                uint64 steamId = pc->GetUniqueNetIdAsUINT64();
                FVector loc = IrisWorld::GetCharacterWorldLocation(character);

                ViolationManager::Get().RecordViolation(
                    steamId,
                    pc,
                    EViolationType::Flyhack,
                    loc,
                    "Unassisted MOVE_Flying without Tek suit or flying mount"
                );
                ViolationManager::Get().SendWarningNotification(pc, Config::Get().GetFlyhack().MsgFlyhack);

                if (Config::Get().GetFlyhack().ForceGroundOnViolation)
                {
                    FVector lastPos;
                    double lastTime;
                    if (ViolationManager::Get().GetLastValidPosition(steamId, lastPos, lastTime))
                    {
                        pc->SetPlayerPos(lastPos.X, lastPos.Y, lastPos.Z);
                    }
                    if (character->CharacterMovementField().Object)
                    {
                        character->CharacterMovementField()->MovementModeField() = EMovementMode::MOVE_Falling;
                        character->CharacterMovementField()->VelocityField() = FVector(0.0f, 0.0f, 0.0f);
                    }
                }
                return false;
            }
        }
        return true;
    }

    void CheckPlayerMovement(AShooterPlayerController* pc, AShooterCharacter* character, float deltaSeconds)
    {
        (void)deltaSeconds;

        if (!pc || !character || character->IsDead())
        {
            return;
        }

        uint64 steamId = pc->GetUniqueNetIdAsUINT64();
        if (steamId == 0)
        {
            return;
        }

        // World-space position. RelativeLocation is parent-relative (~0,0,0) while the
        // survivor is attached to a dino / seat / carrier, which caused the rider rubberband bug.
        FVector currentLoc = IrisWorld::GetCharacterWorldLocation(character);

        double now = 0.0;
        if (ArkApi::GetApiUtils().GetWorld())
        {
            now = static_cast<double>(ArkApi::GetApiUtils().GetWorld()->TimeSecondsField());
        }

        const bool isMounted = IrisWorld::IsAttachedOrMounted(character);
        const bool isUnconscious = !character->IsConscious();

        // Speed/teleport baseline: the ridden dino's world position while mounted, otherwise the survivor.
        FVector trackedLoc = currentLoc;
        if (isMounted)
        {
            APrimalDinoCharacter* ridingDino = character->GetRidingDino();
            if (ridingDino != nullptr)
            {
                trackedLoc = IrisWorld::GetActorWorldLocation(ridingDino);
            }
        }

        // 0. State transitions (login/reconnect, respawn/new pawn, mount/dismount,
        //    recovered from dead/unconscious) re-baseline silently: no violation, no rubberband.
        IrisMovement::MovementObservation observation;
        observation.controller = pc;
        observation.pawn = character;
        observation.pawnIndex = character->InternalIndexField();
        observation.attached = isMounted;
        observation.incapacitated = isUnconscious;
        observation.now = now;
        const IrisMovement::ResetReason resetReason =
            ViolationManager::Get().ObserveMovementState(steamId, observation, trackedLoc);

        // 1. Undermesh check
        if (!CheckUndermesh(pc, character, currentLoc))
        {
            return;
        }

        // 2. Flight mode check
        if (!CheckMovementMode(pc, character))
        {
            return;
        }

        // 3. Speedhack and teleport delta check
        if (!Config::Get().GetSpeedhack().Enabled)
        {
            ViolationManager::Get().UpdateValidPosition(steamId, trackedLoc, now);
            return;
        }

        if (resetReason != IrisMovement::ResetReason::None || isUnconscious)
        {
            // Baseline was just reset, or the body is unconscious (dragged/carried, not player-driven).
            ViolationManager::Get().UpdateValidPosition(steamId, trackedLoc, now);
            return;
        }

        FVector lastPos;
        double lastTime;
        if (ViolationManager::Get().GetLastValidPosition(steamId, lastPos, lastTime))
        {
            double dt = now - lastTime;
            if (dt >= 0.15)
            {
                if (ViolationManager::Get().HasTeleportImmunity(steamId, now))
                {
                    ViolationManager::Get().UpdateValidPosition(steamId, trackedLoc, now);
                }
                else if (ViolationManager::Get().HasRubberbandCooldown(steamId, now))
                {
                    if (FVector::Distance(trackedLoc, lastPos) < 200.0f)
                    {
                        ViolationManager::Get().UpdateValidPosition(steamId, trackedLoc, now);
                    }
                }
                else
                {
                    float dist = FVector::Distance(trackedLoc, lastPos);
                    float speed = static_cast<float>(dist / dt);

                    const auto shConfig = Config::Get().GetSpeedhack();
                    float maxAllowedSpeed = isMounted ? shConfig.MaxDinoSpeed : shConfig.MaxHumanSpeed;

                    if (isMounted)
                    {
                        // Mounted / attached: NEVER rubberband the rider (SetPlayerPos yanks them off the
                        // dino). Dino speed buffs, flyer dives and Managarmr/Tek dashes are legitimate, so
                        // violations are logged + webhooked only (points only if MountedViolationsAccruePoints).
                        if (dist > shConfig.MaxTeleportDelta)
                        {
                            ViolationManager::Get().RecordViolation(
                                steamId,
                                pc,
                                EViolationType::Teleport,
                                currentLoc,
                                "Instant teleport delta: " + std::to_string(static_cast<int>(dist)) + " > " + std::to_string(static_cast<int>(shConfig.MaxTeleportDelta)) + " (mounted, no rubberband)",
                                shConfig.MountedViolationsAccruePoints
                            );
                        }
                        else if (speed > maxAllowedSpeed)
                        {
                            ViolationManager::Get().RecordViolation(
                                steamId,
                                pc,
                                EViolationType::Speedhack,
                                currentLoc,
                                "Speedhack detected: " + std::to_string(static_cast<int>(speed)) + " > " + std::to_string(static_cast<int>(maxAllowedSpeed)) + " UU/s (mounted, no rubberband)",
                                shConfig.MountedViolationsAccruePoints
                            );
                        }
                        ViolationManager::Get().UpdateValidPosition(steamId, trackedLoc, now);
                        return;
                    }

                    // Check for legitimate downward freefall (terminal velocity up to ~4200 UU/s)
                    bool isLegitimateFalling = false;
                    {
                        float dx = trackedLoc.X - lastPos.X;
                        float dy = trackedLoc.Y - lastPos.Y;
                        float dz = trackedLoc.Z - lastPos.Z;
                        float horizontalDist = std::sqrt(dx * dx + dy * dy);
                        float horizontalSpeed = static_cast<float>(horizontalDist / dt);

                        bool isFallingMode = (character->GetPrimalCharMovementMode() == EMovementMode::MOVE_Falling);
                        if (character->CharacterMovementField().Object &&
                            character->CharacterMovementField()->MovementModeField() == EMovementMode::MOVE_Falling)
                        {
                            isFallingMode = true;
                        }

                        if ((isFallingMode || dz < -500.0f) && horizontalSpeed <= shConfig.MaxHumanSpeed)
                        {
                            isLegitimateFalling = true;
                        }
                    }

                    if (dist > shConfig.MaxTeleportDelta)
                    {
                        ViolationManager::Get().RecordViolation(
                            steamId,
                            pc,
                            EViolationType::Teleport,
                            currentLoc,
                            "Instant teleport delta: " + std::to_string(static_cast<int>(dist)) + " > " + std::to_string(static_cast<int>(shConfig.MaxTeleportDelta))
                        );
                        ViolationManager::Get().SendWarningNotification(pc, shConfig.MsgTeleport);

                        if (shConfig.EnableRubberbanding)
                        {
                            pc->SetPlayerPos(lastPos.X, lastPos.Y, lastPos.Z);
                            if (character->CharacterMovementField().Object)
                            {
                                character->CharacterMovementField()->VelocityField() = FVector(0.0f, 0.0f, 0.0f);
                            }
                            ViolationManager::Get().SetRubberbandCooldown(steamId, 0.5f);
                            ViolationManager::Get().UpdateValidPosition(steamId, lastPos, now);
                        }
                    }
                    else if (speed > maxAllowedSpeed)
                    {
                        if (isLegitimateFalling)
                        {
                            // Legitimate downward freefall velocity: do not flag as speedhack
                            ViolationManager::Get().UpdateValidPosition(steamId, trackedLoc, now);
                        }
                        else
                        {
                            ViolationManager::Get().RecordViolation(
                                steamId,
                                pc,
                                EViolationType::Speedhack,
                                currentLoc,
                                "Speedhack detected: " + std::to_string(static_cast<int>(speed)) + " > " + std::to_string(static_cast<int>(maxAllowedSpeed)) + " UU/s"
                            );
                            ViolationManager::Get().SendWarningNotification(pc, shConfig.MsgSpeedhack);

                            if (shConfig.EnableRubberbanding)
                            {
                                pc->SetPlayerPos(lastPos.X, lastPos.Y, lastPos.Z);
                                if (character->CharacterMovementField().Object)
                                {
                                    character->CharacterMovementField()->VelocityField() = FVector(0.0f, 0.0f, 0.0f);
                                }
                                ViolationManager::Get().SetRubberbandCooldown(steamId, 0.5f);
                                ViolationManager::Get().UpdateValidPosition(steamId, lastPos, now);
                            }
                        }
                    }
                    else
                    {
                        ViolationManager::Get().UpdateValidPosition(steamId, trackedLoc, now);
                    }
                }
            }
        }
        else
        {
            ViolationManager::Get().UpdateValidPosition(steamId, trackedLoc, now);
        }
    }

    void OnTick(float deltaSeconds)
    {
        if (!ArkApi::GetApiUtils().GetWorld())
        {
            return;
        }

        const double now = static_cast<double>(ArkApi::GetApiUtils().GetWorld()->TimeSecondsField());

        const auto& playerControllers = ArkApi::GetApiUtils().GetWorld()->PlayerControllerListField();
        for (TWeakObjectPtr<APlayerController> playerController : playerControllers)
        {
            AShooterPlayerController* pc = static_cast<AShooterPlayerController*>(playerController.Get());
            if (!pc)
            {
                continue;
            }

            if (Config::Get().GetGeneral().IgnoreAdmins && pc->bIsAdmin()())
            {
                // Admins are not tracked; drop their baseline so leaving admin mode never counts as a teleport
                uint64 adminSteamId = pc->GetUniqueNetIdAsUINT64();
                if (adminSteamId != 0)
                {
                    ViolationManager::Get().InvalidateMovementTracking(adminSteamId);
                }
                continue;
            }

            AShooterCharacter* character = pc->GetPlayerCharacter();
            if (!character || character->IsDead())
            {
                // Dead / respawn screen / no pawn: next live tick re-baselines (no teleport flag)
                uint64 deadSteamId = pc->GetUniqueNetIdAsUINT64();
                if (deadSteamId != 0)
                {
                    ViolationManager::Get().MarkMovementIncapacitated(deadSteamId, pc, character, now);
                }
                continue;
            }

            CheckPlayerMovement(pc, character, deltaSeconds);
        }
    }

    void Hook_AShooterWeapon_FireWeapon(AShooterWeapon* _this)
    {
        if (!_this || !Config::Get().GetRapidFire().Enabled)
        {
            AShooterWeapon_FireWeapon_original(_this);
            return;
        }

        AShooterCharacter* pawn = _this->MyPawnField();
        if (!pawn)
        {
            AShooterWeapon_FireWeapon_original(_this);
            return;
        }

        AShooterPlayerController* pc = ArkApi::GetApiUtils().FindControllerFromCharacter(pawn);
        if (!pc || (Config::Get().GetGeneral().IgnoreAdmins && pc->bIsAdmin()()))
        {
            AShooterWeapon_FireWeapon_original(_this);
            return;
        }

        uint64 steamId = pc->GetUniqueNetIdAsUINT64();
        if (steamId == 0)
        {
            AShooterWeapon_FireWeapon_original(_this);
            return;
        }

        std::string weaponClass = "Unknown";
        if (_this->ClassField())
        {
            weaponClass = _this->ClassField()->NameField().ToString().ToString();
        }

        double now = 0.0;
        if (ArkApi::GetApiUtils().GetWorld())
        {
            now = static_cast<double>(ArkApi::GetApiUtils().GetWorld()->TimeSecondsField());
        }

        float minInterval = Config::Get().GetWeaponMinInterval(weaponClass);

        if (!ViolationManager::Get().ValidateFireInterval(steamId, weaponClass, now, static_cast<double>(minInterval)))
        {
            FVector loc = IrisWorld::GetCharacterWorldLocation(pawn);

            ViolationManager::Get().RecordViolation(
                steamId,
                pc,
                EViolationType::RapidFire,
                loc,
                "Rapid fire suppressed on " + weaponClass + " (min interval: " + std::to_string(minInterval) + "s)"
            );
            ViolationManager::Get().SendWarningNotification(pc, Config::Get().GetRapidFire().MsgRapidFire);
            return; // Suppress weapon fire
        }

        AShooterWeapon_FireWeapon_original(_this);
    }

    float Hook_APrimalCharacter_TakeDamage(
        APrimalCharacter* _this,
        float Damage,
        FDamageEvent* DamageEvent,
        AController* EventInstigator,
        AActor* DamageCauser)
    {
        if (!_this || Damage <= 0.0f || !Config::Get().GetMeleeReach().Enabled || !EventInstigator)
        {
            return APrimalCharacter_TakeDamage_original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);
        }

        if (EventInstigator->IsA(AShooterPlayerController::GetPrivateStaticClass()))
        {
            AShooterPlayerController* attackerPc = static_cast<AShooterPlayerController*>(EventInstigator);
            if (Config::Get().GetGeneral().IgnoreAdmins && attackerPc->bIsAdmin()())
            {
                return APrimalCharacter_TakeDamage_original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);
            }

            AShooterCharacter* attackerChar = attackerPc->GetPlayerCharacter();
            if (attackerChar && !attackerChar->IsDead() && attackerChar->GetRidingDino() == nullptr)
            {
                bool bIsMelee = false;
                float maxReach = Config::Get().GetMeleeReach().MaxHumanReach;

                if (DamageCauser != nullptr)
                {
                    FString causerName;
                    if (DamageCauser->ClassField())
                    {
                        causerName = DamageCauser->ClassField()->NameField().ToString();
                    }

                    if (causerName.Contains("Melee") || causerName.Contains("Pike") || causerName.Contains("Sword") ||
                        causerName.Contains("Club") || causerName.Contains("Spear") || causerName.Contains("Hatchet") ||
                        causerName.Contains("Pickaxe") || causerName.Contains("WeaponFists") || causerName.Contains("PrimalItem_Weapon"))
                    {
                        bIsMelee = true;
                        if (causerName.Contains("Pike") || causerName.Contains("Spear"))
                        {
                            maxReach = Config::Get().GetMeleeReach().MaxPikeReach;
                        }
                    }
                }
                else
                {
                    bIsMelee = true;
                }

                if (bIsMelee)
                {
                    if (_this->IsA(APrimalDinoCharacter::GetPrivateStaticClass()))
                    {
                        maxReach += 1200.0f;
                    }

                    FVector targetLoc = IrisWorld::GetActorWorldLocation(_this);
                    FVector attackerLoc = IrisWorld::GetCharacterWorldLocation(attackerChar);

                    float dist = FVector::Distance(targetLoc, attackerLoc);
                    if (dist > maxReach)
                    {
                        uint64 steamId = attackerPc->GetUniqueNetIdAsUINT64();
                        ViolationManager::Get().RecordViolation(
                            steamId,
                            attackerPc,
                            EViolationType::MeleeReach,
                            attackerLoc,
                            "Melee reach exceeded: " + std::to_string(static_cast<int>(dist)) + " > " + std::to_string(static_cast<int>(maxReach))
                        );
                        ViolationManager::Get().SendWarningNotification(attackerPc, Config::Get().GetMeleeReach().MsgMeleeReach);
                        return 0.0f; // Reject damage
                    }
                }
            }
        }

        return APrimalCharacter_TakeDamage_original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);
    }

    bool Hook_APrimalCharacter_TeleportTo(
        APrimalCharacter* _this,
        FVector* DestLocation,
        FRotator* DestRotation,
        bool bIsATest,
        bool bNoCheck)
    {
        if (_this && DestLocation && !bIsATest)
        {
            AShooterCharacter* shooterChar = static_cast<AShooterCharacter*>(_this);
            AShooterPlayerController* pc = ArkApi::GetApiUtils().FindControllerFromCharacter(shooterChar);
            if (pc)
            {
                uint64 steamId = pc->GetUniqueNetIdAsUINT64();
                if (steamId != 0)
                {
                    ViolationManager::Get().GrantTeleportImmunity(steamId, *DestLocation, 3.0f);
                }
            }
        }

        return APrimalCharacter_TeleportTo_original(_this, DestLocation, DestRotation, bIsATest, bNoCheck);
    }
}
