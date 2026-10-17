'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu as MenuIcon } from 'lucide-react';
import { Badge, Breadcrumbs, Drawer, IconButton } from '@/components/ui';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ROLE_LABEL, adminBreadcrumbs, isNavItemActive, navForRole } from './nav';

/**
 * Admin console chrome: grouped left rail on desktop (lg+), a left drawer on
 * smaller screens, and a top bar with breadcrumbs, environment and role.
 * Pages render their own <PageHeader> inside.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const [navOpen, setNavOpen] = React.useState(false);

  return (
    <div className="flex w-full">
      <aside className="hidden w-60 shrink-0 border-r border-line lg:block" aria-label="เมนูคอนโซลผู้ดูแล">
        <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto px-3 pb-10 pt-6">
          <AdminNav pathname={pathname} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <AdminTopBar pathname={pathname} onOpenNav={() => setNavOpen(true)} />
        <div className="mx-auto w-full max-w-content px-4 pb-16 sm:px-6 lg:px-8">{children}</div>
      </div>

      <Drawer open={navOpen} onOpenChange={setNavOpen} side="left" size="sm" title="คอนโซลผู้ดูแล">
        <div className="px-3 py-4">
          <AdminNav pathname={pathname} onNavigate={() => setNavOpen(false)} />
        </div>
      </Drawer>
    </div>
  );
}

function AdminNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const role = useAuthStore((s) => s.user?.role);
  const groups = navForRole(role);
  return (
    <nav aria-label="คอนโซลผู้ดูแล" className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-2 text-xs font-medium text-fg-subtle">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex h-9 items-center gap-2.5 rounded-control px-3 text-sm transition-colors duration-fast',
                      active ? 'text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                    )}
                  >
                    {active ? <span className="absolute inset-y-2 left-0 w-px bg-accent" aria-hidden="true" /> : null}
                    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : 'text-fg-subtle')} strokeWidth={1.5} aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

type EnvKind = 'production' | 'staging' | 'development';

const ENV_LOOK: Record<EnvKind, { label: string; tone: 'danger' | 'warning' | 'info' }> = {
  production: { label: 'ระบบจริง', tone: 'danger' },
  staging: { label: 'ทดสอบ', tone: 'warning' },
  development: { label: 'พัฒนา', tone: 'info' },
};

const noopSubscribe = () => () => {};

function envFromHost(): EnvKind {
  const fromBuild = process.env.NEXT_PUBLIC_APP_ENV;
  if (fromBuild === 'production' || fromBuild === 'staging' || fromBuild === 'development') return fromBuild;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost') || host.endsWith('.test')) {
    return 'development';
  }
  if (/(^|[.-])(staging|stage|preview|dev)([.-]|$)/.test(host)) return 'staging';
  return 'production';
}

function useEnvKind(): EnvKind | null {
  return React.useSyncExternalStore(noopSubscribe, envFromHost, () => null);
}

function AdminTopBar({ pathname, onOpenNav }: { pathname: string; onOpenNav: () => void }) {
  const role = useAuthStore((s) => s.user?.role);
  const env = useEnvKind();
  const crumbs = adminBreadcrumbs(pathname);

  return (
    <div className="border-b border-line">
      <div className="mx-auto flex h-12 w-full max-w-content items-center gap-3 px-4 sm:px-6 lg:px-8">
        <IconButton aria-label="เปิดเมนูคอนโซล" size="sm" className="-ml-1.5 lg:hidden" onClick={onOpenNav}>
          <MenuIcon className="h-4 w-4" strokeWidth={1.5} />
        </IconButton>
        <Breadcrumbs items={crumbs} className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-2">
          {env ? (
            <Badge tone={ENV_LOOK[env].tone} outline title="สภาพแวดล้อมของระบบ">
              {ENV_LOOK[env].label}
            </Badge>
          ) : null}
          {role && ROLE_LABEL[role] ? (
            <span className="hidden text-xs text-fg-muted sm:inline">{ROLE_LABEL[role]}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default AdminShell;
