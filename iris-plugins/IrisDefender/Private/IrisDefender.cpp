#include "IrisDefender.h"
#include "Config.h"
#include "Logger.h"
#include "ViolationManager.h"
#include "ExploitDefense.h"
#include "AntiCheat.h"

static void Chat_Reload(AShooterPlayerController* pc, FString* message, EChatSendMode::Type mode)
{
    (void)message;
    (void)mode;
    if (!pc) return;

    if (!pc->bIsAdmin()())
    {
        ArkApi::GetApiUtils().SendNotification(
            pc,
            FLinearColor(1.0f, 0.2f, 0.2f, 1.0f),
            1.2f,
            4.0f,
            nullptr,
            "{}",
            "[IrisDefender] Access denied: Server admin privileges required."
        );
        return;
    }

    bool success = Config::Get().Reload();
    if (success)
    {
        SecurityLogger::Get().Info("[Commands] Config reloaded via chat by: " + ArkApi::GetApiUtils().GetSteamName(pc).ToString());
        ArkApi::GetApiUtils().SendNotification(
            pc,
            FLinearColor(0.2f, 1.0f, 0.2f, 1.0f),
            1.3f,
            5.0f,
            nullptr,
            "{}",
            "[IrisDefender] Configuration reloaded successfully."
        );
    }
    else
    {
        ArkApi::GetApiUtils().SendNotification(
            pc,
            FLinearColor(1.0f, 0.2f, 0.2f, 1.0f),
            1.3f,
            5.0f,
            nullptr,
            "{}",
            "[IrisDefender] Failed to reload configuration."
        );
    }
}

static void Console_Reload(APlayerController* pc, FString* cmd, bool is_admin)
{
    (void)pc;
    (void)cmd;
    if (is_admin)
    {
        Config::Get().Reload();
        SecurityLogger::Get().Info("[Commands] Config reloaded via Console Command.");
    }
}

static void Rcon_Reload(RCONClientConnection* rcon_connection, RCONPacket* rcon_packet, UWorld* world)
{
    (void)world;
    bool success = Config::Get().Reload();
    FString reply = success ? "IrisDefender: Configuration reloaded successfully.\n" : "IrisDefender: Failed to reload configuration.\n";
    rcon_connection->SendMessageW(rcon_packet->Id, 0, &reply);
    SecurityLogger::Get().Info("[Commands] Config reloaded via RCON.");
}

static bool g_initialized = false;

static void InitPlugin()
{
    if (g_initialized) return;
    g_initialized = true;

    try
    {
        char buffer[MAX_PATH];
        GetModuleFileNameA(nullptr, buffer, MAX_PATH);
        std::string exePath(buffer);
        std::string::size_type pos = exePath.find_last_of("\\/");
        std::string baseDir = (pos != std::string::npos) ? exePath.substr(0, pos) : ".";
        std::string defaultLogPath = baseDir + "/logs/IrisDefender.log";
        SecurityLogger::Get().Init(defaultLogPath);
        SecurityLogger::Get().Info("[IrisDefender] Enterprise Security Plugin initializing...");

        std::string configPath = baseDir + "/ArkApi/Plugins/IrisDefender/config.json";
        Config::Get().Load(configPath);

        std::string logPath = baseDir + "/" + Config::Get().GetObservability().LogFilePath;
        SecurityLogger::Get().Init(logPath);
        SecurityLogger::Get().Info("[IrisDefender] Configuration loaded. Setting up commands and hooks...");

        ArkApi::GetCommands().AddChatCommand("/id.reload", &Chat_Reload);
        ArkApi::GetCommands().AddChatCommand("/iris.reload", &Chat_Reload);
        ArkApi::GetCommands().AddConsoleCommand("IrisDefender.Reload", &Console_Reload);
        ArkApi::GetCommands().AddRconCommand("IrisDefender.Reload", &Rcon_Reload);

        ExploitDefense::Init();
        AntiCheat::Init();

        SecurityLogger::Get().Info("[IrisDefender] Enterprise Security Plugin fully loaded.");
    }
    catch (const std::exception& ex)
    {
        SecurityLogger::Get().Error(std::string("[IrisDefender] Fatal initialization exception: ") + ex.what());
    }
    catch (...)
    {
        SecurityLogger::Get().Error("[IrisDefender] Unknown fatal initialization exception caught.");
    }
}

extern "C" __declspec(dllexport) void Plugin_Init()
{
    InitPlugin();
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    (void)hModule;
    (void)ul_reason_for_call;
    (void)lpReserved;
    return TRUE;
}

extern "C" __declspec(dllexport) void Plugin_Unload()
{
    SecurityLogger::Get().Info("[IrisDefender] Plugin unloading...");

    AntiCheat::Unload();
    ExploitDefense::Unload();

    ArkApi::GetCommands().RemoveChatCommand("/id.reload");
    ArkApi::GetCommands().RemoveChatCommand("/iris.reload");
    ArkApi::GetCommands().RemoveConsoleCommand("IrisDefender.Reload");
    ArkApi::GetCommands().RemoveRconCommand("IrisDefender.Reload");

    ViolationManager::Get().Clear();

    SecurityLogger::Get().Info("[IrisDefender] Plugin unloaded successfully.");
}
