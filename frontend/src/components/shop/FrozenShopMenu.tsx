'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { PalworldSidebar } from './PalworldSidebar';

export function FrozenShopMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  return (
    <dialog ref={ref} onCancel={onClose} onClose={onClose} aria-label="เมนูร้านค้า ARK IRIS" className="frozen-shop-dialog" onClick={event => { if(event.target === event.currentTarget) onClose(); }}>
      <div className="p-4">
        <div className="flex justify-end"><button type="button" onClick={onClose} aria-label="ปิดเมนูร้านค้า" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-white/10"><X size={20} /></button></div>
        <PalworldSidebar />
      </div>
    </dialog>
  );
}
