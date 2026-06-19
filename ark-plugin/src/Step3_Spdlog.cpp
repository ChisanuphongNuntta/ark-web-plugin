// STEP 3: Include spdlog (the logging library)
#include <Windows.h>
#include <API/Base.h>
#include <Logger/spdlog/spdlog.h>

// ARK API Plugin Entry Points
extern "C" __declspec(dllexport) void __fastcall Plugin_Init()
{
    OutputDebugStringA("HeartShop: Plugin_Init called!\n");
}

extern "C" __declspec(dllexport) void __fastcall Plugin_Unload()
{
    OutputDebugStringA("HeartShop: Plugin_Unload called!\n");
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
