"use client";

import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createPersistentStore } from "@/client/persistent-store";
import { Dialog } from "@/components/ui/dialog";
import { cx } from "@/components/ui/class-names";
import { logoutAction } from "@/server/auth/auth-actions";
import { ADMIN_NAV, isNavItemActive } from "./admin-nav";

const sidebarStore = createPersistentStore("admin.sidebar.collapsed", false, (value) => value === true);

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admini menüü" className="flex flex-col gap-5 px-3 py-4">
      {ADMIN_NAV.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label && !collapsed && <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-subtle">{group.label}</p>}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item.href);
              const base = cx("flex items-center gap-3 rounded-md px-2 py-2 text-sm", collapsed && "justify-center");
              if (item.comingSoon) {
                return (
                  <li key={item.href}>
                    <span className={cx(base, "cursor-not-allowed text-subtle")} title={`${item.label} — tulekul`} aria-disabled="true">
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase">Tulekul</span>
                        </>
                      )}
                      {collapsed && <span className="sr-only">{item.label} (tulekul)</span>}
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cx(base, active ? "bg-primary-soft font-semibold text-primary" : "text-text hover:bg-surface-sunken")}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
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

function LogoutButton({ compact }: { compact?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-sunken hover:text-text"
      >
        <LogOut className="size-4" aria-hidden />
        <span className={cx(compact && "sr-only sm:not-sr-only")}>Logi välja</span>
      </button>
    </form>
  );
}

export function AdminShell({ user, children }: { user: { name: string; email: string }; children: ReactNode }) {
  const collapsed = sidebarStore.useValue();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleCollapsed = () => sidebarStore.set((value) => !value);

  return (
    <div className="flex min-h-dvh bg-surface-alt">
      {/* Desktop sidebar */}
      <aside className={cx("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface lg:flex", collapsed ? "w-16" : "w-60")}>
        <div className={cx("flex h-14 items-center border-b border-border px-4", collapsed && "justify-center px-0")}>
          <Link href="/admin" className="font-semibold">
            {collapsed ? "A" : "Admin"}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex h-11 items-center justify-center gap-2 border-t border-border text-sm text-muted hover:text-text"
          aria-label={collapsed ? "Laienda menüü" : "Ahenda menüü"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          {!collapsed && "Ahenda"}
        </button>
      </aside>

      {/* Mobiili/tahvli drawer */}
      <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Admin" variant="drawer-left">
        <SidebarNav collapsed={false} onNavigate={() => setDrawerOpen(false)} />
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="-ml-2 rounded-md p-2 text-muted hover:bg-surface-sunken hover:text-text lg:hidden"
            aria-label="Ava menüü"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <span className="font-semibold lg:hidden">Admin</span>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="hidden text-sm text-muted hover:text-text sm:inline" target="_blank" rel="noopener">
              Vaata poodi ↗
            </Link>
            <span className="hidden max-w-48 truncate text-sm md:inline" title={user.email}>
              {user.name}
            </span>
            <LogoutButton compact />
          </div>
        </header>
        <main id="sisu" className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
