#include "RequestSigning.h"

#include <Windows.h>
#include <bcrypt.h>
#include <iomanip>
#include <sstream>
#include <vector>

#pragma comment(lib, "bcrypt.lib")

namespace HeartShop::RequestSigning
{
namespace
{
    std::string ToHex(const unsigned char* data, ULONG length)
    {
        std::ostringstream oss;
        for (ULONG i = 0; i < length; ++i)
        {
            oss << std::hex << std::setfill('0') << std::setw(2) << static_cast<int>(data[i]);
        }
        return oss.str();
    }

    std::string CalculateHashHex(const std::string& Input, const std::string* Key)
    {
        BCRYPT_ALG_HANDLE hAlg = NULL;
        BCRYPT_HASH_HANDLE hHash = NULL;
        DWORD cbHashObject = 0;
        DWORD cbHash = 0;
        DWORD cbData = 0;
        std::string Result;

        const ULONG Flags = Key ? BCRYPT_ALG_HANDLE_HMAC_FLAG : 0;
        if (!BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, Flags)))
        {
            return {};
        }

        if (BCRYPT_SUCCESS(BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PBYTE>(&cbHashObject), sizeof(DWORD), &cbData, 0)))
        {
            std::vector<unsigned char> HashObject(cbHashObject);
            if (BCRYPT_SUCCESS(BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, reinterpret_cast<PBYTE>(&cbHash), sizeof(DWORD), &cbData, 0)))
            {
                std::vector<unsigned char> Hash(cbHash);
                PUCHAR KeyData = Key ? reinterpret_cast<PUCHAR>(const_cast<char*>(Key->data())) : NULL;
                ULONG KeyLength = Key ? static_cast<ULONG>(Key->size()) : 0;
                if (BCRYPT_SUCCESS(BCryptCreateHash(hAlg, &hHash, HashObject.data(), cbHashObject, KeyData, KeyLength, 0)))
                {
                    if (BCRYPT_SUCCESS(BCryptHashData(hHash, reinterpret_cast<PBYTE>(const_cast<char*>(Input.data())), static_cast<ULONG>(Input.size()), 0)) &&
                        BCRYPT_SUCCESS(BCryptFinishHash(hHash, Hash.data(), cbHash, 0)))
                    {
                        Result = ToHex(Hash.data(), cbHash);
                    }
                    BCryptDestroyHash(hHash);
                }
            }
        }

        BCryptCloseAlgorithmProvider(hAlg, 0);
        return Result;
    }
}

    std::string CalculateSha256Hex(const std::string& Input)
    {
        return CalculateHashHex(Input, nullptr);
    }

    std::string CalculateHmacSha256Hex(const std::string& Input, const std::string& Key)
    {
        return CalculateHashHex(Input, &Key);
    }

    std::string GenerateNonceHex()
    {
        unsigned char Bytes[16]{};
        if (!BCRYPT_SUCCESS(BCryptGenRandom(nullptr, Bytes, sizeof(Bytes), BCRYPT_USE_SYSTEM_PREFERRED_RNG)))
        {
            return {};
        }
        return ToHex(Bytes, sizeof(Bytes));
    }

    std::string BuildCanonicalRequest(
        const std::string& Method,
        const std::string& PathAndQuery,
        const std::string& Timestamp,
        const std::string& Nonce,
        const std::string& ContentSha256)
    {
        return Method + "\n" + PathAndQuery + "\n" + Timestamp + "\n" + Nonce + "\n" + ContentSha256;
    }

    bool IsSignedPluginEndpoint(const std::string& Endpoint)
    {
        // Backend `authenticatePluginFlexible` accepts HMAC headers for the legacy plugin
        // routes during the migration overlap. Signing them lets a server-scoped
        // ServerCredential work without falling back to bearer X-API-Key.
        const bool IsPlayerRoute = Endpoint.rfind("/player/", 0) == 0;
        const bool IsProtectionRoute = Endpoint.rfind("/protection/", 0) == 0;
        const bool IsChatPluginRoute = Endpoint.rfind("/chat/plugin/", 0) == 0;
        const bool IsMarketPluginRoute = Endpoint.rfind("/market/plugin/", 0) == 0;
        const bool IsWalletEvents = Endpoint.rfind("/wallet/events", 0) == 0;

        return Endpoint == "/heartbeat" ||
               Endpoint.rfind("/catalog", 0) == 0 ||
               Endpoint == "/purchase/quote" ||
               Endpoint == "/purchase/confirm" ||
               Endpoint == "/verify" ||
               Endpoint == "/stats" ||
               Endpoint == "/deliveries/claim" ||
               Endpoint.rfind("/deliveries/", 0) == 0 ||
               Endpoint == "/market/prepare-lock" ||
               Endpoint == "/market/confirm-lock" ||
               IsPlayerRoute ||
               IsProtectionRoute ||
               IsChatPluginRoute ||
               IsMarketPluginRoute ||
               IsWalletEvents;
    }

    bool IsLowerHex(const std::string& Value)
    {
        if (Value.empty())
        {
            return false;
        }

        for (const char Character : Value)
        {
            const bool IsDigit = Character >= '0' && Character <= '9';
            const bool IsLower = Character >= 'a' && Character <= 'f';
            if (!IsDigit && !IsLower)
            {
                return false;
            }
        }
        return true;
    }
}
