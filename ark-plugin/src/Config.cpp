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

            // Connection settings are validated in locals and only committed once all
            // checks pass, so a rejected config never reaches the HttpClient.
            std::string ApiUrl = Config.value("ApiUrl", "https://localhost/api/plugin");
            while (!ApiUrl.empty() && ApiUrl.back() == '/')
            {
                ApiUrl.pop_back();
            }

            if (ApiUrl.rfind("https://", 0) != 0)
            {
                Log::GetLog()->error("HeartShop ApiUrl must use HTTPS: {}", ApiUrl);
                return false;
            }

            const std::string ApiKey = Config.value("ApiKey", "");
            const int ServerId = Config.value("ServerId", 1);

            // X-Plugin-Key-Id is a rotatable, loggable credential identifier that is
            // strictly separate from the HMAC secret (ApiKey). The secret must NEVER be
            // transmitted on the wire. When KeyId is not explicitly configured we derive a
            // non-secret, stable placeholder from the server id instead of falling back to
            // the secret value. Operators should configure an explicit KeyId issued with the
            // credential so the backend can resolve keyId -> secret and support rotation.
            std::string KeyId = Config.value("KeyId", "");
            if (KeyId.empty())
            {
                KeyId = "server-" + std::to_string(ServerId);
                Log::GetLog()->warn(
                    "HeartShop KeyId is not configured; using non-secret placeholder '{}'. "
                    "Configure a backend-issued KeyId to enable credential rotation. "
                    "The HMAC secret is never sent on the wire.",
                    KeyId);
            }
            if (KeyId == ApiKey && !ApiKey.empty())
            {
                // Guard against an operator pasting the secret into KeyId, which would
                // leak the secret in every signed request and in logs.
                Log::GetLog()->error(
                    "HeartShop KeyId must not equal the HMAC secret (ApiKey); "
                    "refusing to transmit the secret as a key id");
                return false;
            }
            const bool AllowInvalidCertificates = Config.value("Security", nlohmann::json::object())
                .value("AllowInvalidCertificates", false);

            const bool IsLocalApi =
                ApiUrl.rfind("https://localhost", 0) == 0 ||
                ApiUrl.rfind("https://127.0.0.1", 0) == 0 ||
                ApiUrl.rfind("https://[::1]", 0) == 0;
            if (AllowInvalidCertificates && !IsLocalApi)
            {
                Log::GetLog()->error(
                    "AllowInvalidCertificates is restricted to localhost development endpoints");
                return false;
            }

            m_ApiUrl = std::move(ApiUrl);
            m_ApiKey = ApiKey;
            m_ServerId = ServerId;
            m_KeyId = std::move(KeyId);
            m_AllowInvalidCertificates = AllowInvalidCertificates;
            m_PollInterval = Config.value("PollInterval", 30);
            m_StatsInterval = Config.value("StatsInterval", 300);
            m_HeartbeatInterval = Config.value("HeartbeatInterval", 60);

            // Optional section; a missing key keeps the safe default (defer).
            const auto Delivery = Config.value("Delivery", nlohmann::json::object());
            if (Delivery.is_object())
            {
                m_DeferWhileNoglinControlled = Delivery.value("DeferWhileNoglinControlled", true);
                m_DeferWhileUnconscious = Delivery.value("DeferWhileUnconscious", true);
                m_DeferWhileCarried = Delivery.value("DeferWhileCarried", true);
            }

            m_PermissionAllowedGroups.clear();
            const auto Permissions = Config.value("Permissions", nlohmann::json::object());
            if (Permissions.is_object() && Permissions.contains("AllowedGroups") &&
                Permissions["AllowedGroups"].is_array())
            {
                for (const auto& Group : Permissions["AllowedGroups"])
                {
                    if (Group.is_string() && !Group.get<std::string>().empty())
                    {
                        m_PermissionAllowedGroups.push_back(Group.get<std::string>());
                    }
                }
            }
            const auto Vip = Config.value("Vip", nlohmann::json::object());
            m_VipCommandEnabled = Vip.is_object() ? Vip.value("CommandEnabled", true) : true;
            m_VipChatRankPrefix = Vip.is_object() ? Vip.value("ChatRankPrefix", true) : true;

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
            return m_ConfigJson.at("HeartShop").at("Messages").value("Prefix", "[HeartShop]");
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
            return m_ConfigJson.at("HeartShop").at("Messages").value(Key, "");
        }
        catch (...)
        {
            return "";
        }
    }
}
