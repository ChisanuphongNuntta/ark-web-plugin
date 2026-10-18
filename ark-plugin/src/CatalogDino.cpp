#include "CatalogDino.h"

#include <atomic>
#include <iterator>

namespace HeartShop::CatalogDino
{
namespace
{
    std::atomic<bool> CryopodDeliveryAvailable{false};

    template <typename Callable>
    bool SafeStep(const Callable& Step)
    {
        if (!Step) return false;
        try
        {
            return Step();
        }
        catch (...)
        {
            return false;
        }
    }

    void SafeDiscard(const std::function<void()>& Discard)
    {
        if (!Discard) return;
        try
        {
            Discard();
        }
        catch (...)
        {
        }
    }
}

    void SetCryopodDeliveryAvailable(const bool Available)
    {
        CryopodDeliveryAvailable.store(Available, std::memory_order_relaxed);
    }

    bool IsCryopodDeliveryAvailable()
    {
        return CryopodDeliveryAvailable.load(std::memory_order_relaxed);
    }

    bool ParseRequest(const nlohmann::json& Payload, Request& Out, std::string& Error)
    {
        Out = Request{};
        Error.clear();

        if (!Payload.is_object())
        {
            Error = "payload is not an object";
            return false;
        }

        const auto SchemaVersion = Payload.find("schemaVersion");
        if (SchemaVersion == Payload.end() || !SchemaVersion->is_number_integer() || SchemaVersion->get<long long>() != 1)
        {
            Error = "schemaVersion must be 1";
            return false;
        }

        const auto ProductType = Payload.find("productType");
        if (ProductType == Payload.end() || !ProductType->is_string() || ProductType->get<std::string>() != "dino")
        {
            Error = "productType must be \"dino\"";
            return false;
        }

        const auto Dino = Payload.find("dino");
        if (Dino == Payload.end() || !Dino->is_object())
        {
            Error = "dino must be an object";
            return false;
        }

        const auto Blueprint = Dino->find("blueprint");
        if (Blueprint == Dino->end() || !Blueprint->is_string() || Blueprint->get<std::string>().empty())
        {
            Error = "dino.blueprint must be a non-empty string";
            return false;
        }

        const auto Level = Dino->find("level");
        if (Level == Dino->end() || !Level->is_number_integer())
        {
            Error = "dino.level must be an integer";
            return false;
        }
        const long long LevelValue = Level->get<long long>();
        if (LevelValue < 1 || LevelValue > 10000)
        {
            Error = "dino.level outside 1..10000";
            return false;
        }

        const auto ForceTame = Dino->find("forceTame");
        if (ForceTame == Dino->end() || !ForceTame->is_boolean() || !ForceTame->get<bool>())
        {
            Error = "dino.forceTame must be true";
            return false;
        }

        bool Neutered = false;
        if (const auto Field = Dino->find("neutered"); Field != Dino->end() && !Field->is_null())
        {
            if (!Field->is_boolean())
            {
                Error = "dino.neutered must be boolean";
                return false;
            }
            Neutered = Field->get<bool>();
        }

        bool Cryopod = false;
        if (const auto Field = Dino->find("cryopod"); Field != Dino->end() && !Field->is_null())
        {
            if (!Field->is_boolean())
            {
                Error = "dino.cryopod must be boolean";
                return false;
            }
            Cryopod = Field->get<bool>();
        }

        Out.Blueprint = Blueprint->get<std::string>();
        Out.Level = static_cast<int>(LevelValue);
        Out.Neutered = Neutered;
        Out.Cryopod = Cryopod;
        return true;
    }

    Outcome RunCryopodDelivery(const CryopodSteps& Steps, std::string& Error)
    {
        Error.clear();

        // 1. Preflight: nothing in the game has been touched yet.
        PreflightResult Preflight = PreflightResult::Fail;
        std::string PreflightError;
        if (Steps.Preflight)
        {
            try
            {
                Preflight = Steps.Preflight(PreflightError);
            }
            catch (...)
            {
                Preflight = PreflightResult::Fail;
            }
        }

        switch (Preflight)
        {
            case PreflightResult::Ready:
                break;
            case PreflightResult::Defer:
                Error = PreflightError.empty() ? "Cryopod delivery deferred" : PreflightError;
                return Outcome::Deferred;
            case PreflightResult::FallbackToLiveSpawn:
                // The server cannot make cryopods: deliver exactly like the legacy path.
                if (!SafeStep(Steps.SpawnDino))
                {
                    Error = "Catalog dino spawn failed";
                    return Outcome::Failed;
                }
                Error = (PreflightError.empty() ? std::string("Cryopod unavailable") : PreflightError) +
                        "; delivered as a live tame";
                return Outcome::DeliveredAsLiveTame;
            case PreflightResult::Fail:
            default:
                Error = PreflightError.empty() ? "Cryopod delivery preflight failed" : PreflightError;
                return Outcome::Failed;
        }

        // 2. Spawn the tame exactly like the legacy path. Failure = nothing given.
        if (!SafeStep(Steps.SpawnDino))
        {
            Error = "Catalog dino spawn failed";
            return Outcome::Failed;
        }

        // 3. Build the cryopod (not in any inventory yet). If that fails, remove the
        //    spawned dino so a retry cannot duplicate it; if the dino cannot be
        //    removed, it stays as the delivered asset.
        if (!SafeStep(Steps.BuildCryopod))
        {
            SafeDiscard(Steps.DiscardCryopod);
            if (SafeStep(Steps.DestroyDino))
            {
                Error = "Cryopod item could not be created; spawned dino removed for retry";
                return Outcome::Failed;
            }
            Error = "Cryopod item could not be created and the spawned dino could not be removed; "
                    "delivered as a live tame";
            return Outcome::DeliveredAsLiveTame;
        }

        // 4. Remove the live dino BEFORE the cryopod becomes reachable. If the actor
        //    survives, the live tame is the delivery and the pod is thrown away.
        if (!SafeStep(Steps.DestroyDino))
        {
            SafeDiscard(Steps.DiscardCryopod);
            Error = "Spawned dino could not be removed; cryopod discarded, delivered as a live tame";
            return Outcome::DeliveredAsLiveTame;
        }

        // 5. Hand over the cryopod. If the inventory refuses it the buyer has nothing
        //    (dino already gone, pod discarded): report failure so the backend retries.
        if (!SafeStep(Steps.AddCryopodToInventory))
        {
            SafeDiscard(Steps.DiscardCryopod);
            Error = "Cryopod could not be added to the player inventory";
            return Outcome::Failed;
        }

        return Outcome::DeliveredInCryopod;
    }

    const char* OutcomeName(const Outcome Value)
    {
        switch (Value)
        {
            case Outcome::DeliveredInCryopod: return "delivered_in_cryopod";
            case Outcome::DeliveredAsLiveTame: return "delivered_as_live_tame";
            case Outcome::Deferred: return "deferred";
            case Outcome::Failed: return "failed";
        }
        return "unknown";
    }

    NoticeThrottle::NoticeThrottle(const Clock::duration IntervalValue, const std::size_t MaxKeysValue)
        : Interval(IntervalValue), MaxKeys(MaxKeysValue == 0 ? 1 : MaxKeysValue)
    {
    }

    bool NoticeThrottle::ShouldNotify(const std::string& Key, const Clock::time_point Now)
    {
        const auto Found = LastNotice.find(Key);
        if (Found != LastNotice.end())
        {
            if (Now - Found->second < Interval)
            {
                return false;
            }
            Found->second = Now;
            return true;
        }

        if (LastNotice.size() >= MaxKeys)
        {
            // Drop expired keys first; if still full, start over (worst case one
            // extra notice per key, never unbounded memory).
            for (auto It = LastNotice.begin(); It != LastNotice.end();)
            {
                It = (Now - It->second >= Interval) ? LastNotice.erase(It) : std::next(It);
            }
            if (LastNotice.size() >= MaxKeys)
            {
                LastNotice.clear();
            }
        }
        LastNotice.emplace(Key, Now);
        return true;
    }
}
