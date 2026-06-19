// BARE MINIMUM PLUGIN - No dependencies at all, not even ARK API
#include <Windows.h>

// ARK API Plugin Entry Points - just empty functions
extern "C" __declspec(dllexport) void __fastcall Plugin_Init()
{
    // Do absolutely nothing
}

extern "C" __declspec(dllexport) void __fastcall Plugin_Unload()
{
    // Do absolutely nothing
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
