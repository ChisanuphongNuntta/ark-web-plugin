#include "Logger.h"
#include <cstdio>
#include <ctime>
#include <iostream>

static void WriteToFile(const std::string& filePath, const std::string& line)
{
    if (filePath.empty()) return;
    FILE* fp = nullptr;
    if (fopen_s(&fp, filePath.c_str(), "a") == 0 && fp)
    {
        fputs(line.c_str(), fp);
        fclose(fp);
    }
}

void SecurityLogger::Init(const std::string& logFilePath)
{
    std::lock_guard<SimpleMutex> lock(fileMutex_);
    filePath_ = logFilePath;

    std::string::size_type pos = filePath_.find_last_of("\\/");
    if (pos != std::string::npos)
    {
        std::string dir = filePath_.substr(0, pos);
        CreateDirectoryA(dir.c_str(), NULL);
    }
}

std::string SecurityLogger::GetCurrentTimestamp() const
{
    auto now = std::chrono::system_clock::now();
    std::time_t now_c = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc;
#if defined(_WIN32)
    gmtime_s(&tm_utc, &now_c);
#else
    gmtime_r(&now_c, &tm_utc);
#endif

    char buf[64];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d UTC",
        tm_utc.tm_year + 1900, tm_utc.tm_mon + 1, tm_utc.tm_mday,
        tm_utc.tm_hour, tm_utc.tm_min, tm_utc.tm_sec);
    return std::string(buf);
}

void SecurityLogger::LogViolation(
    uint64 steamId,
    int tribeId,
    const FVector& coords,
    const std::string& violationType,
    const std::string& message)
{
    std::string timestamp = GetCurrentTimestamp();
    std::ostringstream ss;
    ss << "[" << timestamp << "] [VIOLATION] [SteamID: " << steamId
       << "] [Tribe: " << tribeId
       << "] [Coords: " << static_cast<int>(coords.X) << ", " << static_cast<int>(coords.Y) << ", " << static_cast<int>(coords.Z) << "] "
       << "[" << violationType << "] " << message << "\n";

    std::string logLine = ss.str();

    {
        std::lock_guard<SimpleMutex> lock(fileMutex_);
        WriteToFile(filePath_, logLine);
    }

    OutputDebugStringA(logLine.c_str());
    std::cout << logLine << std::flush;
}

void SecurityLogger::Info(const std::string& message)
{
    std::string timestamp = GetCurrentTimestamp();
    std::string logLine = "[" + timestamp + "] [INFO] " + message + "\n";

    {
        std::lock_guard<SimpleMutex> lock(fileMutex_);
        WriteToFile(filePath_, logLine);
    }

    OutputDebugStringA(logLine.c_str());
    std::cout << logLine << std::flush;
}

void SecurityLogger::Warn(const std::string& message)
{
    std::string timestamp = GetCurrentTimestamp();
    std::string logLine = "[" + timestamp + "] [WARN] " + message + "\n";

    {
        std::lock_guard<SimpleMutex> lock(fileMutex_);
        WriteToFile(filePath_, logLine);
    }

    OutputDebugStringA(logLine.c_str());
    std::cout << logLine << std::flush;
}

void SecurityLogger::Error(const std::string& message)
{
    std::string timestamp = GetCurrentTimestamp();
    std::string logLine = "[" + timestamp + "] [ERROR] " + message + "\n";

    {
        std::lock_guard<SimpleMutex> lock(fileMutex_);
        WriteToFile(filePath_, logLine);
    }

    OutputDebugStringA(logLine.c_str());
    std::cerr << logLine << std::flush;
}
