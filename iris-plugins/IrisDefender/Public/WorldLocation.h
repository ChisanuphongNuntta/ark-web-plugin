#pragma once

#include "IrisDefender.h"
#include "MovementLogic.h"

#include <cstddef>

// World-space position helpers.
//
// USceneComponent::RelativeLocation is only a world position when the component has
// no attach parent. A survivor riding a dino, sitting in a passenger seat / chair or
// being carried by a flyer has its root capsule attached to the parent, so
// RelativeLocation is a small socket offset (~0,0,0). Reading it as a world position
// made CheckPlayerMovement see a ~260,000 UU "instant teleport" every tick and
// rubberband the rider. ComponentToWorld is the authoritative world transform.

static_assert(sizeof(FTransform) == IrisMovement::kTransformSize, "FTransform layout mismatch (expected 48 bytes)");
static_assert(offsetof(FTransform, Translation) == IrisMovement::kTransformTranslationOffset, "FTransform::Translation offset mismatch");

namespace IrisWorld
{
    inline bool TryGetComponentWorldLocation(USceneComponent* component, FVector& out)
    {
        if (component == nullptr)
        {
            return false;
        }

        const FTransform& xf = component->ComponentToWorldField();
        IrisMovement::Vec3 v{};
        if (!IrisMovement::ExtractTransformTranslation(&xf, v))
        {
            return false;
        }

        out = FVector(v.X, v.Y, v.Z);
        return true;
    }

    // World location of an actor's root component.
    // Order: ComponentToWorld -> RelativeLocation of an UNATTACHED root (== world, legacy
    // behaviour) -> DefaultActorLocation.
    inline FVector GetActorWorldLocation(AActor* actor)
    {
        if (actor == nullptr)
        {
            return FVector(0.0f, 0.0f, 0.0f);
        }

        USceneComponent* root = actor->RootComponentField();
        if (root != nullptr)
        {
            FVector out(0.0f, 0.0f, 0.0f);
            if (TryGetComponentWorldLocation(root, out))
            {
                return out;
            }
            if (root->AttachParentField() == nullptr)
            {
                return root->RelativeLocationField();
            }
        }

        return actor->DefaultActorLocationField();
    }

    // Survivor world location. Same as GetActorWorldLocation, but when the survivor is
    // attached and its transform is unusable, falls back to the ridden dino's position
    // before DefaultActorLocation.
    inline FVector GetCharacterWorldLocation(AShooterCharacter* character)
    {
        if (character == nullptr)
        {
            return FVector(0.0f, 0.0f, 0.0f);
        }

        USceneComponent* root = character->RootComponentField();
        if (root != nullptr)
        {
            FVector out(0.0f, 0.0f, 0.0f);
            if (TryGetComponentWorldLocation(root, out))
            {
                return out;
            }
            if (root->AttachParentField() == nullptr)
            {
                return root->RelativeLocationField();
            }
        }

        APrimalDinoCharacter* dino = character->GetRidingDino();
        if (dino != nullptr && static_cast<AActor*>(dino) != static_cast<AActor*>(character))
        {
            USceneComponent* dinoRoot = dino->RootComponentField();
            if (dinoRoot != nullptr)
            {
                FVector out(0.0f, 0.0f, 0.0f);
                if (dinoRoot->AttachParentField() == nullptr)
                {
                    return dinoRoot->RelativeLocationField();
                }
                if (TryGetComponentWorldLocation(dinoRoot, out))
                {
                    return out;
                }
            }
        }

        return character->DefaultActorLocationField();
    }

    // True while the survivor's position is driven by something else: riding a dino,
    // passenger seat, carried by a flyer, sitting on a seating structure.
    inline bool IsAttachedOrMounted(AShooterCharacter* character)
    {
        if (character == nullptr)
        {
            return false;
        }

        if (character->GetRidingDino() != nullptr)
        {
            return true;
        }

        USceneComponent* root = character->RootComponentField();
        if (root != nullptr && root->AttachParentField() != nullptr)
        {
            return true;
        }

        return character->bIsOnSeatingStructureField();
    }
}
