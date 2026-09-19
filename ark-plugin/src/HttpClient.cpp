#include "HttpClient.h"
#include "GameThreadDispatcher.h"
#include "RequestSigning.h"
#include <Logger/Logger.h>
#include <thread>
#include <Windows.h>
#include <winhttp.h>
#include <iomanip>
#include <sstream>
#include <random>
#include <chrono>
#include <fstream>
#include <vector>
#include <API/ARK/Ark.h>

#pragma comment(lib, "winhttp.lib")

namespace HeartShop
{
    extern const char* Version;
namespace
{
    std::string UrlEncode(const std::string& Value)
    {
        std::ostringstream Encoded;
        Encoded << std::uppercase << std::hex;
        for (const unsigned char Character : Value)
        {
            if ((Character >= 'a' && Character <= 'z') ||
                (Character >= 'A' && Character <= 'Z') ||
                (Character >= '0' && Character <= '9') ||
                Character == '-' || Character == '_' || Character == '.' || Character == '~')
            {
                Encoded << Character;
            }
            else
            {
                Encoded << '%' << std::setw(2) << std::setfill('0') << static_cast<int>(Character);
            }
        }
        return Encoded.str();
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
                return RequestSigning::CalculateSha256Hex(content);
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

}

    HttpClient::HttpClient(
        const std::string& ApiUrl,
        const std::string& ApiKey,
        const std::string& KeyId,
        int ServerId,
        bool AllowInvalidCertificates)
        : m_BaseUrl(ApiUrl)
        , m_ApiKey(ApiKey)
        , m_KeyId(KeyId)
        , m_ServerId(ServerId)
        , m_AllowInvalidCertificates(AllowInvalidCertificates)
        , m_RequestState(std::make_shared<RequestState>())
        , m_RequestPolicy(std::make_shared<RequestPolicy>())
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
        const auto CircuitState = m_RequestPolicy->State(std::chrono::steady_clock::now());
        const char* CircuitStateName = "closed";
        if (CircuitState == RequestPolicy::CircuitState::Open)
        {
            CircuitStateName = "open";
        }
        else if (CircuitState == RequestPolicy::CircuitState::HalfOpen)
        {
            CircuitStateName = "half-open";
        }

        nlohmann::json Body;
        Body["playerCount"] = PlayerCount;
        Body["pluginVersion"] = Version;
        Body["buildSha256"] = GetCurrentDllSha256();
        Body["arkApiVersion"] = std::to_string(ArkApi::Tools::GetApiVersion());
        Body["protocolVersion"] = 1;
        Body["capabilities"] = nlohmann::json::array({
            "hmac_signatures",
            "atomic_claims",
            "delivery_receipts",
            "local_idempotency_journal",
            "read_retry",
            "circuit_breaker",
            "delivery.item.v1",
            "delivery.item.bundle.v1",
            "delivery.dino.catalog.v1",
            "game-shop.quote-confirm.v1",
            "marketplace.asset-lock.v1",
            "marketplace.dino-native.v2",
            "delivery.dino.v2",
            "protocol.v1"
        });
        // Requests are admitted or rejected immediately; there is deliberately
        // no in-memory mutation queue that could be lost on plugin shutdown.
        Body["queueDepth"] = 0;
        Body["circuitBreakerState"] = CircuitStateName;
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

    // Companion read-only projections (CR-PLUGIN-007, now LIVE in the M3 backend contract).
    // Dedicated server-scoped, signed plugin routes:
    //   GET /plugin/player/{steamId}/wallet            -> WalletBalance (decimal strings)
    //   GET /plugin/player/{steamId}/pending-deliveries -> { pending: <int> }
    // The configured ApiUrl already ends in /api/plugin, so the path below resolves to the
    // dedicated companion endpoint (NOT the legacy /plugin/player/{steamId} lookup). The
    // plugin only displays these values verbatim and never computes or stores balances locally.
    void HttpClient::GetWalletBalance(const std::string& SteamId, HttpCallback Callback)
    {
        DoGet("/player/" + SteamId + "/wallet", Callback);
    }

    void HttpClient::GetPendingDeliveries(const std::string& SteamId, HttpCallback Callback)
    {
        DoGet("/player/" + SteamId + "/pending-deliveries", Callback);
    }

    void HttpClient::GetCatalog(const std::string& SteamId, const std::string& Search, HttpCallback Callback)
    {
        std::string Endpoint = "/catalog?steamId=" + UrlEncode(SteamId);
        if (!Search.empty()) Endpoint += "&search=" + UrlEncode(Search);
        DoGet(Endpoint, Callback);
    }

    void HttpClient::CreatePurchaseQuote(
        const std::string& SteamId,
        int ProductId,
        int Quantity,
        HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["steamId"] = SteamId;
        Body["productId"] = ProductId;
        Body["quantity"] = Quantity;
        DoPost("/purchase/quote", Body, Callback);
    }

    void HttpClient::ConfirmPurchaseQuote(
        const std::string& SteamId,
        const std::string& QuoteId,
        HttpCallback Callback)
    {
        nlohmann::json Body;
        Body["steamId"] = SteamId;
        Body["quoteId"] = QuoteId;
        DoPost("/purchase/confirm", Body, Callback);
    }

    void HttpClient::GetWalletEvents(const std::string& Since, HttpCallback Callback)
    {
        std::string Endpoint = "/wallet/events";
        if (!Since.empty())
        {
            // Note: query values for this projection are simple ISO timestamps / cursors.
            Endpoint += "?since=" + Since;
        }
        DoGet(Endpoint, Callback);
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
    void HttpClient::PrepareDinoLock(const nlohmann::json& DinoIdentity, HttpCallback Callback)
    {
        DoPost("/market/prepare-lock", DinoIdentity, Callback);
    }

    void HttpClient::ConfirmDinoLock(const nlohmann::json& ListingData, HttpCallback Callback)
    {
        DoPost("/market/confirm-lock", ListingData, Callback);
    }

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
        const std::string ApiKey = m_ApiKey;   // HMAC secret; used only to sign, never sent
        const std::string KeyId = m_KeyId;      // sent in X-Plugin-Key-Id
        const int ServerId = m_ServerId;
        const bool AllowInvalidCertificates = m_AllowInvalidCertificates;
        const auto State = m_RequestState;
        const auto Policy = m_RequestPolicy;

        const auto Admission = Policy->TryAcquire(std::chrono::steady_clock::now());
        if (Admission != RequestPolicy::Admission::Accepted)
        {
            Log::GetLog()->warn("HTTP request rejected: {}",
                Admission == RequestPolicy::Admission::CircuitOpen ? "circuit open" : "concurrency limit");
            GameThreadDispatcher::Enqueue([State, Callback]() {
                if (!State->ShuttingDown.load()) Callback(false, {});
            });
            return;
        }

        {
            std::lock_guard<std::mutex> Lock(State->Mutex);
            if (State->ShuttingDown.load())
            {
                Policy->Release();
                return;
            }
            ++State->ActiveRequests;
        }

        // Run HTTP request in a separate thread to avoid blocking game.
        // Account for thread creation failure so plugin shutdown cannot wait
        // forever on an ActiveRequests count that has no worker.
        try
        {
            std::thread([BaseUrl, ApiKey, KeyId, ServerId, AllowInvalidCertificates, State, Policy, Method, Endpoint, Body, Callback]() {
            struct RequestGuard
            {
                std::shared_ptr<RequestState> State;
                std::shared_ptr<RequestPolicy> Policy;

                ~RequestGuard()
                {
                    Policy->Release();
                    std::lock_guard<std::mutex> Lock(State->Mutex);
                    --State->ActiveRequests;
                    State->Finished.notify_all();
                }
            } Guard{State, Policy};

            auto Finalize = [State, Policy, Callback](bool Success, nlohmann::json Response) {
                const int Status = Response.is_object() ? Response.value("_httpStatus", 0) : 0;
                const bool Transient = !Success && (Status == 0 || RequestPolicy::IsTransientHttpStatus(Status));
                Policy->RecordResult(Success, Transient, std::chrono::steady_clock::now());
                if (Response.is_object()) Response.erase("_httpStatus");
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

            // All attempts stay in this one bounded worker slot. Only read-only methods may
            // retry; mutating requests complete after exactly one network attempt until the
            // backend supplies an idempotency contract for them.
            auto PerformAttempt = std::make_shared<std::function<void(int)>>();
            *PerformAttempt = [BaseUrl, ApiKey, KeyId, ServerId, AllowInvalidCertificates,
                               State, Policy, Method, Endpoint, Body, Finalize, PerformAttempt](int Attempt) {
            auto Complete = [State, Policy, Method, Attempt, Finalize, PerformAttempt](
                                bool Success, nlohmann::json Response) {
                const int Status = Response.is_object() ? Response.value("_httpStatus", 0) : 0;
                const bool TransportFailure = !Success && Status == 0;
                if (!Success && !State->ShuttingDown.load() &&
                    Policy->ShouldRetry(Method, Attempt, TransportFailure, Status))
                {
                    const auto Delay = Policy->BackoffFor(Attempt);
                    Log::GetLog()->warn("Retrying read-only HTTP request after {} ms (attempt {})",
                                        Delay.count(), Attempt + 2);
                    std::this_thread::sleep_for(Delay);
                    if (!State->ShuttingDown.load()) (*PerformAttempt)(Attempt + 1);
                    return;
                }
                Finalize(Success, std::move(Response));
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
                wchar_t extraInfo[2048] = { 0 };

                urlComp.lpszHostName = hostName;
                urlComp.dwHostNameLength = sizeof(hostName) / sizeof(wchar_t);
                urlComp.lpszUrlPath = urlPath;
                urlComp.dwUrlPathLength = sizeof(urlPath) / sizeof(wchar_t);
                urlComp.lpszExtraInfo = extraInfo;
                urlComp.dwExtraInfoLength = sizeof(extraInfo) / sizeof(wchar_t);

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
                // WinHttpOpenRequest receives the path and query together. Keeping this exact
                // target in the HMAC canonical string prevents signed query endpoints (for
                // example wallet/events?since=...) from being sent or verified as another URL.
                const std::wstring RequestTarget = std::wstring(urlPath) + std::wstring(extraInfo);
                HINTERNET hRequest = WinHttpOpenRequest(
                    hConnect,
                    WideMethod.c_str(),
                    RequestTarget.c_str(),
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
                if (RequestSigning::IsSignedPluginEndpoint(Endpoint))
                {
                    std::string PathAndQuery = ArkApi::Tools::Utf8Encode(RequestTarget);
                    std::string Nonce = RequestSigning::GenerateNonceHex();
                    if (Nonce.empty())
                    {
                        Log::GetLog()->error("BCryptGenRandom failed while creating request nonce");
                        WinHttpCloseHandle(hRequest);
                        WinHttpCloseHandle(hConnect);
                        WinHttpCloseHandle(hSession);
                        Complete(false, {});
                        return;
                    }
                    long long Timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count();
                    std::string TimestampStr = std::to_string(Timestamp);
                    std::string ContentSha = RequestSigning::CalculateSha256Hex(BodyStr);
                    if (ContentSha.empty())
                    {
                        Log::GetLog()->error("SHA-256 calculation failed while signing request");
                        WinHttpCloseHandle(hRequest);
                        WinHttpCloseHandle(hConnect);
                        WinHttpCloseHandle(hSession);
                        Complete(false, {});
                        return;
                    }
                    // Canonical signing string is unchanged. The HMAC is computed with the
                    // shared secret (ApiKey); the secret is NEVER placed in any header.
                    std::string CanonicalString = RequestSigning::BuildCanonicalRequest(
                        Method,
                        PathAndQuery,
                        TimestampStr,
                        Nonce,
                        ContentSha);
                    std::string Signature = RequestSigning::CalculateHmacSha256Hex(CanonicalString, ApiKey);
                    if (Signature.empty())
                    {
                        Log::GetLog()->error("HMAC-SHA256 calculation failed while signing request");
                        WinHttpCloseHandle(hRequest);
                        WinHttpCloseHandle(hConnect);
                        WinHttpCloseHandle(hSession);
                        Complete(false, {});
                        return;
                    }

                    // X-Plugin-Key-Id carries the rotatable credential identifier ONLY. It is
                    // not the secret and is safe to log. The backend resolves keyId -> secret
                    // server-side to verify X-Signature. This closes the M1 HIGH finding where
                    // the HMAC secret was transmitted as the key id on every signed request.
                    std::wstring KeyIdHdr = L"X-Plugin-Key-Id: " + std::wstring(KeyId.begin(), KeyId.end());
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
                    // LEGACY unsigned path: endpoints not yet in the signed contract still use a
                    // bearer X-API-Key. This transmits the secret on the wire and is the residual
                    // M1 risk for /verify, /stats, /player/{id}, /protection/**, chat and market
                    // plugin routes. Migrating these to hmacAuth requires a backend contract
                    // change (see CR-PLUGIN-006 handoff); the plugin must not switch unilaterally.
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
                    Complete(false, nlohmann::json{{"_httpStatus", StatusCode}});
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
            };
            (*PerformAttempt)(0);
            // Break the self-reference after the synchronous attempt chain has completed.
            *PerformAttempt = {};
            }).detach();
        }
        catch (const std::exception& e)
        {
            Policy->Release();
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
