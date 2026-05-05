"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileStack,
  Workflow,
  Boxes,
  PlayCircle,
  Settings,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/templates", label: "Templates", icon: FileStack },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/adapters", label: "Adapters", icon: Boxes },
  { href: "/runs", label: "Runs", icon: PlayCircle },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <div className="px-5 py-5 border-b border-zinc-200 dark:border-zinc-800">
        <div className="font-semibold text-zinc-900 dark:text-zinc-50">
          LoRA Forge
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Regulatory AI workflows
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-50",
              ].join(" ")}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
        v0.1.0 · local-first
      </div>
    </aside>
  );
}
