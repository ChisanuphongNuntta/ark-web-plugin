#pragma once

#include <string>
#include <vector>
#include <functional>
#include <nlohmann/json.hpp>

namespace HeartShop
{
    using HttpCallback = std::function<void(bool Success, const nlohmann::json& Response)>;

    class HttpClient
    {
    public:
        // ApiUrl read from config.json HeartShop.ApiUrl (e.g. "https://yourdomain.com/api/plugin")
        HttpClient(const std::string& ApiUrl, const std::string& ApiKey, int ServerId);
        ~HttpClient();

        // Generic request method (for Protection and other APIs)
        void Request(const std::string& Method, const std::string& Endpoint, const std::string& Body, HttpCallback Callback);

        // License verification
        void VerifyLicense(HttpCallback Callback);

        // API methods
        void GetPendingOrders(HttpCallback Callback);
        void MarkDelivered(const std::string& OrderId, HttpCallback Callback);
        void MarkFailed(const std::string& OrderId, const std::string& Error, HttpCallback Callback);
        void SendHeartbeat(int PlayerCount, HttpCallback Callback);
        void UpdatePlayerStats(const nlohmann::json& PlayersData, HttpCallback Callback);
        void GetPlayerInfo(const std::string& SteamId, HttpCallback Callback);

        // Dino Market API
        void CreateDinoListing(const nlohmann::json& DinoData, HttpCallback Callback);
        void GetPendingDinoDeliveries(HttpCallback Callback);
        void MarkDinoDelivered(const std::string& ListingId, HttpCallback Callback);
        void GetCancelledDinoReturns(HttpCallback Callback);
        void MarkDinoReturned(const std::string& ListingId, HttpCallback Callback);

        // Cross-Chat API
        void GetChatMessages(const std::string& Since, HttpCallback Callback);
        void SendChatMessage(const std::string& SteamId, const std::string& PlayerName, const std::string& Content, const std::vector<std::string>& PlayerGroups, HttpCallback Callback);

    private:
        void DoRequest(const std::string& Method, const std::string& Endpoint, const nlohmann::json& Body, HttpCallback Callback);
        void DoGet(const std::string& Endpoint, HttpCallback Callback);
        void DoPost(const std::string& Endpoint, const nlohmann::json& Body, HttpCallback Callback);

        std::string m_BaseUrl;
        std::string m_ApiKey;
        int m_ServerId;
    };
}
