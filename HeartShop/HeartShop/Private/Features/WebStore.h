#pragma once

#include "../../HeartShop.h"

namespace HeartShop::Features::WebStore
{
    void Init();
    void Unload();

    void PollPendingOrders();
}
