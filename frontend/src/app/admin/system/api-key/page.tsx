'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { userApi } from '@/lib/api';
import { Loader2, Key, Shield } from 'lucide-react';
import Link from 'next/link';
import LaserCard from '@/components/LaserCard';
import ApiKeyManager from '@/components/ApiKeyManager';

export default function SystemApiKeyPage() {
    const { user, isLoading: authLoading } = useAuthStore();
    const { isRoot } = usePermissions();

    const { data: userProfileData, isLoading } = useQuery({
        queryKey: ['user-profile'],
        queryFn: () => userApi.getUserProfile().then((res) => res.data),
        enabled: !!user && isRoot,
    });

    if (authLoading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
                </div>
            </div>
        );
    }

    if (!isRoot) {
        return (
            <LaserCard className="border-red-500/30">
                <div className="text-center py-12">
                    <p className="text-red-400">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
                    <p className="text-gray-500 text-sm mt-2">เฉพาะ Root Only เท่านั้น</p>
                </div>
            </LaserCard>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
                        &larr; กลับ Admin
                    </Link>
                    <h1 className="text-3xl font-bold mt-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
                        <Shield className="h-8 w-8 text-emerald-400" />
                        System API Key
                    </h1>
                    <p className="text-gray-400 mt-1">จัดการ API Key สำหรับเชื่อมต่อเซิร์ฟเวอร์ (Root Only)</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                </div>
            ) : (
                <ApiKeyManager
                    apiKey={userProfileData?.user?.apiKey}
                    apiKeyIp={userProfileData?.user?.apiKeyIp}
                    apiKeyCreatedAt={userProfileData?.user?.apiKeyCreatedAt}
                    apiKeyServerName={userProfileData?.user?.apiKeyServerName}
                    apiKeyServerMap={userProfileData?.user?.apiKeyServerMap}
                    apiKeyLastUsed={userProfileData?.user?.apiKeyLastUsed}
                    userId={userProfileData?.user?.id}
                />
            )}
        </div>
    );
}
