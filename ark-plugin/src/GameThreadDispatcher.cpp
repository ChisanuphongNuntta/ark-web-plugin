#include "GameThreadDispatcher.h"

#include <API/ARK/Ark.h>
#include <Logger/Logger.h>
#include <atomic>
#include <deque>
#include <mutex>

namespace HeartShop::GameThreadDispatcher
{
    namespace
    {
        std::atomic<bool> AcceptingTasks{false};
        std::mutex QueueMutex;
        std::deque<std::function<void()>> Queue;

        void Drain(float)
        {
            std::deque<std::function<void()>> Pending;
            {
                std::lock_guard<std::mutex> Lock(QueueMutex);
                Pending.swap(Queue);
            }

            for (auto& Task : Pending)
            {
                try
                {
                    Task();
                }
                catch (const std::exception& Error)
                {
                    Log::GetLog()->error("Game-thread task failed: {}", Error.what());
                }
                catch (...)
                {
                    Log::GetLog()->error("Game-thread task failed with an unknown exception");
                }
            }
        }
    }

    void Initialize()
    {
        AcceptingTasks.store(true);
        ArkApi::GetCommands().AddOnTickCallback(
            L"HeartShop_GameThreadDispatcher",
            &Drain);
        Log::GetLog()->info("HeartShop game-thread dispatcher initialized");
    }

    void Shutdown()
    {
        AcceptingTasks.store(false);
        ArkApi::GetCommands().RemoveOnTickCallback(L"HeartShop_GameThreadDispatcher");

        std::lock_guard<std::mutex> Lock(QueueMutex);
        Queue.clear();
    }

    bool Enqueue(std::function<void()> Task)
    {
        if (!Task || !AcceptingTasks.load())
        {
            return false;
        }

        std::lock_guard<std::mutex> Lock(QueueMutex);
        if (!AcceptingTasks.load())
        {
            return false;
        }

        Queue.push_back(std::move(Task));
        return true;
    }
}
