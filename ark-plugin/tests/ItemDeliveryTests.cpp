#include "ItemDelivery.h"

#include <cmath>
#include <cstdio>
#include <limits>
#include <string>
#include <vector>

using namespace HeartShop::ItemDelivery;

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

    const char* Ingot = "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot'";
    const char* FlakChest = "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Metal/PrimalItemArmor_MetalShirt.PrimalItemArmor_MetalShirt'";

    // Exactly what backend/src/services/itemCatalogDelivery.ts emits today.
    nlohmann::json LegacyBundle()
    {
        return nlohmann::json{
            {"schemaVersion", 1},
            {"orderId", "order-1"},
            {"productType", "item"},
            {"productName", "Starter kit"},
            {"item", {{"blueprint", Ingot}, {"quantity", 300}, {"quality", 0}, {"isBlueprint", false}}},
            {"items", nlohmann::json::array({
                {{"blueprint", Ingot}, {"quantity", 300}, {"quality", 0}, {"isBlueprint", false}},
                {{"blueprint", FlakChest}, {"quantity", 2}, {"quality", 3.5}, {"isBlueprint", true}},
            })},
        };
    }

    void TestParseLegacy()
    {
        std::vector<Line> Lines;
        std::string Error;

        Check(ParseLines(LegacyBundle(), Lines, Error), "legacy bundle parses");
        Check(Lines.size() == 2, "items[] wins over item");
        Check(Lines[0].Blueprint == Ingot && Lines[0].Quantity == 300 && !Lines[0].IsBlueprint, "line 0 fields");
        Check(Lines[1].Quantity == 2 && Lines[1].IsBlueprint && std::fabs(Lines[1].Quality - 3.5f) < 1e-6f, "line 1 fields");
        Check(!Lines[0].HasStatOverrides() && !Lines[1].HasStatOverrides(), "legacy payload has no stat overrides");

        // Single legacy `item` object (no items array).
        auto Single = LegacyBundle();
        Single.erase("items");
        Check(ParseLines(Single, Lines, Error) && Lines.size() == 1 && Lines[0].Quantity == 300, "single item parses");

        // Defaults: quantity 1, quality 0, isBlueprint false.
        nlohmann::json Minimal{{"items", nlohmann::json::array({{{"blueprint", Ingot}}})}};
        Check(ParseLines(Minimal, Lines, Error), "minimal entry parses");
        Check(Lines[0].Quantity == 1 && Lines[0].Quality == 0.0f && !Lines[0].IsBlueprint, "defaults applied");

        // Integral float quantity accepted (value<int>() compatibility).
        Minimal["items"][0]["quantity"] = 5.0;
        Check(ParseLines(Minimal, Lines, Error) && Lines[0].Quantity == 5, "5.0 quantity accepted");

        // Unknown keys ignored.
        Minimal["items"][0]["somethingNew"] = "x";
        Check(ParseLines(Minimal, Lines, Error), "unknown keys ignored");
    }

    void TestParseRejects()
    {
        std::vector<Line> Lines;
        std::string Error;

        Check(!ParseLines(nlohmann::json::array(), Lines, Error), "non-object payload rejected");
        Check(!ParseLines(nlohmann::json::object(), Lines, Error), "payload without items rejected");
        Check(!ParseLines(nlohmann::json{{"items", nlohmann::json::array()}}, Lines, Error), "empty items rejected");

        const auto Bad = [&](nlohmann::json Entry, const char* What) {
            nlohmann::json Payload{{"items", nlohmann::json::array({Entry})}};
            Check(!ParseLines(Payload, Lines, Error), What);
            Check(Lines.empty(), "nothing returned on rejection");
        };
        Bad(nlohmann::json("x"), "non-object entry rejected");
        Bad({{"quantity", 1}}, "missing blueprint rejected");
        Bad({{"blueprint", ""}}, "empty blueprint rejected");
        Bad({{"blueprint", 5}}, "numeric blueprint rejected");
        Bad({{"blueprint", Ingot}, {"quantity", 0}}, "quantity 0 rejected");
        Bad({{"blueprint", Ingot}, {"quantity", -3}}, "negative quantity rejected");
        Bad({{"blueprint", Ingot}, {"quantity", 1.5}}, "fractional quantity rejected");
        Bad({{"blueprint", Ingot}, {"quantity", "2"}}, "string quantity rejected");
        Bad({{"blueprint", Ingot}, {"quantity", 3000000000LL}}, "quantity above int range rejected");
        Bad({{"blueprint", Ingot}, {"quality", "high"}}, "string quality rejected");
        Bad({{"blueprint", Ingot}, {"isBlueprint", 1}}, "numeric isBlueprint rejected");
        Bad({{"blueprint", Ingot}, {"armor", -1}}, "negative armor rejected");
        Bad({{"blueprint", Ingot}, {"durability", 70000}}, "durability above 65535 rejected");
        Bad({{"blueprint", Ingot}, {"damage", "150"}}, "string damage rejected");

        // A bad second entry rejects the whole delivery (nothing is given).
        auto Bundle = LegacyBundle();
        Bundle["items"][1]["quantity"] = 0;
        Check(!ParseLines(Bundle, Lines, Error) && Error.find("items[1]") != std::string::npos, "bad second entry rejects bundle");
    }

    void TestParseStats()
    {
        std::vector<Line> Lines;
        std::string Error;
        nlohmann::json Payload{{"items", nlohmann::json::array({
            {{"blueprint", FlakChest}, {"quantity", 1}, {"armor", 250}, {"durability", 1200}, {"damage", 0}},
            {{"blueprint", FlakChest}, {"armor", nullptr}},
        })}};
        Check(ParseLines(Payload, Lines, Error), "stat payload parses");
        Check(Lines[0].Armor == 250 && Lines[0].Durability == 1200 && Lines[0].Damage == 0, "stats parsed");
        Check(Lines[0].HasStatOverrides(), "stats flagged");
        Check(Lines[1].Armor == 0 && !Lines[1].HasStatOverrides(), "null stat means no override");
    }

    void TestGiveMode()
    {
        Check(ChooseGiveMode(1, false) == GiveMode::PerUnit, "max stack 1 -> per unit (armor/saddle/weapon)");
        Check(ChooseGiveMode(0, false) == GiveMode::PerUnit, "max stack 0 -> per unit");
        Check(ChooseGiveMode(100, false) == GiveMode::TemplateIncrement, "stackable -> template increment");
        Check(ChooseGiveMode(100, true) == GiveMode::PerUnit, "blueprint of a stackable -> per unit");
    }

    void TestSlots()
    {
        // Non-stackables: one slot per unit (the old code gave ONE item for x5).
        Check(SlotsForLine(5, 1, false) == 5, "5 flak chests need 5 slots");
        Check(SlotsForLine(3, 100, true) == 3, "3 blueprints need 3 slots");
        // Stackables: ceil(quantity / max stack).
        Check(SlotsForLine(300, 300, false) == 1, "exactly one full stack");
        Check(SlotsForLine(301, 300, false) == 2, "one over a stack -> 2 slots");
        Check(SlotsForLine(1000, 100, false) == 10, "1000 at 100 -> 10 slots");
        Check(SlotsForLine(1, 100, false) == 1, "a single stackable unit -> 1 slot");
        Check(SlotsForLine(0, 100, false) == 0, "zero quantity -> 0");
        Check(SlotsForLine(std::numeric_limits<int>::max(), 1, false) == std::numeric_limits<int>::max(), "no overflow per unit");
        Check(SlotsForLine(std::numeric_limits<int>::max(), 2, false) == 1073741824LL, "no overflow stacked");

        Check(FreeSlots(290, 300, false) == 10, "free = max - current");
        Check(FreeSlots(310, 300, false) == 0, "over cap clamps to 0");
        Check(FreeSlots(-1, 300, false) == 300, "negative current treated as 0");
        Check(FreeSlots(290, 300, true) == std::numeric_limits<std::int64_t>::max(), "ignore-max inventory is unlimited");
        Check(FreeSlots(290, 0, false) == std::numeric_limits<std::int64_t>::max(), "no cap is unlimited");

        // Whole bundle all-or-nothing: 300 ingots (stack 300 -> 1) + 2 flak (2) = 3.
        const std::int64_t Needed = SlotsForLine(300, 300, false) + SlotsForLine(2, 1, false);
        Check(Needed == 3, "bundle needs 3 slots");
        Check(HasRoomFor(Needed, 3), "exactly enough room");
        Check(!HasRoomFor(Needed, 2), "one short -> defer");
        Check(HasRoomFor(0, 0), "nothing needed fits a full inventory");
    }

    void TestStatValue()
    {
        // (Desired - Initial) / (Initial * Range * Scale)
        Check(std::fabs(StatValueFor(100.0f, 50.0f, 0.1f, 0.001f, false) - 10000.0f) < 0.5f, "armor value math");
        // Desired below the base clamps to the base -> 0.
        Check(StatValueFor(10.0f, 50.0f, 0.1f, 0.001f, false) == 0.0f, "below base -> 0");
        // Percent stats add 100 to the base (damage 150% on base 0 -> base 100).
        Check(std::fabs(StatValueFor(150.0f, 0.0f, 0.1f, 0.001f, true) - 5000.0f) < 0.5f, "percent stat math");
        // Durability gets +1 like ArkShop.
        Check(std::fabs(StatValueFor(100.0f, 50.0f, 0.1f, 0.001f, false, true) - 10001.0f) < 0.5f, "durability +1");
        // Clamp to the uint16 the engine stores.
        Check(StatValueFor(1.0e9f, 50.0f, 0.1f, 0.001f, false) == 65535.0f, "clamped to 65535");
        // Degenerate stat info never produces garbage.
        Check(StatValueFor(100.0f, 0.0f, 0.1f, 0.001f, false) == 0.0f, "zero denominator -> 0");
        Check(StatValueFor(100.0f, 50.0f, -0.1f, 0.001f, false) == 0.0f, "negative result -> 0");
    }
}

int main()
{
    TestParseLegacy();
    TestParseRejects();
    TestParseStats();
    TestGiveMode();
    TestSlots();
    TestStatValue();

    if (Failures != 0)
    {
        std::fprintf(stderr, "%d check(s) failed\n", Failures);
        return 1;
    }
    std::printf("ItemDeliveryTests passed\n");
    return 0;
}
