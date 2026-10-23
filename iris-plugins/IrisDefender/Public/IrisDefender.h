#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <chrono>
#include <mutex>
#include <shared_mutex>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <cstdint>

#include <API/ARK/Ark.h>
#include <json.hpp>

class SimpleMutex
{
public:
    SimpleMutex() { InitializeSRWLock(&srw_); }
    void lock() { AcquireSRWLockExclusive(&srw_); }
    void unlock() { ReleaseSRWLockExclusive(&srw_); }
    bool try_lock() { return TryAcquireSRWLockExclusive(&srw_) != 0; }
private:
    SRWLOCK srw_ = SRWLOCK_INIT;
};

class SimpleSharedMutex
{
public:
    SimpleSharedMutex() { InitializeSRWLock(&srw_); }
    void lock() { AcquireSRWLockExclusive(&srw_); }
    void unlock() { ReleaseSRWLockExclusive(&srw_); }
    void lock_shared() { AcquireSRWLockShared(&srw_); }
    void unlock_shared() { ReleaseSRWLockShared(&srw_); }
    bool try_lock() { return TryAcquireSRWLockExclusive(&srw_) != 0; }
    bool try_lock_shared() { return TryAcquireSRWLockShared(&srw_) != 0; }
private:
    SRWLOCK srw_ = SRWLOCK_INIT;
};

#define IRIS_DEFENDER_NAME "IrisDefender"
#define IRIS_DEFENDER_VERSION "1.0.0"
#define IRIS_DEFENDER_MIN_API_VERSION "3.54"

extern "C" __declspec(dllexport) void Plugin_Init();
extern "C" __declspec(dllexport) void Plugin_Unload();
