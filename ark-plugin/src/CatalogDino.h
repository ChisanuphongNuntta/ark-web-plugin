#pragma once

// Pure (ARK-free) logic for the `dino_catalog` delivery type so it can be unit
// tested by CTest without the game: payload validation and the step ordering
// of the cryopod delivery path.

#include <chrono>
#include <cstddef>
#include <functional>
#include <string>
#include <unordered_map>

#include <nlohmann/json.hpp>

namespace HeartShop::CatalogDino
{
    // Capability advertised in the heartbeat once the plugin can deliver catalog
    // dinos inside a cryopod (backend then sets dino.cryopod = true). Only
    // advertised after the cryopod item class has been resolved on this server
    // (see SetCryopodDeliveryAvailable), so a server whose cryopod class cannot be
    // loaded keeps receiving legacy live-spawn payloads.
    inline constexpr const char* CryopodCapability = "delivery.dino.cryopod.v1";

    // Process-wide flag read by the heartbeat. Thread-safe.
    void SetCryopodDeliveryAvailable(bool Available);
    bool IsCryopodDeliveryAvailable();

    // Vanilla ASE empty cryopod (same default as ArkShop's CryoItemPath).
    inline constexpr const char* CryopodItemBlueprint =
        "Blueprint'/Game/Extinction/CoreBlueprints/Weapons/PrimalItem_WeaponEmptyCryopod.PrimalItem_WeaponEmptyCryopod'";

    struct Request
    {
        std::string Blueprint;
        int Level = 0;
        bool Neutered = false;
        bool Cryopod = false;
    };

    // Validates a dino_catalog payload with exactly the guards the plugin has
    // always applied (schemaVersion 1, productType "dino", blueprint non-empty,
    // level 1..10000, forceTame == true), plus: neutered/cryopod, when present,
    // must be booleans. A missing cryopod flag means the legacy live-spawn path.
    bool ParseRequest(const nlohmann::json& Payload, Request& Out, std::string& Error);

    enum class Outcome
    {
        // Cryopod holding the tame is in the buyer's inventory; spawned actor gone.
        DeliveredInCryopod,
        // The tame is alive next to the buyer (the pre-cryopod behaviour), either
        // because the cryopod could not be completed or because this server cannot
        // make cryopods. Counts as delivered; the buyer is told it is NOT in a pod.
        DeliveredAsLiveTame,
        // Nothing was given and nothing was touched, because of a transient buyer
        // condition (inventory full, no inventory yet). The caller must abort the
        // journal entry and RELEASE the lease (no backend attempt is consumed).
        Deferred,
        // Nothing was given to the buyer. The caller must abort the journal entry
        // and report failure so the backend retries (or dead-letters/refunds).
        Failed
    };

    enum class PreflightResult
    {
        // Inventory present with a free slot and the cryopod class resolves.
        Ready,
        // Transient buyer condition: do not touch the game, retry later for free.
        Defer,
        // This server cannot make cryopods (class missing): spawn the live tame
        // exactly like the legacy path instead of failing every retry.
        FallbackToLiveSpawn,
        // Anything else: nothing given, report failure.
        Fail
    };

    // Each step returns true on success. A C++ exception thrown by a step is
    // treated as a failed step. Native faults (SEH, e.g. access violations) are
    // NOT C++ exceptions under /EHsc; the game-side steps in HeartShop.cpp wrap
    // their native calls in a __try/__except guard that converts them to a
    // failed step before they reach this runner.
    struct CryopodSteps
    {
        // No game mutation: player/inventory present, inventory has a free slot,
        // cryopod item class resolves.
        std::function<PreflightResult(std::string& Error)> Preflight;
        // Spawn the force-tamed dino owned by the buyer (same call as the legacy path).
        std::function<bool()> SpawnDino;
        // Create a cryopod item that is NOT yet in any inventory and store the
        // spawned dino's data in it.
        std::function<bool()> BuildCryopod;
        // Destroy the spawned dino actor. Returns true only when it is gone.
        std::function<bool()> DestroyDino;
        // Add the prepared cryopod to the buyer's inventory.
        std::function<bool()> AddCryopodToInventory;
        // Release a prepared cryopod that never reached an inventory.
        std::function<void()> DiscardCryopod;
    };

    // Runs the steps in an order that can never leave BOTH a cryopod in the
    // inventory and a live dino in the world, and never reports success when
    // the buyer received nothing:
    //   Preflight -> SpawnDino -> BuildCryopod -> DestroyDino -> AddCryopodToInventory
    // The dino is destroyed before the cryopod becomes reachable, so a failure
    // after the destroy leaves nothing (Failed -> retry) and a failed destroy
    // keeps the live tame instead of handing out the pod. (ArkShop's GiveDino adds
    // the pod first and destroys second; that order can hand out a pod AND leave
    // the dino alive when the destroy fails, so it is deliberately not copied.)
    // Preflight Defer -> Deferred (nothing touched); FallbackToLiveSpawn -> only
    // SpawnDino runs (DeliveredAsLiveTame, or Failed when the spawn fails).
    Outcome RunCryopodDelivery(const CryopodSteps& Steps, std::string& Error);

    const char* OutcomeName(Outcome Value);

    // Rate-limits a per-key player notice (e.g. "inventory full") so a deferred
    // delivery that is re-claimed every poll does not spam chat. Not thread-safe;
    // used from the game thread only.
    class NoticeThrottle
    {
    public:
        using Clock = std::chrono::steady_clock;

        explicit NoticeThrottle(Clock::duration Interval, std::size_t MaxKeys = 1024);

        // True (and records Now) when Key was never notified or its last notice is
        // at least Interval old.
        bool ShouldNotify(const std::string& Key, Clock::time_point Now);

        std::size_t Size() const { return LastNotice.size(); }

    private:
        Clock::duration Interval;
        std::size_t MaxKeys;
        std::unordered_map<std::string, Clock::time_point> LastNotice;
    };
}
