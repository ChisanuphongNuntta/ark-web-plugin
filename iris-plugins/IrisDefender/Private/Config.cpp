#include "Config.h"
#include "Logger.h"

bool Config::Load(const std::string& filePath)
{
    std::unique_lock<SimpleSharedMutex> lock(mutex_);
    filePath_ = filePath;

    FILE* fp = nullptr;
    fopen_s(&fp, filePath.c_str(), "rb");
    if (!fp)
    {
        SecurityLogger::Get().Warn("[Config] Could not open config file at: " + filePath + ". Using defaults.");
        return false;
    }

    fseek(fp, 0, SEEK_END);
    long fileSize = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    std::string content;
    if (fileSize > 0)
    {
        content.resize(fileSize);
        fread(&content[0], 1, fileSize, fp);
    }
    fclose(fp);

    try
    {
        nlohmann::json j = nlohmann::json::parse(content, nullptr, false);
        if (j.is_discarded())
        {
            SecurityLogger::Get().Error("[Config] JSON parse error in: " + filePath + ". Using defaults.");
            return false;
        }

        // General
        if (j.contains("General") && j["General"].is_object())
        {
            const auto& g = j["General"];
            data_.General.Enabled = g.value("Enabled", data_.General.Enabled);
            data_.General.ServerId = g.value("ServerId", data_.General.ServerId);
            data_.General.LogToConsole = g.value("LogToConsole", data_.General.LogToConsole);
            data_.General.NotificationScale = g.value("NotificationScale", data_.General.NotificationScale);
            data_.General.NotificationTime = g.value("NotificationTime", data_.General.NotificationTime);
            data_.General.IgnoreAdmins = g.value("IgnoreAdmins", data_.General.IgnoreAdmins);
        }

        // BuildingExploit
        if (j.contains("BuildingExploit") && j["BuildingExploit"].is_object())
        {
            const auto& be = j["BuildingExploit"];
            data_.BuildingExploit.Enabled = be.value("Enabled", data_.BuildingExploit.Enabled);
            data_.BuildingExploit.BlockFloatingTurrets = be.value("BlockFloatingTurrets", data_.BuildingExploit.BlockFloatingTurrets);
            data_.BuildingExploit.RequireSolidFloor = be.value("RequireSolidFloor", data_.BuildingExploit.RequireSolidFloor);
            data_.BuildingExploit.BlockGiantHatchframes = be.value("BlockGiantHatchframes", data_.BuildingExploit.BlockGiantHatchframes);
            data_.BuildingExploit.MinTurretDistance = be.value("MinTurretDistance", data_.BuildingExploit.MinTurretDistance);
            data_.BuildingExploit.TurretStackingEnabled = be.value("TurretStackingEnabled", data_.BuildingExploit.TurretStackingEnabled);
            data_.BuildingExploit.PlatformSaddlesEnabled = be.value("PlatformSaddlesEnabled", data_.BuildingExploit.PlatformSaddlesEnabled);

            if (be.contains("PlatformBlacklist") && be["PlatformBlacklist"].is_array())
            {
                data_.BuildingExploit.PlatformBlacklist.clear();
                for (const auto& item : be["PlatformBlacklist"])
                {
                    if (item.is_string())
                    {
                        data_.BuildingExploit.PlatformBlacklist.push_back(item.get<std::string>());
                    }
                }
            }

            if (be.contains("Messages") && be["Messages"].is_object())
            {
                const auto& msgs = be["Messages"];
                data_.BuildingExploit.MsgFloatingTurret = msgs.value("FloatingTurretBlocked", data_.BuildingExploit.MsgFloatingTurret);
                data_.BuildingExploit.MsgTurretStacking = msgs.value("TurretStackingBlocked", data_.BuildingExploit.MsgTurretStacking);
                data_.BuildingExploit.MsgPlatformExploit = msgs.value("PlatformExploitBlocked", data_.BuildingExploit.MsgPlatformExploit);
            }
        }

        // Speedhack
        if (j.contains("Speedhack") && j["Speedhack"].is_object())
        {
            const auto& sh = j["Speedhack"];
            data_.Speedhack.Enabled = sh.value("Enabled", data_.Speedhack.Enabled);
            data_.Speedhack.MaxHumanSpeed = sh.value("MaxHumanSpeed", data_.Speedhack.MaxHumanSpeed);
            data_.Speedhack.MaxDinoSpeed = sh.value("MaxDinoSpeed", data_.Speedhack.MaxDinoSpeed);
            data_.Speedhack.MaxTeleportDelta = sh.value("MaxTeleportDelta", data_.Speedhack.MaxTeleportDelta);
            data_.Speedhack.EnableRubberbanding = sh.value("EnableRubberbanding", data_.Speedhack.EnableRubberbanding);
            data_.Speedhack.MountedViolationsAccruePoints = sh.value("MountedViolationsAccruePoints", data_.Speedhack.MountedViolationsAccruePoints);
            data_.Speedhack.MsgSpeedhack = sh.value("MsgSpeedhack", data_.Speedhack.MsgSpeedhack);
            data_.Speedhack.MsgTeleport = sh.value("MsgTeleport", data_.Speedhack.MsgTeleport);
        }

        // RapidFire
        if (j.contains("RapidFire") && j["RapidFire"].is_object())
        {
            const auto& rf = j["RapidFire"];
            data_.RapidFire.Enabled = rf.value("Enabled", data_.RapidFire.Enabled);
            data_.RapidFire.TolerancePercent = rf.value("TolerancePercent", data_.RapidFire.TolerancePercent);
            data_.RapidFire.DefaultWeaponMinInterval = rf.value("DefaultWeaponMinInterval", data_.RapidFire.DefaultWeaponMinInterval);
            data_.RapidFire.MsgRapidFire = rf.value("MsgRapidFire", data_.RapidFire.MsgRapidFire);

            if (rf.contains("WeaponIntervalOverrides") && rf["WeaponIntervalOverrides"].is_object())
            {
                for (auto it = rf["WeaponIntervalOverrides"].begin(); it != rf["WeaponIntervalOverrides"].end(); ++it)
                {
                    if (it.value().is_number())
                    {
                        data_.RapidFire.WeaponIntervalOverrides[it.key()] = it.value().get<float>();
                    }
                }
            }
        }

        // MeleeReach
        if (j.contains("MeleeReach") && j["MeleeReach"].is_object())
        {
            const auto& mr = j["MeleeReach"];
            data_.MeleeReach.Enabled = mr.value("Enabled", data_.MeleeReach.Enabled);
            data_.MeleeReach.MaxHumanReach = mr.value("MaxHumanReach", data_.MeleeReach.MaxHumanReach);
            data_.MeleeReach.MaxPikeReach = mr.value("MaxPikeReach", data_.MeleeReach.MaxPikeReach);
            data_.MeleeReach.MsgMeleeReach = mr.value("MsgMeleeReach", data_.MeleeReach.MsgMeleeReach);
        }

        // Flyhack
        if (j.contains("Flyhack") && j["Flyhack"].is_object())
        {
            const auto& fh = j["Flyhack"];
            data_.Flyhack.Enabled = fh.value("Enabled", data_.Flyhack.Enabled);
            data_.Flyhack.StrictTekSuitValidation = fh.value("StrictTekSuitValidation", data_.Flyhack.StrictTekSuitValidation);
            data_.Flyhack.ForceGroundOnViolation = fh.value("ForceGroundOnViolation", data_.Flyhack.ForceGroundOnViolation);
            data_.Flyhack.MsgFlyhack = fh.value("MsgFlyhack", data_.Flyhack.MsgFlyhack);
        }

        // Undermesh
        if (j.contains("Undermesh") && j["Undermesh"].is_object())
        {
            const auto& um = j["Undermesh"];
            data_.Undermesh.Enabled = um.value("Enabled", data_.Undermesh.Enabled);
            data_.Undermesh.TheCenterWorldFloorZ = um.value("TheCenterWorldFloorZ", data_.Undermesh.TheCenterWorldFloorZ);
            data_.Undermesh.CheckInvertedTerrainNormals = um.value("CheckInvertedTerrainNormals", data_.Undermesh.CheckInvertedTerrainNormals);
            data_.Undermesh.Action = um.value("Action", data_.Undermesh.Action);
            data_.Undermesh.MsgUndermesh = um.value("MsgUndermesh", data_.Undermesh.MsgUndermesh);

            if (um.contains("SafeSurfaceCoords") && um["SafeSurfaceCoords"].is_array() && um["SafeSurfaceCoords"].size() >= 3)
            {
                data_.Undermesh.SafeSurfaceCoords.X = um["SafeSurfaceCoords"][0].get<float>();
                data_.Undermesh.SafeSurfaceCoords.Y = um["SafeSurfaceCoords"][1].get<float>();
                data_.Undermesh.SafeSurfaceCoords.Z = um["SafeSurfaceCoords"][2].get<float>();
            }
        }

        // ViolationManager
        if (j.contains("ViolationManager") && j["ViolationManager"].is_object())
        {
            const auto& vm = j["ViolationManager"];
            data_.ViolationManager.KickThresholdPoints = vm.value("KickThresholdPoints", data_.ViolationManager.KickThresholdPoints);
            data_.ViolationManager.DecayIntervalSeconds = vm.value("DecayIntervalSeconds", data_.ViolationManager.DecayIntervalSeconds);
            data_.ViolationManager.DecayAmount = vm.value("DecayAmount", data_.ViolationManager.DecayAmount);
            data_.ViolationManager.PointsSpeedhack = vm.value("PointsSpeedhack", data_.ViolationManager.PointsSpeedhack);
            data_.ViolationManager.PointsTeleport = vm.value("PointsTeleport", data_.ViolationManager.PointsTeleport);
            data_.ViolationManager.PointsRapidFire = vm.value("PointsRapidFire", data_.ViolationManager.PointsRapidFire);
            data_.ViolationManager.PointsMeleeReach = vm.value("PointsMeleeReach", data_.ViolationManager.PointsMeleeReach);
            data_.ViolationManager.PointsFlyhack = vm.value("PointsFlyhack", data_.ViolationManager.PointsFlyhack);
            data_.ViolationManager.PointsUndermesh = vm.value("PointsUndermesh", data_.ViolationManager.PointsUndermesh);
            data_.ViolationManager.PointsBuildingExploit = vm.value("PointsBuildingExploit", data_.ViolationManager.PointsBuildingExploit);
            data_.ViolationManager.KickReason = vm.value("KickReason", data_.ViolationManager.KickReason);
        }

        // Observability
        if (j.contains("Observability") && j["Observability"].is_object())
        {
            const auto& obs = j["Observability"];
            data_.Observability.DiscordWebhookEnabled = obs.value("DiscordWebhookEnabled", data_.Observability.DiscordWebhookEnabled);
            data_.Observability.DiscordWebhookUrl = obs.value("DiscordWebhookUrl", data_.Observability.DiscordWebhookUrl);
            data_.Observability.LogViolationsToFile = obs.value("LogViolationsToFile", data_.Observability.LogViolationsToFile);
            data_.Observability.LogFilePath = obs.value("LogFilePath", data_.Observability.LogFilePath);
        }

        SecurityLogger::Get().Info("[Config] Successfully loaded configuration from: " + filePath);
        return true;
    }
    catch (const std::exception& e)
    {
        SecurityLogger::Get().Error(std::string("[Config] Exception while parsing JSON: ") + e.what());
        return false;
    }
}

bool Config::Reload()
{
    std::string path;
    {
        std::shared_lock<SimpleSharedMutex> lock(mutex_);
        path = filePath_;
    }

    if (path.empty())
    {
        return false;
    }

    return Load(path);
}

std::string Config::GetFilePath() const
{
    std::shared_lock<SimpleSharedMutex> lock(mutex_);
    return filePath_;
}
