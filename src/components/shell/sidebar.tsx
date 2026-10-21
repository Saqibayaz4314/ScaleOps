"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/infrastructure", label: "Infrastructure" },
  { href: "/scaling-events", label: "Scaling Events" },
  { href: "/connection", label: "Connection" },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex shrink-0 flex-col bg-ink text-chalk lg:sticky lg:top-0 lg:h-screen lg:w-[228px]">
      <div className="flex items-center justify-between gap-4 px-5 py-4 lg:block lg:py-7">
        <div className="leading-none">
          <div className="text-[19px] font-semibold tracking-[0.04em]">SCALE</div>
          <div className="mt-0.5 text-[19px] font-semibold tracking-[0.04em] text-copper">/ OPS</div>
        </div>
        <div className="eyebrow hidden !text-quiet lg:mt-10 lg:block">Operations / 01</div>
      </div>
      <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:pb-0">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center whitespace-nowrap rounded-[4px] border-l-2 px-3 text-[13px] ${
                active
                  ? "border-copper bg-ink-2 font-semibold text-white"
                  : "border-transparent text-quiet hover:bg-ink-2 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden border-t border-ink-2 p-3 lg:block">
        <p className="mono truncate px-2 text-[11px] text-quiet" title={email}>{email}</p>
        <p className="px-2 pb-2 pt-1 text-[11px] leading-snug text-quiet">
          Read-only view of AWS. This dashboard never changes capacity.
        </p>
        <button
          type="button"
          onClick={logout}
          className="flex min-h-10 w-full items-center gap-2 rounded-[4px] px-3 text-[13px] text-quiet hover:bg-ink-2 hover:text-white"
        >
          <LogOut size={15} aria-hidden="true" /> Sign out
        </button>
      </div>
    </aside>
  );
}
