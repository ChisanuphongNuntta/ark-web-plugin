#pragma once

#include "Database/IDatabase.h"
#include "Helpers/HttpClient.h"
#include <json.hpp>

namespace HeartShop
{
	inline nlohmann::json config;
	inline std::unique_ptr<IDatabase> database;
    inline std::unique_ptr<HttpClient> Http;
    
    // Helper to get text from config
    inline FString GetText(const std::string& str)
    {
        if (config["Messages"].find(str) != config["Messages"].end())
            return FString(ArkApi::Tools::Utf8Decode(config["Messages"][str]).c_str());
        return FString("");
    }
}
