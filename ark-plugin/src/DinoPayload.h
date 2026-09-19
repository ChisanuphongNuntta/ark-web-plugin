#pragma once

#include <cstddef>
#include <string>
#include <vector>

namespace HeartShop::DinoPayload
{
    std::string EncodeBase64(const unsigned char* Data, std::size_t Size);
    bool DecodeBase64(
        const std::string& Encoded,
        std::vector<unsigned char>& Output,
        std::size_t MaximumDecodedSize = 1024 * 1024);
}
