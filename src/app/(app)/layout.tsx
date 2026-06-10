import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { signOut } from "@/lib/auth";

// Layout des pages protégées. La vérif d'auth se fait ici (et est re-vérifiée
// dans chaque action/route) — pas via le proxy Next 16.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/dashboard" className="font-mono text-lg font-bold tracking-tight">
            DISTRIB
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="hover:underline">
              Tableau de bord
            </Link>
            <Link href="/projects" className="hover:underline">
              Mes projets
            </Link>
            <Link href="/concerts" className="hover:underline">
              Concerts
            </Link>
            <Link href="/revenus" className="hover:underline">
              Revenus
            </Link>
            <Link href="/claims" className="hover:underline">
              Réclamations
            </Link>
            <Link href="/notifications" className="relative hover:underline">
              Notifications
              {unreadCount > 0 && (
                <span className="absolute -right-3 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <span className="hidden text-black/50 sm:inline dark:text-white/50">
              {user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
