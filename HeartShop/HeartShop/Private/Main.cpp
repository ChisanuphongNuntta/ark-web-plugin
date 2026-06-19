#include <API/ARK/Ark.h>
#include <API/UE/Math/ColorList.h>
#include <Logger/Logger.h>
#include <fstream>
#include "Base.h"
#include "HeartShop.h"
#ifdef HEARTSHOP_ENABLE_MYSQL
#include "Database/MysqlDB.h"
#endif
#include "Database/SqlLiteDB.h"

// HeartShop Features
#include "Helpers/HttpClient.h"
#include "Features/WebStore.h"
#include "Features/CrossChat.h"

// Legacy Headers for Init
#include "Public/Points.h"
#include "Public/Store.h"
#include "Public/Kits.h"


#pragma comment(lib, "ArkApi.lib")
#pragma comment(lib, "Permissions.lib")
#ifdef HEARTSHOP_ENABLE_MYSQL
#pragma comment(lib, "mysqlclient.lib")
#endif

namespace HeartShop
{
    void ReadConfig()
    {
        const std::string config_path = ArkApi::Tools::GetCurrentDir() + "/ArkApi/Plugins/HeartShop/config.json";
        std::ifstream file{ config_path };
        if (!file.is_open())
        {
             // Fallback to HeartShop config if ArkShop not found?
             // For now, adhere to ArkShop path for compatibility
             throw std::runtime_error("Can't open ArkShop/config.json");
        }
        file >> config;
        file.close();
    }

    void Load()
    {
        Log::Get().Init("HeartShop");
        
        try
        {
            ReadConfig();
        }
        catch (const std::exception& error)
        {
            Log::GetLog()->error(error.what());
            throw;
        }

        try
        {
            bool use_mysql = false; // MySQL disabled — web backend handles all data

            if (use_mysql)
            {
#ifdef HEARTSHOP_ENABLE_MYSQL
                auto& mysql_conf = config["Mysql"];
                database = std::make_unique<MySql>(
                    mysql_conf.value("MysqlHost", ""),
                    mysql_conf.value("MysqlUser", ""),
                    mysql_conf.value("MysqlPass", ""),
                    mysql_conf.value("MysqlDB", ""),
                    mysql_conf.value("MysqlPlayersTable", "ArkShopPlayers"),
                    mysql_conf.value("MysqlPort", 3306)
                );
#endif
            }
            else
            {
                std::string db_path = "";
                if (config.contains("General") && !config["General"].is_null())
                    db_path = config["General"].value("DbPathOverride", "");
                database = std::make_unique<SqlLite>(db_path);
            }
        }
        catch (const std::exception& error)
        {
            Log::GetLog()->error("Database Init Error: {}", error.what());
            throw;
        }

        // Initialize Http Client
        try
        {
            std::string apiUrl = "https://localhost/api/plugin";
            std::string apiKey = "";
            int serverId = 1;
            if (config.contains("HeartShop")) {
                apiUrl   = config["HeartShop"].value("ApiUrl",   apiUrl);
                apiKey   = config["HeartShop"].value("ApiKey",   apiKey);
                serverId = config["HeartShop"].value("ServerId", serverId);
            }
            Http = std::make_unique<HttpClient>(apiUrl, apiKey, serverId);
        }
        catch (const std::exception& error)
        {
             Log::GetLog()->error("Http Init Error: {}", error.what());
        }

        // Initialize Legacy Modules
        ArkShop::Points::Init();
        ArkShop::Store::Init();
        ArkShop::Kits::Init();

        // Initialize HeartShop Features
        Features::WebStore::Init();
        Features::CrossChat::Init();

        Log::GetLog()->info("HeartShop (ArkShop Replacement) Loaded Successfully!");
    }

    void Unload()
    {
        Features::CrossChat::Unload();
        Features::WebStore::Unload();

        ArkShop::Points::Unload();
        ArkShop::Store::Unload();
        ArkShop::Kits::Unload();
        
        Log::GetLog()->info("HeartShop Unloaded!");
    }
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    switch (ul_reason_for_call)
    {
    case DLL_PROCESS_ATTACH:
        HeartShop::Load();
        break;
    case DLL_PROCESS_DETACH:
        HeartShop::Unload();
        break;
    }
    return TRUE;
}
