#include "WalletNotifications.h"

namespace HeartShop
{
    std::string WalletNotifications::MakeAvailableAccountKey(
        const std::string& UserId,
        const std::string& Currency)
    {
        return "user:" + UserId + ":available:" + Currency;
    }

    bool WalletNotifications::EntryBelongsToUser(
        const std::string& AccountKey,
        const std::string& UserId)
    {
        // Match the per-user prefix "user:{UserId}:" so any of the user's sub-accounts
        // (available/held/promotional/refundable) is recognized, while system accounts
        // (e.g. "system:revenue:IC") and other users are excluded.
        const std::string Prefix = "user:" + UserId + ":";
        return AccountKey.rfind(Prefix, 0) == 0;
    }

    std::string WalletNotifications::FormatMessage(
        const std::string& TransactionType,
        const std::string& Amount,
        const std::string& Currency)
    {
        // Amount is a signed decimal STRING from the backend. We never parse it to a
        // number; we only inspect the leading sign to choose credit/debit wording.
        const bool IsDebit = !Amount.empty() && Amount[0] == '-';
        // Strip a single leading '-' for display magnitude without doing arithmetic.
        const std::string Magnitude = IsDebit ? Amount.substr(1) : Amount;

        std::string Verb = IsDebit ? "debited" : "credited";

        std::string Label;
        if (TransactionType == "wallet_credit")
        {
            Label = "Top-up";
        }
        else if (TransactionType == "checkout_purchase")
        {
            Label = "Purchase";
        }
        else if (TransactionType == "refund")
        {
            Label = "Refund";
        }
        else if (TransactionType == "marketplace_sale" || TransactionType == "listing_sold")
        {
            Label = "Marketplace sale";
        }
        else if (!TransactionType.empty())
        {
            Label = TransactionType;
        }
        else
        {
            Label = "Wallet";
        }

        return "IRIS Wallet: " + Label + " " + Verb + " " + Magnitude + " " + Currency;
    }

    std::optional<WalletNotifications::Notification> WalletNotifications::ConsumeEvent(
        const nlohmann::json& Event,
        const std::string& UserId)
    {
        if (!Event.is_object())
        {
            return std::nullopt;
        }

        // Only handle the wallet posting event type.
        const std::string EventType = Event.value("eventType", std::string());
        if (EventType != "wallet.transaction.posted")
        {
            return std::nullopt;
        }

        const std::string EventId = Event.value("eventId", std::string());
        if (EventId.empty())
        {
            return std::nullopt;
        }

        // Idempotent notification sync: never notify twice for the same event.
        if (m_SeenEventIds.find(EventId) != m_SeenEventIds.end())
        {
            return std::nullopt;
        }

        if (!Event.contains("entries") || !Event["entries"].is_array())
        {
            return std::nullopt;
        }

        const std::string TransactionType = Event.value("transactionType", std::string());

        // Find this user's own entry (one side of the double-entry transaction).
        for (const auto& Entry : Event["entries"])
        {
            if (!Entry.is_object())
            {
                continue;
            }

            const std::string AccountKey = Entry.value("accountKey", std::string());
            if (!EntryBelongsToUser(AccountKey, UserId))
            {
                continue;
            }

            const std::string Amount = Entry.value("amount", std::string());
            const std::string Currency = Entry.value("currency", std::string("IC"));

            // Mark seen only once we have a matching, valid entry to surface.
            m_SeenEventIds.insert(EventId);

            Notification Result;
            Result.EventId = EventId;
            Result.TransactionType = TransactionType;
            Result.Amount = Amount;
            Result.Currency = Currency;
            Result.Message = FormatMessage(TransactionType, Amount, Currency);
            return Result;
        }

        // No entry for this user: not relevant, do not mark seen (a future event with
        // the same id is not expected, but we avoid suppressing a re-scoped delivery).
        return std::nullopt;
    }

    std::vector<WalletNotifications::Notification> WalletNotifications::ConsumeBatch(
        const nlohmann::json& Payload,
        const std::string& UserId)
    {
        std::vector<Notification> Out;

        const nlohmann::json* Events = nullptr;
        if (Payload.is_array())
        {
            Events = &Payload;
        }
        else if (Payload.is_object() && Payload.contains("events") && Payload["events"].is_array())
        {
            Events = &Payload["events"];
        }
        else
        {
            return Out;
        }

        for (const auto& Event : *Events)
        {
            auto Notification = ConsumeEvent(Event, UserId);
            if (Notification.has_value())
            {
                Out.push_back(std::move(Notification.value()));
            }
        }
        return Out;
    }

    bool WalletNotifications::HasSeen(const std::string& EventId) const
    {
        return m_SeenEventIds.find(EventId) != m_SeenEventIds.end();
    }
}
