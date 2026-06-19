#pragma once

#include "../../HeartShop.h"

namespace HeartShop::Features::CrossChat
{
    void Init();
    void Unload();

    void PollChatMessages();
}
