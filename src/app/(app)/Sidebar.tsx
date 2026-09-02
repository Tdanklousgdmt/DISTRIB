"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Icônes trait, 24x24, cohérentes avec l'identité sobre d'origine du prototype
// (stroke=currentColor, pas de remplissage — voir démo UI DISTRIB).
const ICONS: Record<string, React.ReactNode> = {
  dashboard: <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" />,
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  vault: <path d="M12 2l7 4v6c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6z M9 12l2 2 4-4" />,
  concerts: <path d="M3 5h18M3 10h18M8 3v4M16 3v4M3.5 5h17v16h-17z" />,
  revenus: <path d="M3 17l5-6 4 3 7-9M3 21h18" />,
  claims: <path d="M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M21 21l-4-4" />,
  notifications: <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" />,
};

// Navigation en deux sections, comme le prototype d'origine et le cahier des
// charges : « Création » (ce que je produis) / « Perception des droits » (ce
// que ça me rapporte et ce qui le menace).
const NAV_SECTIONS: Array<{
  label: string | null;
  items: Array<{ href: string; label: string; icon: string }>;
}> = [
  { label: null, items: [{ href: "/dashboard", label: "Tableau de bord", icon: "dashboard" }] },
  {
    label: "Création",
    items: [
      { href: "/projects", label: "Mes projets", icon: "projects" },
      { href: "/vault", label: "Vault", icon: "vault" },
    ],
  },
  {
    label: "Perception des droits",
    items: [
      { href: "/concerts", label: "Concerts", icon: "concerts" },
      { href: "/revenus", label: "Revenus", icon: "revenus" },
      { href: "/claims", label: "Réclamations", icon: "claims" },
    ],
  },
];

import { avatarColor, initials } from "@/lib/avatar";

function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[17px] w-[17px] shrink-0"
    >
      {ICONS[name]}
    </svg>
  );
}

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
    <aside
      className="flex w-full shrink-0 flex-col gap-1 border-b px-4 py-4 md:h-screen md:w-[250px] md:overflow-y-auto md:border-b-0 md:border-r md:px-4 md:py-6"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <Link href="/dashboard" className="mb-3 flex items-center gap-2.5 px-2 md:mb-8">
        <span
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px]"
          style={{ background: "var(--ink)" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--on-ink)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[15px] w-[15px]"
          >
            <path d="M12 2l7 4v6c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <span className="font-mono text-[15px] font-semibold tracking-[.16em]">DISTRIB</span>
      </Link>

      <nav className="flex gap-1 overflow-x-auto text-[13.5px] md:flex-col md:overflow-visible">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} className="contents md:block">
            {section.label && (
              <div
                className="hidden px-[10px] pt-4 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[.16em] md:block"
                style={{ color: "var(--faint)" }}
              >
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-[8px] px-[10px] py-2 font-medium transition-colors"
                  style={{ color: active ? "var(--ink)" : "var(--muted)" }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "var(--surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {active && (
                    <span
                      className="absolute top-[7px] bottom-[7px] hidden w-[2px] rounded-r-full md:block"
                      style={{ left: "-16px", background: "var(--accent)" }}
                    />
                  )}
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
        <Link
          href="/notifications"
          className="relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-[8px] px-[10px] py-2 font-medium transition-colors"
          style={{ color: isActive("/notifications") ? "var(--ink)" : "var(--muted)" }}
          onMouseEnter={(e) => {
            if (!isActive("/notifications")) e.currentTarget.style.background = "var(--surface-2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {isActive("/notifications") && (
            <span
              className="absolute top-[7px] bottom-[7px] hidden w-[2px] rounded-r-full md:block"
              style={{ left: "-16px", background: "var(--accent)" }}
            />
          )}
          <Icon name="notifications" />
          Notifications
          {unreadCount > 0 && (
            <span
              className="ml-auto grid h-[19px] min-w-[19px] place-items-center rounded-[5px] px-[5px] font-mono text-[11px] font-semibold"
              style={{ color: "var(--danger)", background: "var(--danger-weak)" }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
      </nav>

      <div className="mt-2 hidden gap-3 px-[10px] font-mono text-[11px] md:flex" style={{ color: "var(--faint)" }}>
        <Link href="/onboarding" className="hover:underline">
          Parcours guidé
        </Link>
        <Link href="/faq" className="hover:underline">
          Aide
        </Link>
      </div>

      <div
        className="mt-3 flex items-center gap-2.5 border-t pt-3 md:mt-auto md:pt-4"
        style={{ borderColor: "var(--line)" }}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] font-mono text-[11px] font-semibold text-white"
          style={{ background: avatarColor(userEmail) }}
        >
          {initials(userEmail)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{userEmail}</div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="font-mono text-[11.5px] hover:underline"
              style={{ color: "var(--faint)" }}
            >
              Déconnexion
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
