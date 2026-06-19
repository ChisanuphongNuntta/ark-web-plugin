// MINIMAL TEST PLUGIN - No dependencies except ARK API
#include <API/ARK/Ark.h>
#include <Logger/Logger.h>
#include <Windows.h>

// ARK API Plugin Entry Points
extern "C" __declspec(dllexport) void __fastcall Plugin_Init()
{
    Log::GetLog()->info("MinimalTest Plugin loaded!");
}

extern "C" __declspec(dllexport) void __fastcall Plugin_Unload()
{
    Log::GetLog()->info("MinimalTest Plugin unloaded!");
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    switch (ul_reason_for_call)
    {
    case DLL_PROCESS_ATTACH:
        DisableThreadLibraryCalls(hModule);
        break;
    case DLL_PROCESS_DETACH:
        break;
    }
    return TRUE;
}
