#include "CatalogDino.h"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <string>

using namespace HeartShop::CatalogDino;

namespace
{
    int Failures = 0;

    void Check(bool Condition, const char* What)
    {
        if (!Condition)
        {
            std::fprintf(stderr, "FAILED: %s\n", What);
            ++Failures;
        }
    }

    nlohmann::json BasePayload()
    {
        return nlohmann::json{
            {"schemaVersion", 1},
            {"orderId", "order-1"},
            {"productType", "dino"},
            {"productName", "Rex (Lv.150)"},
            {"dino", {
                {"blueprint", "Blueprint'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP'"},
                {"level", 150},
                {"forceTame", true},
                {"neutered", false},
            }},
        };
    }

    void TestParse()
    {
        Request Parsed;
        std::string Error;

        // Legacy payload (no cryopod key) -> old live-spawn path.
        Check(ParseRequest(BasePayload(), Parsed, Error), "legacy payload parses");
        Check(!Parsed.Cryopod, "missing cryopod flag means live spawn");
        Check(Parsed.Level == 150 && !Parsed.Neutered, "level/neutered parsed");
        Check(Parsed.Blueprint.find("Rex_Character_BP") != std::string::npos, "blueprint parsed");

        auto Payload = BasePayload();
        Payload["dino"]["cryopod"] = true;
        Payload["dino"]["neutered"] = true;
        Check(ParseRequest(Payload, Parsed, Error), "cryopod payload parses");
        Check(Parsed.Cryopod && Parsed.Neutered, "cryopod + neutered flags parsed");

        Payload["dino"]["cryopod"] = false;
        Check(ParseRequest(Payload, Parsed, Error) && !Parsed.Cryopod, "explicit cryopod=false means live spawn");

        Payload["dino"]["cryopod"] = nullptr;
        Check(ParseRequest(Payload, Parsed, Error) && !Parsed.Cryopod, "null cryopod means live spawn");

        Payload["dino"]["cryopod"] = "true";
        Check(!ParseRequest(Payload, Parsed, Error), "string cryopod rejected");
        Payload["dino"]["cryopod"] = 1;
        Check(!ParseRequest(Payload, Parsed, Error), "numeric cryopod rejected");

        Payload = BasePayload();
        Payload["schemaVersion"] = 2;
        Check(!ParseRequest(Payload, Parsed, Error), "schemaVersion 2 rejected");

        Payload = BasePayload();
        Payload["productType"] = "item";
        Check(!ParseRequest(Payload, Parsed, Error), "non-dino productType rejected");

        Payload = BasePayload();
        Payload["dino"]["forceTame"] = false;
        Check(!ParseRequest(Payload, Parsed, Error), "forceTame=false rejected");
        Payload["dino"].erase("forceTame");
        Check(!ParseRequest(Payload, Parsed, Error), "missing forceTame rejected");

        Payload = BasePayload();
        Payload["dino"]["level"] = 0;
        Check(!ParseRequest(Payload, Parsed, Error), "level 0 rejected");
        Payload["dino"]["level"] = 10001;
        Check(!ParseRequest(Payload, Parsed, Error), "level 10001 rejected");
        Payload["dino"]["level"] = 10000;
        Check(ParseRequest(Payload, Parsed, Error), "level 10000 accepted");
        Payload["dino"]["level"] = "150";
        Check(!ParseRequest(Payload, Parsed, Error), "string level rejected");

        Payload = BasePayload();
        Payload["dino"]["blueprint"] = "";
        Check(!ParseRequest(Payload, Parsed, Error), "empty blueprint rejected");

        Payload = BasePayload();
        Payload["dino"]["neutered"] = "yes";
        Check(!ParseRequest(Payload, Parsed, Error), "non-boolean neutered rejected");
        Payload["dino"].erase("neutered");
        Check(ParseRequest(Payload, Parsed, Error) && !Parsed.Neutered, "missing neutered defaults to false");

        Check(!ParseRequest(nlohmann::json::array(), Parsed, Error), "array payload rejected");
        Payload = BasePayload();
        Payload["dino"] = "rex";
        Check(!ParseRequest(Payload, Parsed, Error), "non-object dino rejected");
    }

    // Simulated world: tracks what the buyer actually ends up with.
    struct World
    {
        PreflightResult Preflight = PreflightResult::Ready;
        bool SpawnOk = true;
        bool BuildOk = true;
        bool DestroyOk = true;
        bool AddOk = true;
        bool ThrowInBuild = false;

        bool LiveDino = false;
        bool PodPrepared = false;
        bool PodInInventory = false;
        int SpawnCalls = 0;

        CryopodSteps Steps()
        {
            CryopodSteps S;
            S.Preflight = [this](std::string& Error) {
                if (Preflight == PreflightResult::Defer) Error = "Inventory full";
                if (Preflight == PreflightResult::FallbackToLiveSpawn) Error = "Could not load cryopod item class";
                if (Preflight == PreflightResult::Fail) Error = "Preflight failed";
                return Preflight;
            };
            S.SpawnDino = [this]() {
                ++SpawnCalls;
                if (!SpawnOk) return false;
                LiveDino = true;
                return true;
            };
            S.BuildCryopod = [this]() {
                if (ThrowInBuild) throw std::runtime_error("native failure");
                if (!BuildOk) return false;
                PodPrepared = true;
                return true;
            };
            S.DestroyDino = [this]() {
                if (!DestroyOk) return false;
                LiveDino = false;
                return true;
            };
            S.AddCryopodToInventory = [this]() {
                if (!AddOk || !PodPrepared) return false;
                PodInInventory = true;
                PodPrepared = false;
                return true;
            };
            S.DiscardCryopod = [this]() { PodPrepared = false; };
            return S;
        }
    };

    void TestRunnerExhaustive()
    {
        // Every combination of step results must keep the two invariants:
        //  - never a cryopod in the inventory AND a live dino;
        //  - success <=> the buyer holds exactly one asset; failure <=> nothing.
        const PreflightResult Preflights[] = {
            PreflightResult::Ready,
            PreflightResult::Defer,
            PreflightResult::FallbackToLiveSpawn,
            PreflightResult::Fail,
        };
        for (const PreflightResult Preflight : Preflights)
        for (int Mask = 0; Mask < 32; ++Mask)
        {
            World W;
            W.Preflight = Preflight;
            W.SpawnOk = (Mask & 1) != 0;
            W.BuildOk = (Mask & 2) != 0;
            W.DestroyOk = (Mask & 4) != 0;
            W.AddOk = (Mask & 8) != 0;
            W.ThrowInBuild = (Mask & 16) != 0;

            std::string Error;
            const Outcome Result = RunCryopodDelivery(W.Steps(), Error);

            Check(!(W.LiveDino && W.PodInInventory), "never both a live dino and a cryopod");
            Check(!W.PodPrepared, "a prepared cryopod never leaks outside an inventory");
            Check(W.SpawnCalls <= 1, "dino spawned at most once per attempt");

            const int Assets = (W.LiveDino ? 1 : 0) + (W.PodInInventory ? 1 : 0);
            switch (Result)
            {
                case Outcome::DeliveredInCryopod:
                    Check(W.PodInInventory && !W.LiveDino, "cryopod outcome means pod only");
                    Check(Error.empty(), "cryopod outcome has no error");
                    break;
                case Outcome::DeliveredAsLiveTame:
                    Check(W.LiveDino && !W.PodInInventory, "live-tame outcome means dino only");
                    Check(!Error.empty(), "live-tame fallback carries a warning");
                    break;
                case Outcome::Deferred:
                    Check(Preflight == PreflightResult::Defer, "only a deferring preflight defers");
                    Check(Assets == 0 && W.SpawnCalls == 0, "deferred outcome touches nothing");
                    Check(!Error.empty(), "deferred outcome carries a reason");
                    break;
                case Outcome::Failed:
                    Check(Assets == 0, "failed outcome means nothing was given");
                    Check(!Error.empty(), "failed outcome carries an error");
                    break;
            }
            Check(Assets <= 1, "at most one asset per delivery");
            if (Preflight == PreflightResult::Defer)
                Check(Result == Outcome::Deferred, "defer preflight always defers");
            if (Preflight == PreflightResult::Fail)
                Check(Result == Outcome::Failed && W.SpawnCalls == 0, "failing preflight never spawns");
            if (Preflight == PreflightResult::FallbackToLiveSpawn)
                Check(Result == (W.SpawnOk ? Outcome::DeliveredAsLiveTame : Outcome::Failed) && !W.PodInInventory,
                      "missing cryopod class falls back to the legacy live spawn");
        }
    }

    void TestRunnerScenarios()
    {
        std::string Error;

        World Happy;
        Check(RunCryopodDelivery(Happy.Steps(), Error) == Outcome::DeliveredInCryopod, "happy path delivers cryopod");

        World Full;
        Full.Preflight = PreflightResult::Defer;
        Check(RunCryopodDelivery(Full.Steps(), Error) == Outcome::Deferred, "inventory full defers (no attempt used)");
        Check(Error == "Inventory full", "preflight error propagated");
        Check(Full.SpawnCalls == 0, "inventory full never spawns");

        World NoClass;
        NoClass.Preflight = PreflightResult::FallbackToLiveSpawn;
        Check(RunCryopodDelivery(NoClass.Steps(), Error) == Outcome::DeliveredAsLiveTame,
              "missing cryopod class delivers the legacy live tame");
        Check(NoClass.LiveDino && NoClass.SpawnCalls == 1 && !NoClass.PodInInventory, "fallback spawns exactly once, no pod");
        Check(Error.find("delivered as a live tame") != std::string::npos, "fallback carries a warning");

        World NoClassNoSpawn;
        NoClassNoSpawn.Preflight = PreflightResult::FallbackToLiveSpawn;
        NoClassNoSpawn.SpawnOk = false;
        Check(RunCryopodDelivery(NoClassNoSpawn.Steps(), Error) == Outcome::Failed, "fallback spawn failure fails");

        World PreflightThrows;
        CryopodSteps Throwing = PreflightThrows.Steps();
        Throwing.Preflight = [](std::string&) -> PreflightResult { throw std::runtime_error("boom"); };
        Check(RunCryopodDelivery(Throwing, Error) == Outcome::Failed && PreflightThrows.SpawnCalls == 0,
              "throwing preflight fails closed");

        World AddRefused;
        AddRefused.AddOk = false;
        Check(RunCryopodDelivery(AddRefused.Steps(), Error) == Outcome::Failed, "inventory refusal fails for retry");
        Check(!AddRefused.LiveDino, "inventory refusal leaves no dino behind");

        World Undestroyable;
        Undestroyable.DestroyOk = false;
        Check(RunCryopodDelivery(Undestroyable.Steps(), Error) == Outcome::DeliveredAsLiveTame,
              "undestroyable dino falls back to live tame");

        World BuildThrows;
        BuildThrows.ThrowInBuild = true;
        Check(RunCryopodDelivery(BuildThrows.Steps(), Error) == Outcome::Failed, "build exception fails for retry");
        Check(!BuildThrows.LiveDino, "build exception removes the spawned dino");

        CryopodSteps Empty;
        Check(RunCryopodDelivery(Empty, Error) == Outcome::Failed, "missing steps fail closed");

        Check(std::string(CryopodCapability) == "delivery.dino.cryopod.v1", "capability name");
        Check(std::string(OutcomeName(Outcome::DeliveredInCryopod)) == "delivered_in_cryopod", "outcome name");
        Check(std::string(OutcomeName(Outcome::Deferred)) == "deferred", "deferred outcome name");
    }

    void TestCapabilityFlag()
    {
        Check(!IsCryopodDeliveryAvailable(), "cryopod capability is off until the class resolves");
        SetCryopodDeliveryAvailable(true);
        Check(IsCryopodDeliveryAvailable(), "cryopod capability on after resolve");
        SetCryopodDeliveryAvailable(false);
        Check(!IsCryopodDeliveryAvailable(), "cryopod capability can be withdrawn");
    }

    void TestNoticeThrottle()
    {
        using namespace std::chrono;
        NoticeThrottle Throttle(seconds(60), 3);
        const auto T0 = NoticeThrottle::Clock::time_point{} + hours(1);

        Check(Throttle.ShouldNotify("a", T0), "first notice sent");
        Check(!Throttle.ShouldNotify("a", T0 + seconds(30)), "repeat within interval suppressed");
        Check(Throttle.ShouldNotify("b", T0 + seconds(30)), "other key not suppressed");
        Check(Throttle.ShouldNotify("a", T0 + seconds(60)), "notice again after interval");
        Check(!Throttle.ShouldNotify("a", T0 + seconds(90)), "interval restarts from last notice");

        Check(Throttle.ShouldNotify("c", T0 + seconds(61)), "third key");
        Check(Throttle.ShouldNotify("d", T0 + seconds(200)), "fourth key evicts expired entries");
        Check(Throttle.Size() <= 3, "throttle memory is bounded");
    }

    void TestGender()
    {
        Gender Value = Gender::Random;
        Check(ParseGender("male", Value) && Value == Gender::Male, "male parses");
        Check(ParseGender("FEMALE", Value) && Value == Gender::Female, "gender is case-insensitive");
        Check(ParseGender("Random", Value) && Value == Gender::Random, "random parses");
        Value = Gender::Male;
        Check(!ParseGender("", Value) && Value == Gender::Male, "empty gender rejected, output untouched");
        Check(!ParseGender("m", Value), "abbreviation rejected");
        Check(!ParseGender("female ", Value), "trailing space rejected");
        Check(std::string(GenderName(Gender::Female)) == "female", "gender name");
    }

    void TestExtras()
    {
        Request Parsed;
        std::string Error;

        // Legacy payload: every extra at its legacy default.
        Check(ParseRequest(BasePayload(), Parsed, Error), "legacy payload parses");
        Check(Parsed.Sex == Gender::Random, "no gender -> random (untouched)");
        Check(Parsed.SaddleBlueprint.empty(), "no saddle");
        Check(Parsed.StryderHead == StryderAttachmentNone && Parsed.StryderChest == StryderAttachmentNone,
              "no stryder attachments");

        auto Payload = BasePayload();
        Payload["dino"]["cryopod"] = true;
        Payload["dino"]["gender"] = "female";
        Payload["dino"]["saddleBlueprint"] =
            "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Saddles/PrimalItemArmor_RexSaddle.PrimalItemArmor_RexSaddle'";
        Payload["dino"]["stryderHead"] = 2;
        Payload["dino"]["stryderChest"] = 3;
        Check(ParseRequest(Payload, Parsed, Error), "payload with extras parses");
        Check(Parsed.Cryopod && Parsed.Sex == Gender::Female, "gender parsed with cryopod");
        Check(Parsed.SaddleBlueprint.find("RexSaddle") != std::string::npos, "saddle parsed");
        Check(Parsed.StryderHead == 2 && Parsed.StryderChest == 3, "stryder attachments parsed");

        // null extras behave like absent ones.
        for (const char* Key : {"gender", "saddleBlueprint", "stryderHead", "stryderChest"})
        {
            auto Nulls = BasePayload();
            Nulls["dino"][Key] = nullptr;
            Check(ParseRequest(Nulls, Parsed, Error), "null extra accepted");
        }

        const auto Rejects = [&](const char* Key, nlohmann::json Value, const char* What) {
            auto Bad = BasePayload();
            Bad["dino"][Key] = Value;
            Check(!ParseRequest(Bad, Parsed, Error), What);
            Check(Error.find(Key) != std::string::npos, "error names the field");
        };
        Rejects("gender", "unknown", "unknown gender rejected");
        Rejects("gender", true, "boolean gender rejected");
        Rejects("saddleBlueprint", 12, "numeric saddle rejected");
        Rejects("stryderHead", 3, "head index 3 (outside ArkShop's range) rejected");
        Rejects("stryderHead", -2, "head index -2 rejected");
        Rejects("stryderChest", 4, "chest index 4 rejected");
        Rejects("stryderChest", "1", "string chest index rejected");

        // Tek Stryder detection and attachment tables.
        Check(IsTekStryderBlueprint(
                  "Blueprint'/Game/Genesis2/Dinos/TekStrider/TekStrider_Character_BP.TekStrider_Character_BP'"),
              "tek stryder detected");
        Check(!IsTekStryderBlueprint(BasePayload()["dino"]["blueprint"].get<std::string>()), "rex is not a stryder");
        for (int Index = 0; Index <= StryderHeadMax; ++Index)
            Check(StryderHeadBlueprint(Index) != nullptr, "head attachment blueprint exists");
        for (int Index = 0; Index <= StryderChestMax; ++Index)
            Check(StryderChestBlueprint(Index) != nullptr, "chest attachment blueprint exists");
        Check(StryderHeadBlueprint(StryderHeadMax + 1) == nullptr && StryderHeadBlueprint(-1) == nullptr,
              "head out of range -> none");
        Check(StryderChestBlueprint(StryderChestMax + 1) == nullptr, "chest out of range -> none");
    }
}

int main()
{
    TestParse();
    TestRunnerExhaustive();
    TestRunnerScenarios();
    TestCapabilityFlag();
    TestNoticeThrottle();
    TestGender();
    TestExtras();
    if (Failures != 0)
    {
        std::fprintf(stderr, "%d check(s) failed\n", Failures);
        return EXIT_FAILURE;
    }
    std::puts("CatalogDinoTests passed");
    return EXIT_SUCCESS;
}
