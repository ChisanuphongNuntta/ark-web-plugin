#pragma once

#include <string>

namespace HeartShop::RequestSigning
{
    std::string CalculateSha256Hex(const std::string& Input);
    std::string CalculateHmacSha256Hex(const std::string& Input, const std::string& Key);
    std::string GenerateNonceHex();
    std::string BuildCanonicalRequest(
        const std::string& Method,
        const std::string& PathAndQuery,
        const std::string& Timestamp,
        const std::string& Nonce,
        const std::string& ContentSha256);
    bool IsSignedPluginEndpoint(const std::string& Endpoint);
    bool IsLowerHex(const std::string& Value);
}
