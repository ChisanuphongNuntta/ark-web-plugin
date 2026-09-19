#include "../src/RequestSigning.h"

#include <iostream>
#include <stdexcept>
#include <string>

namespace
{
    void Expect(bool Condition, const std::string& Message)
    {
        if (!Condition)
        {
            throw std::runtime_error(Message);
        }
    }
}

int main()
{
    using namespace HeartShop::RequestSigning;

    Expect(
        CalculateSha256Hex("") ==
            "e3b0c44298fc1c149afbf4c8996fb924"
            "27ae41e4649b934ca495991b7852b855",
        "empty body SHA-256 must match backend canonical body hash");

    Expect(
        CalculateSha256Hex("{\"serverId\":1}") ==
            "3ce3c6d03202093f8a73829a2b2c4da2"
            "d306461d61deaefc54a6d9c0056a8c43",
        "JSON body SHA-256 must be deterministic and lowercase hex");

    Expect(
        CalculateHmacSha256Hex("The quick brown fox jumps over the lazy dog", "key") ==
            "f7bc83f430538424b13298e6aa6fb143"
            "ef4d59a14946175997479dbc2d1a3cd8",
        "HMAC-SHA256 test vector must match");

    const std::string Canonical = BuildCanonicalRequest(
        "GET",
        "/api/plugin/wallet/events?since=2026-06-20T00%3A00%3A00Z",
        "1781894400123",
        "00112233445566778899aabbccddeeff",
        "e3b0c44298fc1c149afbf4c8996fb924"
        "27ae41e4649b934ca495991b7852b855");

    Expect(
        Canonical ==
            "GET\n"
            "/api/plugin/wallet/events?since=2026-06-20T00%3A00%3A00Z\n"
            "1781894400123\n"
            "00112233445566778899aabbccddeeff\n"
            "e3b0c44298fc1c149afbf4c8996fb924"
            "27ae41e4649b934ca495991b7852b855",
        "canonical string must preserve exact path, query, timestamp, nonce, and content hash order");

    const std::string NonceA = GenerateNonceHex();
    const std::string NonceB = GenerateNonceHex();

    Expect(NonceA.size() == 32, "nonce must be 128-bit lowercase hex");
    Expect(NonceB.size() == 32, "second nonce must be 128-bit lowercase hex");
    Expect(IsLowerHex(NonceA), "nonce must contain lowercase hex only");
    Expect(IsLowerHex(NonceB), "second nonce must contain lowercase hex only");
    Expect(NonceA != NonceB, "CSPRNG nonces must not repeat in adjacent requests");
    Expect(!IsLowerHex("ABC123"), "uppercase hex is not accepted for canonical headers");

        Expect(IsSignedPluginEndpoint("/heartbeat"), "heartbeat must be signed");
        Expect(IsSignedPluginEndpoint("/catalog?search=metal"), "catalog must be signed");
        Expect(IsSignedPluginEndpoint("/purchase/quote"), "purchase quote must be signed");
        Expect(IsSignedPluginEndpoint("/purchase/confirm"), "purchase confirmation must be signed");
    Expect(IsSignedPluginEndpoint("/verify"), "license verification must use signed flexible plugin auth");
    Expect(IsSignedPluginEndpoint("/stats"), "stats must use signed flexible plugin auth");
    Expect(IsSignedPluginEndpoint("/player/76561198000000000"), "legacy player lookup must use signed flexible plugin auth");
    Expect(IsSignedPluginEndpoint("/deliveries/delivery-1/complete"), "delivery receipts must be signed");
    Expect(
        IsSignedPluginEndpoint("/wallet/events?since=2026-06-20T00%3A00%3A00Z"),
        "wallet event reads must be signed even with a query string");
    Expect(IsSignedPluginEndpoint("/protection/player/76561198000000000"), "protection routes must use signed flexible plugin auth");
    Expect(IsSignedPluginEndpoint("/chat/plugin/messages?since=cursor"), "chat plugin routes must use signed flexible plugin auth");
    Expect(IsSignedPluginEndpoint("/market/plugin/listings"), "market plugin routes must use signed flexible plugin auth");
    Expect(!IsSignedPluginEndpoint("/orders/pending"), "retired legacy order endpoint remains unsigned");

    std::cout << "RequestSigningTests passed\n";
    return 0;
}
