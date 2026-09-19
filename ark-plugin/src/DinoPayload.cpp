#include "DinoPayload.h"

#include <array>
#include <cctype>

namespace HeartShop::DinoPayload
{
namespace
{
    constexpr char Alphabet[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    int DecodeCharacter(const unsigned char Character)
    {
        if (Character >= 'A' && Character <= 'Z') return Character - 'A';
        if (Character >= 'a' && Character <= 'z') return Character - 'a' + 26;
        if (Character >= '0' && Character <= '9') return Character - '0' + 52;
        if (Character == '+') return 62;
        if (Character == '/') return 63;
        return -1;
    }
}

    std::string EncodeBase64(const unsigned char* Data, const std::size_t Size)
    {
        if (!Data || Size == 0) return {};

        std::string Result;
        Result.reserve(((Size + 2) / 3) * 4);
        for (std::size_t Index = 0; Index < Size; Index += 3)
        {
            const unsigned int First = Data[Index];
            const unsigned int Second = Index + 1 < Size ? Data[Index + 1] : 0;
            const unsigned int Third = Index + 2 < Size ? Data[Index + 2] : 0;
            const unsigned int Value = (First << 16) | (Second << 8) | Third;

            Result.push_back(Alphabet[(Value >> 18) & 0x3f]);
            Result.push_back(Alphabet[(Value >> 12) & 0x3f]);
            Result.push_back(Index + 1 < Size ? Alphabet[(Value >> 6) & 0x3f] : '=');
            Result.push_back(Index + 2 < Size ? Alphabet[Value & 0x3f] : '=');
        }
        return Result;
    }

    bool DecodeBase64(
        const std::string& Encoded,
        std::vector<unsigned char>& Output,
        const std::size_t MaximumDecodedSize)
    {
        Output.clear();
        if (Encoded.empty() || Encoded.size() % 4 != 0) return false;
        if ((Encoded.size() / 4) * 3 > MaximumDecodedSize + 2) return false;

        const std::size_t Padding =
            (Encoded.back() == '=' ? 1u : 0u) +
            (Encoded.size() > 1 && Encoded[Encoded.size() - 2] == '=' ? 1u : 0u);
        const std::size_t DecodedSize = Encoded.size() / 4 * 3 - Padding;
        if (DecodedSize == 0 || DecodedSize > MaximumDecodedSize) return false;
        Output.reserve(DecodedSize);

        for (std::size_t Index = 0; Index < Encoded.size(); Index += 4)
        {
            const bool IsLast = Index + 4 == Encoded.size();
            const unsigned char C0 = static_cast<unsigned char>(Encoded[Index]);
            const unsigned char C1 = static_cast<unsigned char>(Encoded[Index + 1]);
            const unsigned char C2 = static_cast<unsigned char>(Encoded[Index + 2]);
            const unsigned char C3 = static_cast<unsigned char>(Encoded[Index + 3]);
            const int V0 = DecodeCharacter(C0);
            const int V1 = DecodeCharacter(C1);
            const int V2 = C2 == '=' ? 0 : DecodeCharacter(C2);
            const int V3 = C3 == '=' ? 0 : DecodeCharacter(C3);

            if (V0 < 0 || V1 < 0 || V2 < 0 || V3 < 0) return false;
            if ((!IsLast && (C2 == '=' || C3 == '=')) || (C2 == '=' && C3 != '=')) return false;
            if (C2 == '=' && (V1 & 0x0f) != 0) return false;
            if (C3 == '=' && C2 != '=' && (V2 & 0x03) != 0) return false;

            const unsigned int Value =
                (static_cast<unsigned int>(V0) << 18) |
                (static_cast<unsigned int>(V1) << 12) |
                (static_cast<unsigned int>(V2) << 6) |
                static_cast<unsigned int>(V3);
            Output.push_back(static_cast<unsigned char>((Value >> 16) & 0xff));
            if (C2 != '=') Output.push_back(static_cast<unsigned char>((Value >> 8) & 0xff));
            if (C3 != '=') Output.push_back(static_cast<unsigned char>(Value & 0xff));
        }

        return Output.size() == DecodedSize;
    }
}
