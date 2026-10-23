#pragma once

#include "IrisDefender.h"
#include <Requests.h>

class DiscordWebhook
{
public:
    static DiscordWebhook& Get()
    {
        static DiscordWebhook instance;
        return instance;
    }

    void DispatchAlert(
        uint64 steamId,
        AShooterPlayerController* pc,
        const std::string& violationType,
        const FVector& location,
        const std::string& actionTaken,
        const std::string& details
    );

private:
    DiscordWebhook() = default;
    ~DiscordWebhook() = default;
    DiscordWebhook(const DiscordWebhook&) = delete;
    DiscordWebhook& operator=(const DiscordWebhook&) = delete;

    std::string GetIsoUtcTimestamp() const;
};
