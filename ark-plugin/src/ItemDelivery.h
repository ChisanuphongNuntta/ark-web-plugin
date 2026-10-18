#pragma once

// Pure (ARK-free) logic for the `order` (item / item bundle) delivery type so it
// can be unit tested by CTest without the game: payload parsing, the give
// strategy per line, the inventory slot preflight and the item stat math.
//
// The game-side give (HeartShop.cpp GiveItemsToPlayer) follows ArkShop's
// Store::BuyItem (ASE-Plugins-master/ArkShop/ArkShop/Private/Store.cpp):
//   * non-stackable items (max stack <= 1: armor, saddles, weapons) and forced
//     blueprints -> one UPrimalItem::AddNewItem per unit (quantity 1 each), with
//     optional ApplyItemStats-equivalent armor/durability/damage overrides;
//   * stackable items -> UPrimalInventoryComponent::IncrementItemTemplateQuantity
//     with the total, which tops up existing stacks and splits the rest into
//     max-size stacks.

#include <cstdint>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

namespace HeartShop::ItemDelivery
{
    // Advertised in the heartbeat: the plugin applies the optional per-line
    // armor/durability/damage overrides. The backend only sends them to servers
    // that advertise it, so older plugins keep receiving the legacy payload.
    inline constexpr const char* ItemStatsCapability = "delivery.item.stats.v1";

    // One payload line (payload.items[i] or the legacy payload.item).
    struct Line
    {
        std::string Blueprint;
        int Quantity = 1;
        float Quality = 0.0f;
        bool IsBlueprint = false;
        // ArkShop "Armor"/"Durability"/"Damage": desired displayed stat value;
        // 0 = leave the rolled stat alone. Only applied to non-stackable items.
        int Armor = 0;
        int Durability = 0;
        int Damage = 0;

        bool HasStatOverrides() const { return Armor > 0 || Durability > 0 || Damage > 0; }
    };

    // Same acceptance rules the order branch has always applied, now checked up
    // front (before any item is given):
    //   payload.items (array) or payload.item (object), at least one entry;
    //   blueprint: non-empty string; quantity: integer >= 1 (default 1);
    //   quality: number (default 0); isBlueprint: boolean (default false).
    // New optional per-line fields (absent/null = 0 = no override):
    //   armor, durability, damage: integers 0..65535.
    // Unknown keys are ignored. Returns false with Error on the first bad entry.
    bool ParseLines(const nlohmann::json& Payload, std::vector<Line>& Out, std::string& Error);

    enum class GiveMode
    {
        // One AddNewItem per unit (quantity 1 each). One inventory slot per unit.
        PerUnit,
        // One IncrementItemTemplateQuantity call for the whole quantity.
        TemplateIncrement
    };

    // Blueprints never stack, so they are always given per unit; otherwise an
    // item whose max stack is <= 1 is per unit (ArkShop's `stacksInOne`).
    GiveMode ChooseGiveMode(int MaxStackSize, bool IsBlueprint);

    // Worst-case number of NEW inventory slots one line can occupy:
    //   PerUnit           -> Quantity
    //   TemplateIncrement -> ceil(Quantity / MaxStackSize)
    // Existing partial stacks of the same item may absorb part of a stackable
    // line, so this is an upper bound (never an under-estimate).
    std::int64_t SlotsForLine(int Quantity, int MaxStackSize, bool IsBlueprint);

    // Free slots the delivery may use. MaxItems <= 0 or IgnoreMaxItems means the
    // inventory has no item cap (returns INT64_MAX).
    std::int64_t FreeSlots(int CurrentItems, int MaxItems, bool IgnoreMaxItems);

    // All-or-nothing preflight: true when every line fits at once.
    bool HasRoomFor(std::int64_t SlotsNeeded, std::int64_t FreeSlotCount);

    // ArkShop::getStatValue: the raw ItemStatValues entry that makes an item
    // display `Desired` for a stat described by FItemStatInfo's
    // InitialValueConstant / RandomizerRangeMultiplier / StateModifierScale /
    // bDisplayAsPercent. Clamped to the uint16 range the engine stores (0..65535).
    // `AddOne` reproduces ArkShop's +1 for MaxDurability.
    float StatValueFor(
        float Desired,
        float InitialValueConstant,
        float RandomizerRangeMultiplier,
        float StateModifierScale,
        bool DisplayAsPercent,
        bool AddOne = false);
}
