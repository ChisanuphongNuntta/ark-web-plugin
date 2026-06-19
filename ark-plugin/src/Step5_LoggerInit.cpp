// STEP 5: Use Logger properly with Init()
#include <Windows.h>
#include <Logger/Logger.h>

// ARK API Plugin Entry Points
extern "C" __declspec(dllexport) void __fastcall Plugin_Init()
{
    // MUST call Init() first before using GetLog()!
    Log::Get().Init("HeartShop");
    Log::GetLog()->info("HeartShop v1.0.0 - Plugin loaded!");
}

extern "C" __declspec(dllexport) void __fastcall Plugin_Unload()
{
    Log::GetLog()->info("HeartShop - Plugin unloaded!");
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    switch (ul_reason_for_call)
    {
    case DLL_PROCESS_ATTACH:
        DisableThreadLibraryCalls(hModule);
        break;
    }
    return TRUE;
}
