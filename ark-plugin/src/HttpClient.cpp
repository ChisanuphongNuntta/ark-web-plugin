#include "HttpClient.h"
#include "GameThreadDispatcher.h"
#include <Logger/Logger.h>
#include <thread>
#include <Windows.h>
#include <winhttp.h>
#include <iomanip>
#include <sstream>
#include <bcrypt.h>
#include <random>
#include <chrono>
#include <fstream>
#include <vector>
#include <API/ARK/Ark.h>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "bcrypt.lib")

namespace HeartShop
{
    extern const char* Version;
namespace
{
    std::string ToHex(const unsigned char* data, ULONG length)
    {
        std::ostringstream oss;
        for (ULONG i = 0; i < length; ++i)
        {
            oss << std::hex << std::setfill('0') << std::setw(2) << (int)data[i];
        }
        return oss.str();
    }

    std::string CalculateSha256(const std::string& Input)
    {
        BCRYPT_ALG_HANDLE hAlg = NULL;
        BCRYPT_HASH_HANDLE hHash = NULL;
        DWORD cbHashObject = 0;
        DWORD cbHash = 0;
        DWORD cbData = 0;
        std::string result = "";

        if (!BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0)))
        {
            Log::GetLog()->error("BCryptOpenAlgorithmProvider SHA256 failed");
            return "";
        }

        if (BCRYPT_SUCCESS(BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PBYTE)&cbHashObject, sizeof(DWORD), &cbData, 0)))
        {
            std::vector<unsigned char> hashObject(cbHashObject);
            if (BCRYPT_SUCCESS(BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PBYTE)&cbHash, sizeof(DWORD), &cbData, 0)))
            {
                std::vector<unsigned char> hash(cbHash);
                if (BCRYPT_SUCCESS(BCryptCreateHash(hAlg, &hHash, hashObject.data(), cbHashObject, NULL, 0, 0)))
                {
                    if (BCRYPT_SUCCESS(BCryptHashData(hHash, (PBYTE)Input.c_str(), (ULONG)Input.length(), 0)))
                    {
                        if (BCRYPT_SUCCESS(BCryptFinishHash(hHash, hash.data(), cbHash, 0)))
                        {
                            result = ToHex(hash.data(), cbHash);
                        }
                    }
                    BCryptDestroyHash(hHash);
                }
            }
        }

        BCryptCloseAlgorithmProvider(hAlg, 0);
        return result;
    }

    std::string CalculateHmacSha256(const std::string& Input, const std::string& Key)
    {
        BCRYPT_ALG_HANDLE hAlg = NULL;
        BCRYPT_HASH_HANDLE hHash = NULL;
        DWORD cbHashObject = 0;
        DWORD cbHash = 0;
        DWORD cbData = 0;
        std::string result = "";

        if (!BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, BCRYPT_ALG_HANDLE_HMAC_FLAG)))
        {
            Log::GetLog()->error("BCryptOpenAlgorithmProvider HMAC-SHA256 failed");
            return "";
        }

        if (BCRYPT_SUCCESS(BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PBYTE)&cbHashObject, sizeof(DWORD), &cbData, 0)))
        {
            std::vector<unsigned char> hashObject(cbHashObject);
            if (BCRYPT_SUCCESS(BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PBYTE)&cbHash, sizeof(DWORD), &cbData, 0)))
            {
                std::vector<unsigned char> hash(cbHash);
                if (BCRYPT_SUCCESS(BCryptCreateHash(hAlg, &hHash, hashObject.data(), cbHashObject, (PUCHAR)Key.c_str(), (ULONG)Key.length(), 0)))
                {
                    if (BCRYPT_SUCCESS(BCryptHashData(hHash, (PBYTE)Input.c_str(), (ULONG)Input.length(), 0)))
                    {
                        if (BCRYPT_SUCCESS(BCryptFinishHash(hHash, hash.data(), cbHash, 0)))
                        {
                            result = ToHex(hash.data(), cbHash);
                        }
                    }
                    BCryptDestroyHash(hHash);
                }
            }
        }

        BCryptCloseAlgorithmProvider(hAlg, 0);
        return result;
    }

    std::string GenerateNonce()
    {
        static const char alphabet[] = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        std::string nonce;
        nonce.reserve(16);
        std::random_device rd;
        std::mt19937 generator(rd());
        std::uniform_int_distribution<int> distribution(0, sizeof(alphabet) - 2);
        for (int i = 0; i < 16; ++i)
        {
            nonce += alphabet[distribution(generator)];
        }
        return nonce;
    }

    std::string GetCurrentDllSha256()
    {
        wchar_t path[MAX_PATH];
        HMODULE hModule = NULL;
        GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
                           (LPCWSTR)&GetCurrentDllSha256, &hModule);
        if (GetModuleFileNameW(hModule, path, MAX_PATH) > 0)
        {
            std::ifstream file(path, std::ios::binary);
            if (file.is_open())
            {
                std::string content((std::istreambuf_iterator<char>(file)),
                                    std::istreambuf_iterator<char>());
                return CalculateSha256(content);
            }
        }
        return "";
    }

    std::string GetCurrentISO8601Time()
    {
        auto now = std::chrono::system_clock::now();
        auto in_time_t = std::chrono::system_clock::to_time_t(now);
        struct tm buf;
        gmtime_s(&buf, &in_time_t);
        std::stringstream ss;
        ss << std::put_time(&buf, "%Y-%m-%dT%H:%M:%SZ");
        return ss.str();
    }

    bool IsSignedEndpoint(const std::string& Endpoint)
    {
        return Endpoint == "/heartbeat" ||
               Endpoint == "/deliveries/claim" ||
               Endpoint.rfind("/deliveries/", 0) == 0 ||
               Endpoint == "/market/prepare-lock" ||
               Endpoint == "/market/confirm-lock";
    }
}

    HttpClient::HttpClient(
        const std::string& ApiUrl,
        const std::string& ApiKey,
        int ServerId,
        bool AllowInvalidCertificates)
        : m_BaseUrl(ApiUrl)
        , m_ApiKey(ApiKey)
        , m_ServerId(ServerId)
        , m_AllowInvalidCertificates(AllowInvalidCertificates)
        , m_RequestState(std::make_shared<RequestState>())
    {
    }

    HttpClient::~HttpClient()
    {
        const auto State = m_RequestState;
        std::unique_lock<std::mutex> Lock(State->Mutex);
        State->ShuttingDown.store(true);
        State->Finished.wait(Lock, [State]() {
            return State->ActiveRequests == 0;
        });
    }

    void HttpClient::VerifyLicense(HttpCallback Callback)
    {
        DoGet("/verify", Callback);
    }

    void HttpClient::GetPendingOrders(HttpCallback Callback)
    {
        DoGet("/orders/pending", Callback);
    }

    void HttpClient::MarkDelivered(const std::string& OrderId, HttpCallback Callback)
    {
        DoPost("/orders/" + OrderId + "/deliver", {}, Callback);
    }

    void HttpClient::MarkFailed(const std::string& OrderId, const std::string& Error, HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["error"] = Error;
        DoPost("/orders/" + OrderId + "/fail", Body, Callback);
    }

    void HttpClient::SendHeartbeat(int PlayerCount, HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["playerCount"] = PlayerCount;
        Body["pluginVersion"] = Version;
        Body["buildSha256"] = GetCurrentDllSha256();
        Body["arkApiVersion"] = "1.0";
        Body["capabilities"] = nlohmann::json::array({ "hmac_signatures", "atomic_claims", "p2p_locks" });
        Body["queueDepth"] = 0;
        Body["circuitBreakerState"] = "closed";
        DoPost("/heartbeat", Body, Callback);
    }

    void HttpClient::UpdatePlayerStats(const nlohmann::json& PlayersData, HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["players"] = PlayersData;
        DoPost("/stats", Body, Callback);
    }

    void HttpClient::GetPlayerInfo(const std::string& SteamId, HttpCallback Callback)
    {
        DoGet("/player/" + SteamId, Callback);
    }

    void HttpClient::ClaimDeliveries(int ServerId, HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["serverId"] = ServerId;
        DoPost("/deliveries/claim", Body, Callback);
    }

    void HttpClient::CompleteDelivery(
        const std::string& DeliveryKey,
        const std::string& LeaseToken,
        const std::string& SteamId,
        const std::string& PayloadHash,
        const std::string& ReceiptId,
        HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["leaseToken"] = LeaseToken;
        Body["playerSteamId"] = SteamId;
        Body["payloadHash"] = PayloadHash;
        Body["localJournalReceiptId"] = ReceiptId;
        Body["outcome"] = "success";
        Body["gameTimestamp"] = GetCurrentISO8601Time();
        DoPost("/deliveries/" + DeliveryKey + "/complete", Body, Callback);
    }

    void HttpClient::FailDelivery(
        const std::string& DeliveryKey,
        const std::string& LeaseToken,
        const std::string& Error,
        HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["leaseToken"] = LeaseToken;
        Body["error"] = Error;
        DoPost("/deliveries/" + DeliveryKey + "/fail", Body, Callback);
    }

    void HttpClient::ReleaseDelivery(
        const std::string& DeliveryKey,
        const std::string& LeaseToken,
        HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["leaseToken"] = LeaseToken;
        DoPost("/deliveries/" + DeliveryKey + "/release", Body, Callback);
    }

    // Dino Market API
    void HttpClient::CreateDinoListing(const nlohmann::json& DinoData, HttpCallback Callback)
    {
        // Note: This uses /market/plugin/listings endpoint
        DoRequest("POST", "/market/plugin/listings", DinoData, Callback);
    }

    void HttpClient::GetPendingDinoDeliveries(HttpCallback Callback)
    {
        DoGet("/market/plugin/deliveries", Callback);
    }

    void HttpClient::MarkDinoDelivered(const std::string& ListingId, HttpCallback Callback)
    {
        DoPost("/market/plugin/deliveries/" + ListingId + "/delivered", {}, Callback);
    }

    void HttpClient::GetCancelledDinoReturns(HttpCallback Callback)
    {
        DoGet("/market/plugin/returns", Callback);
    }

    void HttpClient::MarkDinoReturned(const std::string& ListingId, HttpCallback Callback)
    {
        DoPost("/market/plugin/returns/" + ListingId + "/returned", {}, Callback);
    }

    // Cross-Chat API
    void HttpClient::GetChatMessages(const std::string& Since, HttpCallback Callback)
    {
        std::string Endpoint = "/chat/plugin/messages";
        if (!Since.empty())
        {
            Endpoint += "?since=" + Since;
        }
        DoGet(Endpoint, Callback);
    }

    void HttpClient::SendChatMessage(const std::string& SteamId, const std::string& PlayerName, const std::string& Content, const std::vector<std::string>& PlayerGroups, HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["steamId"] = SteamId;
        Body["playerName"] = PlayerName;
        Body["content"] = Content;
        Body["playerGroups"] = PlayerGroups;
        DoPost("/chat/plugin/messages", Body, Callback);
    }

    void HttpClient::Request(const std::string& Method, const std::string& Endpoint, const std::string& Body, HttpCallback Callback)
    {
        nlohmann::json JsonBody;
        if (!Body.empty())
        {
            try
            {
                JsonBody = nlohmann::json::parse(Body);
            }
            catch (...)
            {
                // Empty body if parse fails
            }
        }
        DoRequest(Method, Endpoint, JsonBody, Callback);
    }

    void HttpClient::DoGet(const std::string& Endpoint, HttpCallback Callback)
    {
        DoRequest("GET", Endpoint, {}, Callback);
    }

    void HttpClient::DoPost(const std::string& Endpoint, const nlohmann::json& Body, HttpCallback Callback)
    {
        DoRequest("POST", Endpoint, Body, Callback);
    }

    void HttpClient::DoRequest(const std::string& Method, const std::string& Endpoint, const nlohmann::json& Body, HttpCallback Callback)
    {
        const std::string BaseUrl = m_BaseUrl;
        const std::string ApiKey = m_ApiKey;
        const int ServerId = m_ServerId;
        const bool AllowInvalidCertificates = m_AllowInvalidCertificates;
        const auto State = m_RequestState;

        {
            std::lock_guard<std::mutex> Lock(State->Mutex);
            if (State->ShuttingDown.load())
            {
                return;
            }
            ++State->ActiveRequests;
        }

        // Run HTTP request in a separate thread to avoid blocking game.
        // Account for thread creation failure so plugin shutdown cannot wait
        // forever on an ActiveRequests count that has no worker.
        try
        {
            std::thread([BaseUrl, ApiKey, ServerId, AllowInvalidCertificates, State, Method, Endpoint, Body, Callback]() {
            struct RequestGuard
            {
                std::shared_ptr<RequestState> State;

                ~RequestGuard()
                {
                    std::lock_guard<std::mutex> Lock(State->Mutex);
                    --State->ActiveRequests;
                    State->Finished.notify_all();
                }
            } Guard{State};

            auto Complete = [State, Callback](bool Success, nlohmann::json Response) {
                if (State->ShuttingDown.load())
                {
                    return;
                }

                GameThreadDispatcher::Enqueue(
                    [State, Callback, Success, Response = std::move(Response)]() {
                        if (!State->ShuttingDown.load())
                        {
                            Callback(Success, Response);
                        }
                    });
            };

            try
            {
                // Parse URL
                std::string FullUrl = BaseUrl + Endpoint;

                // Initialize WinHTTP
                HINTERNET hSession = WinHttpOpen(
                    L"HeartShop/1.0",
                    WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                    WINHTTP_NO_PROXY_NAME,
                    WINHTTP_NO_PROXY_BYPASS,
                    0
                );

                if (!hSession)
                {
                    Log::GetLog()->error("WinHttpOpen failed");
                    Complete(false, {});
                    return;
                }

                WinHttpSetTimeouts(hSession, 5000, 5000, 10000, 10000);

                // Enable TLS 1.2 and 1.3
                DWORD protocols = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2 | WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
                WinHttpSetOption(hSession, WINHTTP_OPTION_SECURE_PROTOCOLS, &protocols, sizeof(protocols));

                // Parse URL components
                URL_COMPONENTS urlComp = { 0 };
                urlComp.dwStructSize = sizeof(urlComp);

                wchar_t hostName[256] = { 0 };
                wchar_t urlPath[1024] = { 0 };

                urlComp.lpszHostName = hostName;
                urlComp.dwHostNameLength = sizeof(hostName) / sizeof(wchar_t);
                urlComp.lpszUrlPath = urlPath;
                urlComp.dwUrlPathLength = sizeof(urlPath) / sizeof(wchar_t);

                std::wstring WideUrl(FullUrl.begin(), FullUrl.end());
                if (!WinHttpCrackUrl(WideUrl.c_str(), 0, 0, &urlComp))
                {
                    Log::GetLog()->error("WinHttpCrackUrl failed: {}", GetLastError());
                    WinHttpCloseHandle(hSession);
                    Complete(false, {});
                    return;
                }

                // Connect
                HINTERNET hConnect = WinHttpConnect(
                    hSession,
                    hostName,
                    urlComp.nPort,
                    0
                );

                if (!hConnect)
                {
                    Log::GetLog()->error("WinHttpConnect failed: {}", GetLastError());
                    WinHttpCloseHandle(hSession);
                    Complete(false, {});
                    return;
                }

                // Create request
                std::wstring WideMethod(Method.begin(), Method.end());
                HINTERNET hRequest = WinHttpOpenRequest(
                    hConnect,
                    WideMethod.c_str(),
                    urlPath,
                    NULL,
                    WINHTTP_NO_REFERER,
                    WINHTTP_DEFAULT_ACCEPT_TYPES,
                    urlComp.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0
                );

                if (!hRequest)
                {
                    Log::GetLog()->error("WinHttpOpenRequest failed: {}", GetLastError());
                    WinHttpCloseHandle(hConnect);
                    WinHttpCloseHandle(hSession);
                    Complete(false, {});
                    return;
                }

                // Production uses the Windows trust store and normal hostname,
                // usage, and expiry validation. A development-only exception is
                // available for a self-signed localhost certificate.
                if (AllowInvalidCertificates)
                {
                    DWORD dwFlags = SECURITY_FLAG_IGNORE_UNKNOWN_CA |
                                    SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE |
                                    SECURITY_FLAG_IGNORE_CERT_CN_INVALID |
                                    SECURITY_FLAG_IGNORE_CERT_DATE_INVALID;

                    WinHttpSetOption(
                        hRequest,
                        WINHTTP_OPTION_SECURITY_FLAGS,
                        &dwFlags,
                        sizeof(dwFlags)
                    );
                }

                std::string BodyStr = Body.empty() ? "" : Body.dump();

                // Add headers
                if (IsSignedEndpoint(Endpoint))
                {
                    std::string PathAndQuery = ArkApi::Tools::Utf8Encode(urlPath);
                    std::string Nonce = GenerateNonce();
                    long long Timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count();
                    std::string TimestampStr = std::to_string(Timestamp);
                    std::string ContentSha = CalculateSha256(BodyStr);
                    std::string CanonicalString = Method + "\n" + PathAndQuery + "\n" + TimestampStr + "\n" + Nonce + "\n" + ContentSha;
                    std::string Signature = CalculateHmacSha256(CanonicalString, ApiKey);

                    std::wstring KeyIdHdr = L"X-Plugin-Key-Id: " + std::wstring(ApiKey.begin(), ApiKey.end());
                    WinHttpAddRequestHeaders(hRequest, KeyIdHdr.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);

                    std::string PluginVersionStr = Version;
                    std::wstring VersionHdr = L"X-Plugin-Version: " + std::wstring(PluginVersionStr.begin(), PluginVersionStr.end());
                    WinHttpAddRequestHeaders(hRequest, VersionHdr.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);

                    std::wstring TimestampHdr = L"X-Request-Timestamp: " + std::wstring(TimestampStr.begin(), TimestampStr.end());
                    WinHttpAddRequestHeaders(hRequest, TimestampHdr.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);

                    std::wstring NonceHdr = L"X-Request-Nonce: " + std::wstring(Nonce.begin(), Nonce.end());
                    WinHttpAddRequestHeaders(hRequest, NonceHdr.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);

                    std::wstring ContentShaHdr = L"X-Content-SHA256: " + std::wstring(ContentSha.begin(), ContentSha.end());
                    WinHttpAddRequestHeaders(hRequest, ContentShaHdr.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);

                    std::wstring SignatureHdr = L"X-Signature: " + std::wstring(Signature.begin(), Signature.end());
                    WinHttpAddRequestHeaders(hRequest, SignatureHdr.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);
                }
                else
                {
                    std::wstring ApiKeyHeader = L"X-API-Key: " + std::wstring(ApiKey.begin(), ApiKey.end());
                    WinHttpAddRequestHeaders(hRequest, ApiKeyHeader.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);
                }

                std::wstring ServerIdHeader = L"X-Server-Id: " + std::to_wstring(ServerId);
                WinHttpAddRequestHeaders(hRequest, ServerIdHeader.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);
                WinHttpAddRequestHeaders(hRequest, L"Content-Type: application/json", -1, WINHTTP_ADDREQ_FLAG_ADD);

                // Send request
                BOOL Result = WinHttpSendRequest(
                    hRequest,
                    WINHTTP_NO_ADDITIONAL_HEADERS,
                    0,
                    (LPVOID)BodyStr.c_str(),
                    BodyStr.length(),
                    BodyStr.length(),
                    0
                );

                if (!Result)
                {
                    Log::GetLog()->error("WinHttpSendRequest failed: {}", GetLastError());
                    WinHttpCloseHandle(hRequest);
                    WinHttpCloseHandle(hConnect);
                    WinHttpCloseHandle(hSession);
                    Complete(false, {});
                    return;
                }

                if (!WinHttpReceiveResponse(hRequest, NULL))
                {
                    Log::GetLog()->error("WinHttpReceiveResponse failed: {}", GetLastError());
                    WinHttpCloseHandle(hRequest);
                    WinHttpCloseHandle(hConnect);
                    WinHttpCloseHandle(hSession);
                    Complete(false, {});
                    return;
                }

                // Check HTTP status code
                DWORD StatusCode = 0;
                DWORD StatusCodeSize = sizeof(StatusCode);
                WinHttpQueryHeaders(hRequest,
                    WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                    WINHTTP_HEADER_NAME_BY_INDEX,
                    &StatusCode, &StatusCodeSize, WINHTTP_NO_HEADER_INDEX);

                if (StatusCode < 200 || StatusCode >= 300)
                {
                    Log::GetLog()->warn("HTTP request returned status {}", StatusCode);
                    WinHttpCloseHandle(hRequest);
                    WinHttpCloseHandle(hConnect);
                    WinHttpCloseHandle(hSession);
                    Complete(false, {});
                    return;
                }

                // Read response
                std::string ResponseStr;
                DWORD BytesAvailable = 0;
                DWORD BytesRead = 0;

                do
                {
                    BytesAvailable = 0;
                    if (!WinHttpQueryDataAvailable(hRequest, &BytesAvailable))
                        break;

                    if (BytesAvailable > 0)
                    {
                        char* Buffer = new char[BytesAvailable + 1];
                        ZeroMemory(Buffer, BytesAvailable + 1);

                        if (WinHttpReadData(hRequest, Buffer, BytesAvailable, &BytesRead))
                        {
                            ResponseStr.append(Buffer, BytesRead);
                        }

                        delete[] Buffer;
                    }
                } while (BytesAvailable > 0);

                // Cleanup
                WinHttpCloseHandle(hRequest);
                WinHttpCloseHandle(hConnect);
                WinHttpCloseHandle(hSession);

                // Parse response
                try
                {
                    nlohmann::json ResponseJson = nlohmann::json::parse(ResponseStr);
                    Complete(true, std::move(ResponseJson));
                }
                catch (...)
                {
                    Log::GetLog()->error("Failed to parse JSON response");
                    Complete(false, {});
                }
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->error("HTTP request failed: {}", e.what());
                Complete(false, {});
            }
            }).detach();
        }
        catch (const std::exception& e)
        {
            {
                std::lock_guard<std::mutex> Lock(State->Mutex);
                --State->ActiveRequests;
                State->Finished.notify_all();
            }
            Log::GetLog()->error("Failed to start HTTP request worker: {}", e.what());
            if (!State->ShuttingDown.load())
            {
                GameThreadDispatcher::Enqueue(
                    [State, Callback]() {
                        if (!State->ShuttingDown.load())
                        {
                            Callback(false, {});
                        }
                    });
            }
        }
    }
}
