#pragma once

#include <optional>
#include <set>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

namespace HeartShop
{
    // Pure, game-engine-free helper that turns backend `wallet.transaction.posted`
    // events into in-game wallet notifications for a specific player account.
    //
    // Design rules (ENTERPRISE_REDESIGN_PLAN_TH.md sections 14, 18, 20):
    //   - The plugin NEVER computes or stores a balance. It only surfaces the
    //     per-user entry amount carried in the event (a backend-authored value).
    //   - Events are double-entry; this helper extracts only the side belonging
    //     to the requested user account key and ignores system-side entries.
    //   - Each eventId is shown at most once (idempotent notification sync), so a
    //     duplicate/replayed event does not produce a duplicate in-game message.
    //
    // The class holds no Unreal types so it can be unit-tested under CTest.
    class WalletNotifications
    {
    public:
        struct Notification
        {
            std::string EventId;
            std::string TransactionType;   // e.g. "wallet_credit", "checkout_purchase"
            std::string Amount;            // signed decimal STRING, exactly as sent by backend
            std::string Currency;          // e.g. "IC"
            std::string Message;           // human-readable, ready to display in-game
        };

        // Returns the account key the backend uses for a given Steam-linked user id.
        // Format mirrors the wallet fixtures: user:{userId}:available:{currency}
        static std::string MakeAvailableAccountKey(
            const std::string& UserId,
            const std::string& Currency = "IC");

        // True when the entry's accountKey belongs to the given user (any sub-account
        // type: available/held/promotional/refundable), so the user's own movements are
        // matched even when the affected sub-account is not "available".
        static bool EntryBelongsToUser(
            const std::string& AccountKey,
            const std::string& UserId);

        // Parse one event object. Returns the user-facing notification when the event
        // is valid, carries an entry for this user, AND has not been seen before.
        // Unknown/already-seen/non-matching events yield std::nullopt.
        std::optional<Notification> ConsumeEvent(
            const nlohmann::json& Event,
            const std::string& UserId);

        // Convenience for a polled batch: { "events": [ ... ] } or a bare array.
        std::vector<Notification> ConsumeBatch(
            const nlohmann::json& Payload,
            const std::string& UserId);

        // Test/inspection helpers.
        bool HasSeen(const std::string& EventId) const;
        std::size_t SeenCount() const { return m_SeenEventIds.size(); }

    private:
        static std::string FormatMessage(
            const std::string& TransactionType,
            const std::string& Amount,
            const std::string& Currency);

        std::set<std::string> m_SeenEventIds;
    };
}
