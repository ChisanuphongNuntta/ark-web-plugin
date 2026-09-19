#include "RequestPolicy.h"

#include <chrono>
#include <cstdlib>
#include <iostream>

namespace
{
    void Check(bool Value, const char* Message)
    {
        if (!Value) { std::cerr << Message << '\n'; std::exit(1); }
    }
}

int main()
{
    using namespace HeartShop;
    using namespace std::chrono;
    const auto T0 = steady_clock::time_point{};
    RequestPolicy::Config Config;
    Config.MaxConcurrent = 2;
    Config.FailureThreshold = 2;
    Config.OpenDuration = seconds(10);
    Config.MaxReadRetries = 2;
    RequestPolicy Policy(Config);

    Check(Policy.TryAcquire(T0) == RequestPolicy::Admission::Accepted, "first admission");
    Check(Policy.TryAcquire(T0) == RequestPolicy::Admission::Accepted, "second admission");
    Check(Policy.TryAcquire(T0) == RequestPolicy::Admission::ConcurrencyLimit, "bounded concurrency");
    Policy.Release(); Policy.Release();

    Check(Policy.ShouldRetry("GET", 0, true, 0), "GET transport retry");
    Check(Policy.ShouldRetry("GET", 1, false, 503), "GET 503 retry");
    Check(!Policy.ShouldRetry("GET", 2, true, 0), "retry bound");
    Check(!Policy.ShouldRetry("POST", 0, true, 0), "never retry mutating request");
    Check(!Policy.ShouldRetry("GET", 0, false, 404), "never retry permanent response");
    Check(Policy.BackoffFor(0) == milliseconds(250), "first backoff");
    Check(Policy.BackoffFor(1) == milliseconds(500), "second backoff");

    Policy.RecordResult(false, true, T0);
    Policy.RecordResult(false, true, T0);
    Check(Policy.TryAcquire(T0) == RequestPolicy::Admission::CircuitOpen, "circuit opens");
    Check(Policy.TryAcquire(T0 + seconds(11)) == RequestPolicy::Admission::Accepted, "half-open probe");
    Check(Policy.TryAcquire(T0 + seconds(11)) == RequestPolicy::Admission::CircuitOpen, "one probe only");
    Policy.RecordResult(true, false, T0 + seconds(11));
    Policy.Release();
    Check(Policy.TryAcquire(T0 + seconds(11)) == RequestPolicy::Admission::Accepted, "success closes circuit");
    Policy.Release();

    std::cout << "RequestPolicy tests passed\n";
}
