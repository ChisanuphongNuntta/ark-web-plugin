#include "../src/WalletNotifications.h"

#include <iostream>
#include <nlohmann/json.hpp>

namespace
{
    int Failures = 0;

    void Expect(bool Condition, const char* Message)
    {
        if (!Condition)
        {
            ++Failures;
            std::cerr << "FAIL: " << Message << '\n';
        }
    }

    // Matches backend/contracts/events/wallet.transaction-posted.example.json,
    // annotated with the additive routing fields the plugin poll requires
    // (playerSteamId + userId; CR-PLUGIN-008).
    nlohmann::json MakeCheckoutEvent()
    {
        return nlohmann::json::parse(R"({
            "eventId": "evt_01HZX9checkoutpurchase01",
            "eventType": "wallet.transaction.posted",
            "occurredAt": "2026-06-20T03:06:00.000Z",
            "transactionId": "ckl1tx0000checkoutpurchase01",
            "transactionType": "checkout_purchase",
            "referenceType": "checkout",
            "referenceId": "7f09c693-e18e-4a67-b50a-9d297e28b8cf",
            "playerSteamId": "76561198000000001",
            "userId": "9a75908e-5b12-4217-ba6e-cc7887e5b56a",
            "entries": [
                { "accountKey": "user:9a75908e-5b12-4217-ba6e-cc7887e5b56a:available:IC", "amount": "-1000", "currency": "IC" },
                { "accountKey": "system:revenue:IC", "amount": "1000", "currency": "IC" }
            ]
        })");
    }

    nlohmann::json MakeTopupEvent()
    {
        return nlohmann::json::parse(R"({
            "eventId": "evt_01HZX9topupcredit0001",
            "eventType": "wallet.transaction.posted",
            "transactionType": "wallet_credit",
            "playerSteamId": "76561198000000001",
            "userId": "9a75908e-5b12-4217-ba6e-cc7887e5b56a",
            "entries": [
                { "accountKey": "system:cash:IC", "amount": "-2250", "currency": "IC" },
                { "accountKey": "user:9a75908e-5b12-4217-ba6e-cc7887e5b56a:available:IC", "amount": "2250", "currency": "IC" }
            ]
        })");
    }
}

int main()
{
    using HeartShop::WalletNotifications;
    const std::string UserId = "9a75908e-5b12-4217-ba6e-cc7887e5b56a";

    // Account key helper + ownership matching.
    Expect(
        WalletNotifications::MakeAvailableAccountKey(UserId) ==
            "user:9a75908e-5b12-4217-ba6e-cc7887e5b56a:available:IC",
        "available account key format matches the wallet fixtures");
    Expect(
        WalletNotifications::EntryBelongsToUser("user:" + UserId + ":held:IC", UserId),
        "held sub-account is recognized as belonging to the user");
    Expect(
        !WalletNotifications::EntryBelongsToUser("system:revenue:IC", UserId),
        "system account does not belong to the user");
    Expect(
        !WalletNotifications::EntryBelongsToUser("user:someone-else:available:IC", UserId),
        "another user's account does not match");

    WalletNotifications Notifier;

    // Debit (purchase): only the user's -1000 side is surfaced, not system +1000.
    auto Purchase = Notifier.ConsumeEvent(MakeCheckoutEvent(), UserId);
    Expect(Purchase.has_value(), "checkout purchase event yields a notification");
    if (Purchase.has_value())
    {
        Expect(Purchase->Amount == "-1000", "purchase surfaces the user's signed entry amount verbatim");
        Expect(Purchase->Currency == "IC", "purchase currency is IC");
        Expect(Purchase->TransactionType == "checkout_purchase", "transaction type preserved");
        Expect(
            Purchase->Message == "IRIS Wallet: Purchase debited 1000 IC",
            "debit message formats magnitude without arithmetic");
    }

    // Idempotency: replaying the same eventId produces nothing.
    auto Replay = Notifier.ConsumeEvent(MakeCheckoutEvent(), UserId);
    Expect(!Replay.has_value(), "duplicate eventId is suppressed (idempotent notification sync)");
    Expect(Notifier.SeenCount() == 1, "exactly one event marked seen after a replay");

    // Credit (top-up): positive amount, credited wording.
    auto Topup = Notifier.ConsumeEvent(MakeTopupEvent(), UserId);
    Expect(Topup.has_value(), "top-up event yields a notification");
    if (Topup.has_value())
    {
        Expect(Topup->Amount == "2250", "top-up surfaces the positive entry amount");
        Expect(
            Topup->Message == "IRIS Wallet: Top-up credited 2250 IC",
            "credit message uses credited wording");
    }

    // Wrong event type is ignored.
    nlohmann::json Other = MakeTopupEvent();
    Other["eventId"] = "evt_other";
    Other["eventType"] = "order.placed";
    Expect(!Notifier.ConsumeEvent(Other, UserId).has_value(), "non-wallet event type is ignored");

    // Event with no entry for this user is not surfaced.
    nlohmann::json Foreign = MakeTopupEvent();
    Foreign["eventId"] = "evt_foreign";
    Foreign["entries"] = nlohmann::json::array({
        { {"accountKey", "user:another:available:IC"}, {"amount", "5"}, {"currency", "IC"} },
        { {"accountKey", "system:cash:IC"}, {"amount", "-5"}, {"currency", "IC"} }
    });
    Expect(!Notifier.ConsumeEvent(Foreign, UserId).has_value(), "event with no entry for this user is ignored");

    // Batch consumption with mixed/duplicate events.
    WalletNotifications BatchNotifier;
    nlohmann::json Batch;
    Batch["events"] = nlohmann::json::array({ MakeCheckoutEvent(), MakeTopupEvent(), MakeCheckoutEvent() });
    auto Notifications = BatchNotifier.ConsumeBatch(Batch, UserId);
    Expect(Notifications.size() == 2, "batch de-duplicates by eventId across the batch");

    // Bare-array batch form is also accepted.
    {
        WalletNotifications ArrayNotifier;
        nlohmann::json Arr = nlohmann::json::array({ MakeTopupEvent() });
        Expect(ArrayNotifier.ConsumeBatch(Arr, UserId).size() == 1, "bare-array batch form is accepted");
    }

    if (Failures == 0)
    {
        std::cout << "WalletNotificationsTests passed\n";
    }
    return Failures == 0 ? 0 : 1;
}
