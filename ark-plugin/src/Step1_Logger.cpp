// STEP 1: Add Logger only
#include <Windows.h>
#include <Logger/Logger.h>

// ARK API Plugin Entry Points
extern "C" __declspec(dllexport) void __fastcall Plugin_Init()
{
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
