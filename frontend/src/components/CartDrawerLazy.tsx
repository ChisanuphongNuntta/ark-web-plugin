'use client';
import * as React from 'react';
import dynamic from 'next/dynamic';
import { useCartStore } from '@/lib/store';

// The drawer pulls in framer-motion, which most pages do not need on first load. Load it the first time
// the drawer opens and keep it mounted afterwards so the exit animation and focus return still run.
const CartDrawer = dynamic(() => import('@/components/CartDrawer').then((m) => m.CartDrawer), { ssr: false });

export function CartDrawerLazy() {
  const isOpen = useCartStore((s) => s.isDrawerOpen);
  const [everOpened, setEverOpened] = React.useState(false);
  React.useEffect(() => { if (isOpen) setEverOpened(true); }, [isOpen]);
  return everOpened || isOpen ? <CartDrawer /> : null;
}
