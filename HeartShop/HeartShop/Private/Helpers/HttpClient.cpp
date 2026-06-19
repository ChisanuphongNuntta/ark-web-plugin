#include "HttpClient.h"
#include <Logger/Logger.h>
#include <thread>
#include <Windows.h>
#include <winhttp.h>

#pragma comment(lib, "winhttp.lib")

namespace HeartShop
{
    HttpClient::HttpClient(const std::string& ApiUrl, const std::string& ApiKey, int ServerId)
        : m_BaseUrl(ApiUrl)
        , m_ApiKey(ApiKey)
        , m_ServerId(ServerId)
    {
    }

    HttpClient::~HttpClient()
    {
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
        // Run HTTP request in a separate thread to avoid blocking game
        std::thread([this, Method, Endpoint, Body, Callback]() {
            try
            {
                // Parse URL
                std::string FullUrl = m_BaseUrl + Endpoint;

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
                    Callback(false, {});
                    return;
                }

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
                    Callback(false, {});
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
                    Callback(false, {});
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
                    Callback(false, {});
                    return;
                }

                // Ignore SSL certificate errors (needed for localhost/self-signed certs)
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

                // Add headers
                std::wstring ApiKeyHeader = L"X-API-Key: " + std::wstring(m_ApiKey.begin(), m_ApiKey.end());
                WinHttpAddRequestHeaders(hRequest, ApiKeyHeader.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);
                std::wstring ServerIdHeader = L"X-Server-Id: " + std::to_wstring(m_ServerId);
                WinHttpAddRequestHeaders(hRequest, ServerIdHeader.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD);
                WinHttpAddRequestHeaders(hRequest, L"Content-Type: application/json", -1, WINHTTP_ADDREQ_FLAG_ADD);

                // Send request
                std::string BodyStr = Body.empty() ? "" : Body.dump();
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
                    Callback(false, {});
                    return;
                }

                if (!WinHttpReceiveResponse(hRequest, NULL))
                {
                    Log::GetLog()->error("WinHttpReceiveResponse failed: {}", GetLastError());
                    WinHttpCloseHandle(hRequest);
                    WinHttpCloseHandle(hConnect);
                    WinHttpCloseHandle(hSession);
                    Callback(false, {});
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
                    Callback(false, {});
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
                    Callback(true, ResponseJson);
                }
                catch (...)
                {
                    Log::GetLog()->error("Failed to parse JSON response");
                    Callback(false, {});
                }
            }
            catch (const std::exception& e)
            {
                Log::GetLog()->error("HTTP request failed: {}", e.what());
                Callback(false, {});
            }
        }).detach();
    }
}
