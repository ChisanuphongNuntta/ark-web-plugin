#pragma once

#include <string>
#include <vector>
#include <functional>
#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include "RequestPolicy.h"

namespace HeartShop
{
    using HttpCallback = std::function<void(bool Success, const nlohmann::json& Response)>;

    class HttpClient
    {
    public:
        HttpClient(
            const std::string& ApiUrl,
            const std::string& ApiKey,
            const std::string& KeyId,
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

        // Companion (read-only). Wallet balances and pending deliveries are projections owned
        // by the backend ledger/queue. The plugin only displays them; it never computes or
        // caches balances locally.
        void GetWalletBalance(const std::string& SteamId, HttpCallback Callback);
        void GetPendingDeliveries(const std::string& SteamId, HttpCallback Callback);
        void GetCatalog(const std::string& SteamId, const std::string& Search, HttpCallback Callback);
        void CreatePurchaseQuote(
            const std::string& SteamId,
            int ProductId,
            int Quantity,
            HttpCallback Callback);
        void ConfirmPurchaseQuote(
            const std::string& SteamId,
            const std::string& QuoteId,
            HttpCallback Callback);

        // Poll the backend for wallet.transaction-posted events newer than `Since`
        // (server outbox projection). Used to sync in-game wallet notifications. Read-only.
        void GetWalletEvents(const std::string& Since, HttpCallback Callback);
        
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
        void PrepareDinoLock(const nlohmann::json& DinoIdentity, HttpCallback Callback);
        void ConfirmDinoLock(const nlohmann::json& ListingData, HttpCallback Callback);
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
        std::string m_ApiKey;   // HMAC shared secret; never transmitted, only used to sign
        std::string m_KeyId;    // rotatable credential identifier sent in X-Plugin-Key-Id
        int m_ServerId;
        bool m_AllowInvalidCertificates;
        std::shared_ptr<RequestState> m_RequestState;
        std::shared_ptr<RequestPolicy> m_RequestPolicy;
    };
}
