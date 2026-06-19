#pragma once

#include <filesystem>
#include <mutex>
#include <string>
#include <nlohmann/json.hpp>

namespace HeartShop
{
    class DeliveryJournal
    {
    public:
        enum class BeginResult
        {
            Started,
            AlreadyCompleted,
            UncertainPrepared,
            PayloadMismatch,
            PersistenceError
        };

        explicit DeliveryJournal(std::filesystem::path JournalPath);

        bool Load();
        BeginResult Begin(
            const std::string& DeliveryType,
            const std::string& DeliveryId,
            const std::string& Payload);
        bool Complete(const std::string& DeliveryType, const std::string& DeliveryId);
        bool Abort(const std::string& DeliveryType, const std::string& DeliveryId);

        static std::string MakeKey(
            const std::string& DeliveryType,
            const std::string& DeliveryId);
        static std::string Fingerprint(const std::string& Payload);

    private:
        bool PersistLocked();
        static long long UnixMilliseconds();

        std::filesystem::path m_JournalPath;
        nlohmann::json m_Data;
        std::mutex m_Mutex;
    };
}
