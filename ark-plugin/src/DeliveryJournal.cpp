#include "DeliveryJournal.h"

#include <Windows.h>
#include <chrono>
#include <fstream>
#include <iomanip>
#include <sstream>

namespace HeartShop
{
    DeliveryJournal::DeliveryJournal(std::filesystem::path JournalPath)
        : m_JournalPath(std::move(JournalPath))
        , m_Data({{"version", 1}, {"deliveries", nlohmann::json::object()}})
    {
    }

    bool DeliveryJournal::Load()
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);

        if (!std::filesystem::exists(m_JournalPath))
        {
            return PersistLocked();
        }

        try
        {
            std::ifstream File(m_JournalPath, std::ios::binary);
            if (!File.is_open())
            {
                return false;
            }

            File >> m_Data;
            if (!m_Data.is_object() ||
                !m_Data.contains("deliveries") ||
                !m_Data["deliveries"].is_object())
            {
                return false;
            }
            return true;
        }
        catch (...)
        {
            return false;
        }
    }

    DeliveryJournal::BeginResult DeliveryJournal::Begin(
        const std::string& DeliveryType,
        const std::string& DeliveryId,
        const std::string& Payload)
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        const std::string Key = MakeKey(DeliveryType, DeliveryId);
        const std::string PayloadFingerprint = Fingerprint(Payload);
        auto& Deliveries = m_Data["deliveries"];

        if (Deliveries.contains(Key))
        {
            const auto& Existing = Deliveries[Key];
            if (Existing.value("payloadFingerprint", "") != PayloadFingerprint)
            {
                return BeginResult::PayloadMismatch;
            }

            if (Existing.value("state", "") == "completed")
            {
                return BeginResult::AlreadyCompleted;
            }
            return BeginResult::UncertainPrepared;
        }

        Deliveries[Key] = {
            {"deliveryType", DeliveryType},
            {"deliveryId", DeliveryId},
            {"payloadFingerprint", PayloadFingerprint},
            {"payload", Payload},
            {"receiptId", Key},
            {"state", "prepared"},
            {"preparedAt", UnixMilliseconds()}
        };

        if (!PersistLocked())
        {
            Deliveries.erase(Key);
            return BeginResult::PersistenceError;
        }
        return BeginResult::Started;
    }

    bool DeliveryJournal::Complete(
        const std::string& DeliveryType,
        const std::string& DeliveryId)
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        const std::string Key = MakeKey(DeliveryType, DeliveryId);
        auto& Deliveries = m_Data["deliveries"];
        if (!Deliveries.contains(Key))
        {
            return false;
        }

        // Completion is allowed to become observable only after it is durable.
        // Keep the prior prepared record so a failed atomic replace cannot leave
        // this process believing the delivery completed while the on-disk
        // journal still says prepared. That mismatch could otherwise cause a
        // later duplicate poll in the same process to acknowledge the delivery.
        const auto Previous = Deliveries[Key];
        Deliveries[Key]["state"] = "completed";
        Deliveries[Key]["completedAt"] = UnixMilliseconds();
        if (!PersistLocked())
        {
            Deliveries[Key] = Previous;
            return false;
        }
        return true;
    }

    bool DeliveryJournal::Abort(
        const std::string& DeliveryType,
        const std::string& DeliveryId)
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        const std::string Key = MakeKey(DeliveryType, DeliveryId);
        auto& Deliveries = m_Data["deliveries"];
        if (!Deliveries.contains(Key))
        {
            return true;
        }
        if (Deliveries[Key].value("state", "") == "completed")
        {
            return false;
        }

        const auto Previous = Deliveries[Key];
        Deliveries.erase(Key);
        if (!PersistLocked())
        {
            Deliveries[Key] = Previous;
            return false;
        }
        return true;
    }

    bool DeliveryJournal::MarkMutating(
        const std::string& DeliveryType,
        const std::string& DeliveryId)
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        const std::string Key = MakeKey(DeliveryType, DeliveryId);
        auto& Deliveries = m_Data["deliveries"];
        if (!Deliveries.contains(Key) || Deliveries[Key].value("state", "") != "prepared")
        {
            return false;
        }
        const auto Previous = Deliveries[Key];
        Deliveries[Key]["state"] = "mutating";
        Deliveries[Key]["mutatingAt"] = UnixMilliseconds();
        if (!PersistLocked())
        {
            Deliveries[Key] = Previous;
            return false;
        }
        return true;
    }

    std::vector<DeliveryJournal::PendingRecord> DeliveryJournal::Pending(
        const std::string& DeliveryType)
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        std::vector<PendingRecord> Result;
        const auto& Deliveries = m_Data["deliveries"];
        for (auto It = Deliveries.begin(); It != Deliveries.end(); ++It)
        {
            const auto& Record = It.value();
            const std::string State = Record.value("state", "");
            if (Record.value("deliveryType", "") != DeliveryType || State == "completed")
            {
                continue;
            }
            Result.push_back({
                Record.value("deliveryId", ""),
                State,
                Record.value("payload", "")
            });
        }
        return Result;
    }

    std::string DeliveryJournal::MakeKey(
        const std::string& DeliveryType,
        const std::string& DeliveryId)
    {
        return DeliveryType + ":" + DeliveryId;
    }

    std::string DeliveryJournal::Fingerprint(const std::string& Payload)
    {
        // Stable FNV-1a fingerprint used to detect a changed payload for the
        // same delivery ID. Request authentication will use SHA-256 separately.
        unsigned long long Hash = 14695981039346656037ull;
        for (const unsigned char Byte : Payload)
        {
            Hash ^= Byte;
            Hash *= 1099511628211ull;
        }

        std::ostringstream Stream;
        Stream << std::hex << std::setfill('0') << std::setw(16) << Hash;
        return Stream.str();
    }

    bool DeliveryJournal::PersistLocked()
    {
        try
        {
            const auto Parent = m_JournalPath.parent_path();
            if (!Parent.empty())
            {
                std::filesystem::create_directories(Parent);
            }

            const auto TemporaryPath = m_JournalPath.string() + ".tmp";
            {
                std::ofstream File(TemporaryPath, std::ios::binary | std::ios::trunc);
                if (!File.is_open())
                {
                    return false;
                }
                File << m_Data.dump(2);
                File.flush();
                if (!File.good())
                {
                    return false;
                }
            }

            return MoveFileExW(
                std::filesystem::path(TemporaryPath).c_str(),
                m_JournalPath.c_str(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != 0;
        }
        catch (...)
        {
            return false;
        }
    }

    long long DeliveryJournal::UnixMilliseconds()
    {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
    }
}
