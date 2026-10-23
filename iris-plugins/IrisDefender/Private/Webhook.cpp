#include "Webhook.h"
#include "Config.h"
#include "Logger.h"
#include <iomanip>
#include <ctime>

std::string DiscordWebhook::GetIsoUtcTimestamp() const
{
    auto now = std::chrono::system_clock::now();
    std::time_t now_c = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc;
#if defined(_WIN32)
    gmtime_s(&tm_utc, &now_c);
#else
    gmtime_r(&now_c, &tm_utc);
#endif

    char buf[64];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
        tm_utc.tm_year + 1900, tm_utc.tm_mon + 1, tm_utc.tm_mday,
        tm_utc.tm_hour, tm_utc.tm_min, tm_utc.tm_sec);
    return std::string(buf);
}

void DiscordWebhook::DispatchAlert(
    uint64 steamId,
    AShooterPlayerController* pc,
    const std::string& violationType,
    const FVector& location,
    const std::string& actionTaken,
    const std::string& details)
{
    const auto obsConfig = Config::Get().GetObservability();
    if (!obsConfig.DiscordWebhookEnabled || obsConfig.DiscordWebhookUrl.empty())
    {
        return;
    }

    std::string playerName = "Unknown";
    int tribeId = 0;

    if (pc)
    {
        FString charName;
        pc->GetPlayerCharacterName(&charName);
        if (!charName.IsEmpty())
        {
            playerName = charName.ToString();
        }
        tribeId = pc->TargetingTeamField();
    }

    std::string serverId = Config::Get().GetGeneral().ServerId;

    try
    {
        nlohmann::json payload;
        payload["username"] = "IrisDefender Security Sentinel";
        payload["embeds"] = nlohmann::json::array();

        std::ostringstream coordStream;
        coordStream << "X: " << static_cast<int>(location.X)
                    << " | Y: " << static_cast<int>(location.Y)
                    << " | Z: " << static_cast<int>(location.Z);

        nlohmann::json embed;
        embed["title"] = "🚨 Security Enforcement Alert";
        embed["color"] = 15158332; // Red
        embed["timestamp"] = GetIsoUtcTimestamp();

        embed["fields"] = nlohmann::json::array({
            {{"name", "Server"}, {"value", serverId}, {"inline", true}},
            {{"name", "Player"}, {"value", playerName}, {"inline", true}},
            {{"name", "SteamID"}, {"value", std::to_string(steamId)}, {"inline", true}},
            {{"name", "Tribe ID"}, {"value", std::to_string(tribeId)}, {"inline", true}},
            {{"name", "Violation Type"}, {"value", violationType}, {"inline", true}},
            {{"name", "Action Taken"}, {"value", actionTaken}, {"inline", true}},
            {{"name", "Coordinates"}, {"value", coordStream.str()}, {"inline", false}},
            {{"name", "Details"}, {"value", details.empty() ? "N/A" : details}, {"inline", false}}
        });

        payload["embeds"].push_back(embed);

        std::string jsonString = payload.dump();

        API::Requests::Get().CreatePostRequest(
            obsConfig.DiscordWebhookUrl,
            [](bool success, std::string response) {
                if (!success)
                {
                    SecurityLogger::Get().Warn("[DiscordWebhook] HTTP post failed: " + response);
                }
            },
            jsonString,
            "application/json"
        );
    }
    catch (const std::exception& e)
    {
        SecurityLogger::Get().Error(std::string("[DiscordWebhook] Failed to prepare payload: ") + e.what());
    }
}
