#pragma once

#include <functional>

namespace HeartShop::GameThreadDispatcher
{
    void Initialize();
    void Shutdown();
    bool Enqueue(std::function<void()> Task);
}
