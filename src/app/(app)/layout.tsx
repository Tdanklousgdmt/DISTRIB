import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { Sidebar } from "./Sidebar";

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

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <Sidebar unreadCount={unreadCount} userEmail={user.email ?? ""} signOutAction={signOutAction} />
      <main className="min-w-0 flex-1 px-6 py-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
