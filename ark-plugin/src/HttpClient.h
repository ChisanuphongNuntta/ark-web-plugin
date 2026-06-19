#pragma once

#include <string>
#include <vector>
#include <functional>
#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>

namespace HeartShop
{
    using HttpCallback = std::function<void(bool Success, const nlohmann::json& Response)>;

    class HttpClient
    {
    public:
        HttpClient(
            const std::string& ApiUrl,
            const std::string& ApiKey,
            int ServerId,
            bool AllowInvalidCertificates = false);
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
        
        // Lease-based Delivery API
        void ClaimDeliveries(int ServerId, HttpCallback Callback);
        void CompleteDelivery(
            const std::string& DeliveryKey,
            const std::string& LeaseToken,
            const std::string& SteamId,
            const std::string& PayloadHash,
            const std::string& ReceiptId,
            HttpCallback Callback);
        void FailDelivery(
            const std::string& DeliveryKey,
            const std::string& LeaseToken,
            const std::string& Error,
            HttpCallback Callback);
        void ReleaseDelivery(
            const std::string& DeliveryKey,
            const std::string& LeaseToken,
            HttpCallback Callback);

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
        struct RequestState
        {
            std::atomic<bool> ShuttingDown{false};
            std::mutex Mutex;
            std::condition_variable Finished;
            int ActiveRequests{0};
        };

        void DoRequest(const std::string& Method, const std::string& Endpoint, const nlohmann::json& Body, HttpCallback Callback);
        void DoGet(const std::string& Endpoint, HttpCallback Callback);
        void DoPost(const std::string& Endpoint, const nlohmann::json& Body, HttpCallback Callback);

        std::string m_BaseUrl;
        std::string m_ApiKey;
        int m_ServerId;
        bool m_AllowInvalidCertificates;
        std::shared_ptr<RequestState> m_RequestState;
    };
}
