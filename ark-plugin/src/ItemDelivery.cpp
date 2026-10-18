#include "ItemDelivery.h"

#include <cmath>
#include <limits>

namespace HeartShop::ItemDelivery
{
namespace
{
    // Integer-valued JSON number that fits in an int (3 and 3.0 both accepted,
    // matching nlohmann's value<int>() the order branch used before).
    bool ReadInt(const nlohmann::json& Value, long long& Out)
    {
        if (Value.is_number_integer())
        {
            Out = Value.get<long long>();
            return true;
        }
        if (Value.is_number_unsigned())
        {
            const auto Unsigned = Value.get<unsigned long long>();
            if (Unsigned > static_cast<unsigned long long>(std::numeric_limits<long long>::max())) return false;
            Out = static_cast<long long>(Unsigned);
            return true;
        }
        if (Value.is_number_float())
        {
            const double Double = Value.get<double>();
            if (!std::isfinite(Double) || std::floor(Double) != Double ||
                std::fabs(Double) > 9.0e15)
            {
                return false;
            }
            Out = static_cast<long long>(Double);
            return true;
        }
        return false;
    }

    bool ReadOptionalStat(
        const nlohmann::json& Item,
        const char* Key,
        const std::string& Prefix,
        int& Out,
        std::string& Error)
    {
        Out = 0;
        const auto Field = Item.find(Key);
        if (Field == Item.end() || Field->is_null())
        {
            return true;
        }
        long long Value = 0;
        if (!ReadInt(*Field, Value) || Value < 0 || Value > 65535)
        {
            Error = Prefix + "." + Key + " must be an integer 0..65535";
            return false;
        }
        Out = static_cast<int>(Value);
        return true;
    }
}

    bool ParseLines(const nlohmann::json& Payload, std::vector<Line>& Out, std::string& Error)
    {
        Out.clear();
        Error.clear();

        if (!Payload.is_object())
        {
            Error = "payload is not an object";
            return false;
        }

        nlohmann::json Entries = nlohmann::json::array();
        if (const auto Items = Payload.find("items"); Items != Payload.end() && Items->is_array())
        {
            Entries = *Items;
        }
        else if (const auto Item = Payload.find("item"); Item != Payload.end() && Item->is_object())
        {
            Entries.push_back(*Item);
        }

        if (Entries.empty())
        {
            Error = "payload has no items";
            return false;
        }

        for (std::size_t Index = 0; Index < Entries.size(); ++Index)
        {
            const auto& Entry = Entries[Index];
            const std::string Prefix = "items[" + std::to_string(Index) + "]";
            if (!Entry.is_object())
            {
                Error = Prefix + " is not an object";
                return false;
            }

            Line Parsed;

            const auto Blueprint = Entry.find("blueprint");
            if (Blueprint == Entry.end() || !Blueprint->is_string() || Blueprint->get<std::string>().empty())
            {
                Error = Prefix + ".blueprint must be a non-empty string";
                return false;
            }
            Parsed.Blueprint = Blueprint->get<std::string>();

            if (const auto Quantity = Entry.find("quantity"); Quantity != Entry.end() && !Quantity->is_null())
            {
                long long Value = 0;
                if (!ReadInt(*Quantity, Value) || Value < 1 || Value > std::numeric_limits<int>::max())
                {
                    Error = Prefix + ".quantity must be an integer >= 1";
                    return false;
                }
                Parsed.Quantity = static_cast<int>(Value);
            }

            if (const auto Quality = Entry.find("quality"); Quality != Entry.end() && !Quality->is_null())
            {
                if (!Quality->is_number() || !std::isfinite(Quality->get<double>()))
                {
                    Error = Prefix + ".quality must be a number";
                    return false;
                }
                Parsed.Quality = Quality->get<float>();
            }

            if (const auto IsBlueprint = Entry.find("isBlueprint"); IsBlueprint != Entry.end() && !IsBlueprint->is_null())
            {
                if (!IsBlueprint->is_boolean())
                {
                    Error = Prefix + ".isBlueprint must be boolean";
                    return false;
                }
                Parsed.IsBlueprint = IsBlueprint->get<bool>();
            }

            if (!ReadOptionalStat(Entry, "armor", Prefix, Parsed.Armor, Error) ||
                !ReadOptionalStat(Entry, "durability", Prefix, Parsed.Durability, Error) ||
                !ReadOptionalStat(Entry, "damage", Prefix, Parsed.Damage, Error))
            {
                return false;
            }

            Out.push_back(std::move(Parsed));
        }
        return true;
    }

    GiveMode ChooseGiveMode(const int MaxStackSize, const bool IsBlueprint)
    {
        return (IsBlueprint || MaxStackSize <= 1) ? GiveMode::PerUnit : GiveMode::TemplateIncrement;
    }

    std::int64_t SlotsForLine(const int Quantity, const int MaxStackSize, const bool IsBlueprint)
    {
        if (Quantity <= 0)
        {
            return 0;
        }
        const std::int64_t Units = Quantity;
        if (ChooseGiveMode(MaxStackSize, IsBlueprint) == GiveMode::PerUnit)
        {
            return Units;
        }
        const std::int64_t Stack = MaxStackSize;
        return (Units + Stack - 1) / Stack;
    }

    std::int64_t FreeSlots(const int CurrentItems, const int MaxItems, const bool IgnoreMaxItems)
    {
        if (IgnoreMaxItems || MaxItems <= 0)
        {
            return std::numeric_limits<std::int64_t>::max();
        }
        const std::int64_t Free = static_cast<std::int64_t>(MaxItems) - static_cast<std::int64_t>(CurrentItems < 0 ? 0 : CurrentItems);
        return Free < 0 ? 0 : Free;
    }

    bool HasRoomFor(const std::int64_t SlotsNeeded, const std::int64_t FreeSlotCount)
    {
        return SlotsNeeded <= FreeSlotCount;
    }

    float StatValueFor(
        const float Desired,
        float InitialValueConstant,
        const float RandomizerRangeMultiplier,
        const float StateModifierScale,
        const bool DisplayAsPercent,
        const bool AddOne)
    {
        if (DisplayAsPercent)
        {
            InitialValueConstant += 100.0f;
        }
        const float Target = Desired < InitialValueConstant ? InitialValueConstant : Desired;
        const float Denominator = InitialValueConstant * RandomizerRangeMultiplier * StateModifierScale;
        if (!std::isfinite(Denominator) || Denominator == 0.0f)
        {
            return 0.0f;
        }
        float Value = (Target - InitialValueConstant) / Denominator;
        if (AddOne)
        {
            Value += 1.0f;
        }
        if (!std::isfinite(Value) || Value < 0.0f)
        {
            return 0.0f;
        }
        return Value >= 65536.0f ? 65535.0f : Value;
    }
}
