#include "RequestPolicy.h"

#include <algorithm>
#include <cctype>

namespace HeartShop
{
    RequestPolicy::RequestPolicy(Config PolicyConfig)
        : m_Config(PolicyConfig)
    {
        if (m_Config.MaxConcurrent == 0) m_Config.MaxConcurrent = 1;
        if (m_Config.FailureThreshold < 1) m_Config.FailureThreshold = 1;
        if (m_Config.MaxReadRetries < 0) m_Config.MaxReadRetries = 0;
    }

    RequestPolicy::Admission RequestPolicy::TryAcquire(
        std::chrono::steady_clock::time_point Now)
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        if (m_State == CircuitState::Open)
        {
            if (Now - m_OpenedAt < m_Config.OpenDuration)
                return Admission::CircuitOpen;
            m_State = CircuitState::HalfOpen;
        }
        if (m_State == CircuitState::HalfOpen && m_HalfOpenProbeActive)
            return Admission::CircuitOpen;
        if (m_ActiveRequests >= m_Config.MaxConcurrent)
            return Admission::ConcurrencyLimit;

        ++m_ActiveRequests;
        if (m_State == CircuitState::HalfOpen) m_HalfOpenProbeActive = true;
        return Admission::Accepted;
    }

    void RequestPolicy::Release()
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        if (m_ActiveRequests > 0) --m_ActiveRequests;
    }

    void RequestPolicy::RecordResult(bool Success, bool TransientFailure,
                                     std::chrono::steady_clock::time_point Now)
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        if (Success)
        {
            m_ConsecutiveFailures = 0;
            m_State = CircuitState::Closed;
            m_HalfOpenProbeActive = false;
            return;
        }
        if (!TransientFailure)
        {
            if (m_State == CircuitState::HalfOpen)
            {
                m_State = CircuitState::Closed;
                m_HalfOpenProbeActive = false;
            }
            return;
        }

        ++m_ConsecutiveFailures;
        if (m_State == CircuitState::HalfOpen ||
            m_ConsecutiveFailures >= m_Config.FailureThreshold)
        {
            m_State = CircuitState::Open;
            m_OpenedAt = Now;
            m_HalfOpenProbeActive = false;
        }
    }

    bool RequestPolicy::ShouldRetry(const std::string& Method, int CompletedAttempt,
                                    bool TransportFailure, int HttpStatus) const
    {
        return IsReadOnlyMethod(Method) && CompletedAttempt < m_Config.MaxReadRetries &&
               (TransportFailure || IsTransientHttpStatus(HttpStatus));
    }

    std::chrono::milliseconds RequestPolicy::BackoffFor(int CompletedAttempt) const
    {
        const int Shift = std::min(std::max(CompletedAttempt, 0), 20);
        const auto Delay = m_Config.InitialBackoff * (1LL << Shift);
        return std::min(Delay, m_Config.MaxBackoff);
    }

    RequestPolicy::CircuitState RequestPolicy::State(
        std::chrono::steady_clock::time_point Now) const
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        if (m_State == CircuitState::Open && Now - m_OpenedAt >= m_Config.OpenDuration)
            return CircuitState::HalfOpen;
        return m_State;
    }

    std::size_t RequestPolicy::ActiveRequests() const
    {
        std::lock_guard<std::mutex> Lock(m_Mutex);
        return m_ActiveRequests;
    }

    bool RequestPolicy::IsReadOnlyMethod(const std::string& Method)
    {
        std::string Upper = Method;
        std::transform(Upper.begin(), Upper.end(), Upper.begin(),
                       [](unsigned char C) { return static_cast<char>(std::toupper(C)); });
        return Upper == "GET" || Upper == "HEAD";
    }

    bool RequestPolicy::IsTransientHttpStatus(int HttpStatus)
    {
        return HttpStatus == 408 || HttpStatus == 425 || HttpStatus == 429 ||
               (HttpStatus >= 500 && HttpStatus <= 599);
    }
}
