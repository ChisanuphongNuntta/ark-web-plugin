#include "../src/DeliveryJournal.h"

#include <Windows.h>
#include <filesystem>
#include <iostream>

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
}

int main()
{
    using HeartShop::DeliveryJournal;
    const auto TestRoot = std::filesystem::temp_directory_path() /
        ("HeartShopJournalTests-" + std::to_string(GetCurrentProcessId()));
    const auto JournalPath = TestRoot / "delivery-journal.json";
    std::filesystem::remove_all(TestRoot);

    {
        DeliveryJournal Journal(JournalPath);
        Expect(Journal.Load(), "new journal should initialize");
        Expect(
            Journal.Begin("item", "order-1", "payload-a") == DeliveryJournal::BeginResult::Started,
            "first delivery should start");
        Expect(
            Journal.Begin("item", "order-1", "payload-a") == DeliveryJournal::BeginResult::UncertainPrepared,
            "concurrent or restarted prepared delivery must not run twice");
        Expect(Journal.Complete("item", "order-1"), "completion should persist");
        Expect(
            Journal.Begin("item", "order-1", "payload-a") == DeliveryJournal::BeginResult::AlreadyCompleted,
            "completed delivery should be idempotent");
        Expect(
            Journal.Begin("item", "order-1", "changed-payload") == DeliveryJournal::BeginResult::PayloadMismatch,
            "changed payload for an existing delivery ID must be rejected");

        Expect(
            Journal.Begin("dino", "listing-1", "payload-b") == DeliveryJournal::BeginResult::Started,
            "dino delivery should start");
        const auto PendingBeforeMutation = Journal.Pending("dino");
        Expect(PendingBeforeMutation.size() == 1, "prepared dino should be enumerable");
        Expect(PendingBeforeMutation[0].Payload == "payload-b", "pending payload should be durable");
        Expect(Journal.MarkMutating("dino", "listing-1"), "dino should enter mutating state durably");
        const auto PendingAfterMutation = Journal.Pending("dino");
        Expect(PendingAfterMutation[0].State == "mutating", "mutating state should be observable");
        Expect(Journal.Abort("dino", "listing-1"), "known failed mutation should be abortable");
        Expect(
            Journal.Begin("dino", "listing-1", "payload-b") == DeliveryJournal::BeginResult::Started,
            "aborted delivery should be retryable");
    }

    {
        DeliveryJournal Restarted(JournalPath);
        Expect(Restarted.Load(), "journal should reload after restart");
        Expect(
            Restarted.Begin("item", "order-1", "payload-a") == DeliveryJournal::BeginResult::AlreadyCompleted,
            "completed state should survive restart");
        Expect(
            Restarted.Begin("dino", "listing-1", "payload-b") == DeliveryJournal::BeginResult::UncertainPrepared,
            "prepared state should survive restart and block automatic redelivery");
    }

    {
        const auto FailurePath = TestRoot / "completion-failure-journal.json";
        DeliveryJournal Journal(FailurePath);
        Expect(Journal.Load(), "completion-failure journal should initialize");
        Expect(
            Journal.Begin("dino_marketplace", "delivery-locked", "payload-c") ==
                DeliveryJournal::BeginResult::Started,
            "delivery should be prepared before simulating persistence failure");

        // Deny delete sharing on the destination. MoveFileEx(REPLACE_EXISTING)
        // must fail while this handle is open, deterministically exercising the
        // rollback path without adding a production-only fault injection hook.
        HANDLE LockedJournal = CreateFileW(
            FailurePath.c_str(),
            GENERIC_READ,
            FILE_SHARE_READ,
            nullptr,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            nullptr);
        Expect(LockedJournal != INVALID_HANDLE_VALUE, "test should lock journal destination");
        if (LockedJournal != INVALID_HANDLE_VALUE)
        {
            Expect(
                !Journal.Complete("dino_marketplace", "delivery-locked"),
                "completion must report an atomic persistence failure");
            CloseHandle(LockedJournal);

            Expect(
                Journal.Begin("dino_marketplace", "delivery-locked", "payload-c") ==
                    DeliveryJournal::BeginResult::UncertainPrepared,
                "failed completion must remain prepared in memory and block acknowledgement");
            Expect(
                Journal.Complete("dino_marketplace", "delivery-locked"),
                "completion should succeed after the destination lock is released");
        }
    }

    std::filesystem::remove_all(TestRoot);
    if (Failures == 0)
    {
        std::cout << "DeliveryJournalTests passed\n";
    }
    return Failures == 0 ? 0 : 1;
}
