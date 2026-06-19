'use client';

import { ReactNode, useEffect, useState } from 'react';
import { X, AlertTriangle, Info, CheckCircle, Loader2 } from 'lucide-react';
import LaserButton from './LaserButton';

interface LaserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title: string;
    children: ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    loading?: boolean;
    singleButton?: boolean;
}

export default function LaserModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    children,
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
    variant = 'default',
    loading = false,
    singleButton = false,
}: LaserModalProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            document.body.style.overflow = 'unset';
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={loading ? undefined : onClose}
            />

            {/* Modal Container */}
            <div className={`relative w-full max-w-md transform transition-all duration-300 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
                {/* Glow Effects */}
                <div className={`absolute -inset-1 bg-gradient-to-r rounded-2xl blur-lg opacity-50 transition-all duration-500
          ${variant === 'danger' ? 'from-red-600 via-orange-600 to-red-600' :
                        variant === 'warning' ? 'from-amber-600 via-yellow-600 to-amber-600' :
                            variant === 'success' ? 'from-green-600 via-emerald-600 to-green-600' :
                                'from-cyan-600 via-emerald-600 to-cyan-600'
                    }`}
                />

                <div className="relative bg-[#0a0a0f]/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                    {/* Header Beam */}
                    <div className={`h-1 w-full bg-gradient-to-r
            ${variant === 'danger' ? 'from-transparent via-red-500 to-transparent' :
                            variant === 'warning' ? 'from-transparent via-amber-500 to-transparent' :
                                variant === 'success' ? 'from-transparent via-green-500 to-transparent' :
                                    'from-transparent via-cyan-500 to-transparent'
                        }`}
                    />

                    {/* Header */}
                    <div className="flex items-center justify-between p-6 pb-2">
                        <h3 className={`text-xl font-bold flex items-center gap-2
              ${variant === 'danger' ? 'text-red-400' :
                                variant === 'warning' ? 'text-amber-400' :
                                    variant === 'success' ? 'text-green-400' :
                                        'text-cyan-400'
                            }`}
                        >
                            {variant === 'danger' && <AlertTriangle className="h-6 w-6" />}
                            {variant === 'warning' && <AlertTriangle className="h-6 w-6" />}
                            {variant === 'success' && <CheckCircle className="h-6 w-6" />}
                            {variant === 'default' && <Info className="h-6 w-6" />}
                            {title}
                        </h3>
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="text-gray-500 hover:text-white transition-colors disabled:opacity-50"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 pt-2 text-gray-300">
                        {children}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 p-6 pt-0">
                        {!singleButton && (
                            <button
                                onClick={onClose}
                                disabled={loading}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
                            >
                                {cancelText}
                            </button>
                        )}
                        {onConfirm && (
                            <LaserButton
                                onClick={onConfirm}
                                loading={loading}
                                variant={variant === 'danger' ? 'primary' : variant === 'warning' ? 'gold' : 'secondary'}
                                className={variant === 'danger' ? '!from-red-600 !to-orange-600' : ''}
                            >
                                {confirmText}
                            </LaserButton>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
