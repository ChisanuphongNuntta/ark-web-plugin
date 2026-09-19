#pragma once

#include <chrono>
#include <cstddef>
#include <mutex>
#include <string>

namespace HeartShop
{
    class RequestPolicy
    {
    public:
        struct Config
        {
            std::size_t MaxConcurrent{8};
            int FailureThreshold{5};
            std::chrono::milliseconds OpenDuration{30000};
            int MaxReadRetries{2};
            std::chrono::milliseconds InitialBackoff{250};
            std::chrono::milliseconds MaxBackoff{2000};
        };

        enum class Admission { Accepted, ConcurrencyLimit, CircuitOpen };
        enum class CircuitState { Closed, Open, HalfOpen };

        explicit RequestPolicy(Config PolicyConfig = {});

        Admission TryAcquire(std::chrono::steady_clock::time_point Now);
        void Release();
        void RecordResult(bool Success, bool TransientFailure,
                          std::chrono::steady_clock::time_point Now);

        bool ShouldRetry(const std::string& Method, int CompletedAttempt,
                         bool TransportFailure, int HttpStatus) const;
        std::chrono::milliseconds BackoffFor(int CompletedAttempt) const;
        CircuitState State(std::chrono::steady_clock::time_point Now) const;
        std::size_t ActiveRequests() const;

        static bool IsReadOnlyMethod(const std::string& Method);
        static bool IsTransientHttpStatus(int HttpStatus);

    private:
        Config m_Config;
        mutable std::mutex m_Mutex;
        std::size_t m_ActiveRequests{0};
        int m_ConsecutiveFailures{0};
        CircuitState m_State{CircuitState::Closed};
        std::chrono::steady_clock::time_point m_OpenedAt{};
        bool m_HalfOpenProbeActive{false};
    };
}
