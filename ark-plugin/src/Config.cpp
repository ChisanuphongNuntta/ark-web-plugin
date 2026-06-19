#include "Config.h"
#include <fstream>
#include <Logger/Logger.h>

namespace HeartShop
{
    Config::Config()
        : m_ApiUrl("https://localhost/api/plugin")
        , m_ServerId(1)
        , m_AllowInvalidCertificates(false)
        , m_PollInterval(30.0f)
        , m_StatsInterval(300.0f)
        , m_HeartbeatInterval(60.0f)
    {
    }

    Config::~Config()
    {
    }

    bool Config::Load()
    {
        try
        {
            const std::string ConfigPath = ArkApi::Tools::GetCurrentDir() + "/ArkApi/Plugins/HeartShop/config.json";

            std::ifstream File(ConfigPath);
            if (!File.is_open())
            {
                Log::GetLog()->error("Could not open config file: {}", ConfigPath);
                return false;
            }

            File >> m_ConfigJson;
            File.close();

            auto& Config = m_ConfigJson["HeartShop"];

            m_ApiUrl = Config.value("ApiUrl", "https://localhost/api/plugin");
            while (!m_ApiUrl.empty() && m_ApiUrl.back() == '/')
            {
                m_ApiUrl.pop_back();
            }

            if (m_ApiUrl.rfind("https://", 0) != 0)
            {
                Log::GetLog()->error("HeartShop ApiUrl must use HTTPS: {}", m_ApiUrl);
                return false;
            }

            m_ApiKey = Config.value("ApiKey", "");
            m_ServerId = Config.value("ServerId", 1);

            // X-Plugin-Key-Id is a rotatable, loggable credential identifier that is
            // strictly separate from the HMAC secret (ApiKey). The secret must NEVER be
            // transmitted on the wire. When KeyId is not explicitly configured we derive a
            // non-secret, stable placeholder from the server id instead of falling back to
            // the secret value. Operators should configure an explicit KeyId issued with the
            // credential so the backend can resolve keyId -> secret and support rotation.
            m_KeyId = Config.value("KeyId", "");
            if (m_KeyId.empty())
            {
                m_KeyId = "server-" + std::to_string(m_ServerId);
                Log::GetLog()->warn(
                    "HeartShop KeyId is not configured; using non-secret placeholder '{}'. "
                    "Configure a backend-issued KeyId to enable credential rotation. "
                    "The HMAC secret is never sent on the wire.",
                    m_KeyId);
            }
            if (m_KeyId == m_ApiKey && !m_ApiKey.empty())
            {
                // Guard against an operator pasting the secret into KeyId, which would
                // leak the secret in every signed request and in logs.
                Log::GetLog()->error(
                    "HeartShop KeyId must not equal the HMAC secret (ApiKey); "
                    "refusing to transmit the secret as a key id");
                return false;
            }
            m_AllowInvalidCertificates = Config.value("Security", nlohmann::json::object())
                .value("AllowInvalidCertificates", false);

            const bool IsLocalApi =
                m_ApiUrl.rfind("https://localhost", 0) == 0 ||
                m_ApiUrl.rfind("https://127.0.0.1", 0) == 0 ||
                m_ApiUrl.rfind("https://[::1]", 0) == 0;
            if (m_AllowInvalidCertificates && !IsLocalApi)
            {
                Log::GetLog()->error(
                    "AllowInvalidCertificates is restricted to localhost development endpoints");
                return false;
            }
            m_PollInterval = Config.value("PollInterval", 30);
            m_StatsInterval = Config.value("StatsInterval", 300);
            m_HeartbeatInterval = Config.value("HeartbeatInterval", 60);

            Log::GetLog()->info("Config loaded successfully");
            Log::GetLog()->info("  API URL: {}", m_ApiUrl);
            Log::GetLog()->info("  Server ID: {}", m_ServerId);
            Log::GetLog()->info("  Plugin Key Id: {}", m_KeyId);
            Log::GetLog()->info("  Poll Interval: {}s", m_PollInterval);
            if (m_AllowInvalidCertificates)
            {
                Log::GetLog()->warn(
                    "TLS certificate validation is disabled for localhost development only");
            }

            return true;
        }
        catch (const std::exception& e)
        {
            Log::GetLog()->error("Failed to load config: {}", e.what());
            return false;
        }
    }

    bool Config::Save()
    {
        try
        {
            const std::string ConfigPath = ArkApi::Tools::GetCurrentDir() + "/ArkApi/Plugins/HeartShop/config.json";

            std::ofstream File(ConfigPath);
            if (!File.is_open())
            {
                return false;
            }

            File << m_ConfigJson.dump(2);
            File.close();

            return true;
        }
        catch (...)
        {
            return false;
        }
    }

    std::string Config::GetMessagePrefix() const
    {
        try
        {
            return m_ConfigJson["HeartShop"]["Messages"].value("Prefix", "[HeartShop]");
        }
        catch (...)
        {
            return "[HeartShop]";
        }
    }

    std::string Config::GetMessage(const std::string& Key) const
    {
        try
        {
            return m_ConfigJson["HeartShop"]["Messages"].value(Key, "");
        }
        catch (...)
        {
            return "";
        }
    }
}
