#pragma once

#include <string>
#include <API/ARK/Ark.h>
#include <nlohmann/json.hpp>

namespace HeartShop
{
    class Config
    {
    public:
        Config();
        ~Config();

        bool Load();
        bool Save();

        // Getters
        std::string GetApiUrl() const { return m_ApiUrl; }
        // HMAC shared secret. NEVER transmitted on the wire; used only to compute X-Signature.
        std::string GetApiKey() const { return m_ApiKey; }
        // Rotatable credential identifier sent in X-Plugin-Key-Id. Safe to log. Separate from
        // the secret. Falls back to a non-secret derived value when not explicitly configured.
        std::string GetKeyId() const { return m_KeyId; }
        int GetServerId() const { return m_ServerId; }
        bool GetAllowInvalidCertificates() const { return m_AllowInvalidCertificates; }
        float GetPollInterval() const { return m_PollInterval; }
        float GetStatsInterval() const { return m_StatsInterval; }
        float GetHeartbeatInterval() const { return m_HeartbeatInterval; }

        std::string GetMessagePrefix() const;
        std::string GetMessage(const std::string& Key) const;

    private:
        nlohmann::json m_ConfigJson;

        std::string m_ApiUrl;
        std::string m_ApiKey;
        std::string m_KeyId;
        int m_ServerId;
        bool m_AllowInvalidCertificates;
        float m_PollInterval;
        float m_StatsInterval;
        float m_HeartbeatInterval;
    };
}
