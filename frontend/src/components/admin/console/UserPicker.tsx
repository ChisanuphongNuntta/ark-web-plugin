'use client';

/**
 * Admin user picker: search GET /admin/users (server_admin | root) or, for an admin who
 * cannot list users (403), type the user id directly. Shared by /admin/vip and /admin/perks.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminButton, adminInputClass } from '@/components/admin';
import { VipAvatar } from '@/components/vip/VipAvatar';
import { adminApi } from '@/lib/api';
import { httpStatus } from '@/lib/adminConsoleApi';

export interface PickedUser {
  id: string;
  name: string | null;
  steamId: string | null;
}

export function UserPicker({ value, onChange }: { value: PickedUser | null; onChange: (u: PickedUser | null) => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [manualId, setManualId] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useQuery({
    queryKey: ['admin-user-search', debounced],
    enabled: debounced.length >= 2,
    retry: false,
    staleTime: 30_000,
    queryFn: ({ signal }) => adminApi.getUsersPage({ page: 1, pageSize: 10, search: debounced }, signal),
  });
  // GET /admin/users is server_admin|root: an admin falls back to typing the user id.
  const forbidden = results.isError && httpStatus(results.error) === 403;

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-iris-cyan/25 bg-iris-cyan/[0.05] px-3 py-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-iris-pearl">{value.name ?? value.id}</span>
          <span className="block truncate font-mono text-xs text-iris-muted">{value.steamId ?? value.id}</span>
        </span>
        <AdminButton size="sm" variant="ghost" onClick={() => onChange(null)}>
          เปลี่ยน
        </AdminButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!forbidden ? (
        <>
          <input
            className={adminInputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ Discord หรือ Steam ID (อย่างน้อย 2 ตัวอักษร)"
            aria-label="ค้นหาผู้เล่น"
          />
          {results.isFetching && <p className="text-xs text-iris-muted">กำลังค้นหา…</p>}
          {results.data && results.data.items.length === 0 && <p className="text-xs text-iris-muted">ไม่พบผู้เล่น</p>}
          {results.data && results.data.items.length > 0 && (
            <ul className="max-h-56 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/[0.08]">
              {results.data.items.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.05]"
                    onClick={() => onChange({ id: u.id, name: u.discordUsername, steamId: u.steamId })}
                  >
                    <VipAvatar size={28} src={u.discordAvatar} name={u.discordUsername} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-iris-pearl">{u.discordUsername ?? u.discordId}</span>
                      <span className="block truncate font-mono text-xs text-iris-muted">{u.steamId ?? 'ยังไม่เชื่อม Steam'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-xs text-iris-muted">บัญชีนี้ค้นหาผู้ใช้ไม่ได้ (เฉพาะผู้ดูแลเซิร์ฟเวอร์/Root) กรอก User ID แทน</p>
      )}
      <div className="flex gap-2">
        <input
          className={adminInputClass}
          value={manualId}
          onChange={(e) => setManualId(e.target.value.trim())}
          placeholder="หรือกรอก User ID โดยตรง"
          aria-label="User ID"
          maxLength={64}
        />
        <AdminButton size="sm" variant="secondary" disabled={!manualId} onClick={() => onChange({ id: manualId, name: null, steamId: null })}>
          ใช้ ID นี้
        </AdminButton>
      </div>
    </div>
  );
}
