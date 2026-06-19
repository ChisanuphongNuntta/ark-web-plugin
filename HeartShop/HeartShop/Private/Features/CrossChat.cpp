#include "CrossChat.h"
#include <ArkPermissions.h>

namespace HeartShop::Features::CrossChat
{
    // Globals
    std::string LastChatTimestamp = "";
    bool ChatEnabled = true;

    // Hook Declaration
    DECLARE_HOOK(AShooterGameMode_SendChatMessage, void, AShooterGameMode*, FString*, FString*, EChatSendMode::Type, bool, int, int);

    void Hook_AShooterGameMode_SendChatMessage(AShooterGameMode* _this, FString* Sender, FString* Message, EChatSendMode::Type Mode, bool bAdmin, int SenderSteamID, int SendingTribeID)
    {
        AShooterGameMode_SendChatMessage_original(_this, Sender, Message, Mode, bAdmin, SenderSteamID, SendingTribeID);

        if (!ChatEnabled || !HeartShop::Http) return;
        if (Mode != EChatSendMode::GlobalChat) return;

        std::string SenderName = Sender ? Sender->ToString() : "Unknown";
        std::string Content = Message ? Message->ToString() : "";

        if (Content.empty() || Content[0] == '/') return;

        uint64 SteamId64 = static_cast<uint64>(SenderSteamID);
        
        // Use Permissions Direct Linkage
        TArray<FString> PermGroups = Permissions::GetPlayerGroups(SteamId64);
        std::vector<std::string> Groups;
        for (int i = 0; i < PermGroups.Num(); i++)
        {
            Groups.push_back(PermGroups[i].ToString());
        }

        std::string SteamIdStr = std::to_string(SenderSteamID);
        HeartShop::Http->SendChatMessage(SteamIdStr, SenderName, Content, Groups, [](bool Success, const nlohmann::json&) {});
    }

    void Init()
    {
        Log::GetLog()->info("HeartShop: Initializing CrossChat...");

        ArkApi::GetHooks().SetHook("AShooterGameMode.SendChatMessage", &Hook_AShooterGameMode_SendChatMessage, &AShooterGameMode_SendChatMessage_original);

        ArkApi::GetCommands().AddOnTimerCallback(
            L"HeartShop_PollChat",
            []() {
                static int chatCounter = 0;
                chatCounter++;
                if (chatCounter >= 3)
                {
                    chatCounter = 0;
                    PollChatMessages();
                }
            }
        );

        Log::GetLog()->info("HeartShop: CrossChat initialized");
    }

    void Unload()
    {
        ArkApi::GetHooks().DisableHook("AShooterGameMode.SendChatMessage", &Hook_AShooterGameMode_SendChatMessage);
        ArkApi::GetCommands().RemoveOnTimerCallback(L"HeartShop_PollChat");
    }

    void PollChatMessages()
    {
        if (!HeartShop::Http) return;

        HeartShop::Http->GetChatMessages(LastChatTimestamp, [](bool Success, const nlohmann::json& Response) {
            if (!Success) return;

            try
            {
                if (!Response.is_object() || !Response.contains("messages")) return;

                auto Messages = Response["messages"];
                for (const auto& Msg : Messages)
                {
                    if (!Msg.is_object()) continue;

                    std::string Source = Msg.value("source", "");
                    std::string SenderName = Msg.value("senderName", "Unknown");
                    std::string Content = Msg.value("content", "");

                    if (!Content.empty())
                    {
                        std::string SourceTag = (Source == "web") ? "[Web]" : (Source == "discord") ? "[Discord]" : "[" + Source + "]";
                        std::string FullMessage = SourceTag + " " + SenderName + ": " + Content;

                        FString MessageFS = FString(ArkApi::Tools::Utf8Decode(FullMessage).c_str());
                        FString SenderFS = FString(ArkApi::Tools::Utf8Decode("CrossChat").c_str());

                        auto& Players = ArkApi::GetApiUtils().GetWorld()->PlayerControllerListField();
                        for (int i = 0; i < Players.Num(); i++)
                        {
                            AShooterPlayerController* PC = static_cast<AShooterPlayerController*>(Players[i].Get());
                            if (PC)
                            {
                                ArkApi::GetApiUtils().SendChatMessage(PC, *SenderFS, *MessageFS);
                            }
                        }
                    }
                }

                if (Response.contains("lastTimestamp") && !Response["lastTimestamp"].is_null())
                {
                    LastChatTimestamp = Response["lastTimestamp"].get<std::string>();
                }
            }
            catch (...) {}
        });
    }
}
