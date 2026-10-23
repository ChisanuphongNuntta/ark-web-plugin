#pragma once

#include "IrisDefender.h"

class SecurityLogger
{
public:
    static SecurityLogger& Get()
    {
        static SecurityLogger instance;
        return instance;
    }

    void Init(const std::string& logFilePath);
    void LogViolation(uint64 steamId, int tribeId, const FVector& coords, const std::string& violationType, const std::string& message);
    void Info(const std::string& message);
    void Warn(const std::string& message);
    void Error(const std::string& message);

private:
    SecurityLogger() = default;
    ~SecurityLogger() = default;
    SecurityLogger(const SecurityLogger&) = delete;
    SecurityLogger& operator=(const SecurityLogger&) = delete;

    SimpleMutex fileMutex_;
    std::string filePath_;
    std::string GetCurrentTimestamp() const;
};
