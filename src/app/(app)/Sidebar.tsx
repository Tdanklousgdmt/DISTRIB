"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/projects", label: "Mes projets" },
  { href: "/vault", label: "Vault" },
  { href: "/concerts", label: "Concerts" },
  { href: "/revenus", label: "Revenus" },
  { href: "/claims", label: "Réclamations" },
];

export function Sidebar({
  unreadCount,
  userEmail,
  signOutAction,
}: {
  unreadCount: number;
  userEmail: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-1 border-b border-black/10 px-4 py-4 md:h-screen md:w-60 md:overflow-y-auto md:border-b-0 md:border-r md:px-4 md:py-6 dark:border-white/10">
      <Link
        href="/dashboard"
        className="mb-3 px-2 font-mono text-lg font-bold tracking-tight md:mb-8"
      >
        DISTRIB
      </Link>

      <nav className="flex gap-1 overflow-x-auto text-sm md:flex-col md:overflow-visible">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              "shrink-0 rounded-lg px-3 py-2 whitespace-nowrap " +
              (isActive(item.href)
                ? "bg-black/5 font-medium dark:bg-white/10"
                : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5")
            }
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/notifications"
          className={
            "flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 whitespace-nowrap " +
            (isActive("/notifications")
              ? "bg-black/5 font-medium dark:bg-white/10"
              : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5")
          }
        >
          Notifications
          {unreadCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
      </nav>

      <div className="mt-3 space-y-2 border-t border-black/10 pt-3 md:mt-auto md:pt-4 dark:border-white/10">
        <div className="truncate px-2 text-xs text-black/50 dark:text-white/50">{userEmail}</div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full rounded-full border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
  );
}
