"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Moon, Sun, UserCog } from "lucide-react";
import { saveThemePreference } from "@/features/account/theme-actions";
import type { Theme } from "@/lib/theme";

export function UserMenu({
  email,
  name,
  role,
  theme: initialTheme,
  signOutAction,
}: {
  email: string | null;
  name: string | null;
  role: "admin" | "user";
  theme: Theme;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = initialTheme;
  }, [initialTheme]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    void saveThemePreference(next);
  };

  const label = name?.trim() || email || "Conta";
  const initials = label.slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface-2)]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-xs font-medium">
          {initials}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{label}</span>
        <ChevronDown size={14} className="text-[var(--color-muted)]" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2.5">
            <p className="truncate text-sm font-medium">{name?.trim() || "Sem nome"}</p>
            <p className="truncate text-xs text-[var(--color-muted)]">{email}</p>
            {role === "admin" ? (
              <span className="mt-1 inline-block rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs text-[var(--color-muted)]">
                administrador
              </span>
            ) : null}
          </div>

          <Link
            href="/conta"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm transition hover:bg-[var(--color-surface-2)]"
          >
            <UserCog size={15} className="text-[var(--color-muted)]" />
            Minha conta
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm transition hover:bg-[var(--color-surface-2)]"
          >
            {theme === "dark" ? (
              <Sun size={15} className="text-[var(--color-muted)]" />
            ) : (
              <Moon size={15} className="text-[var(--color-muted)]" />
            )}
            {theme === "dark" ? "Tema claro" : "Tema escuro"}
          </button>

          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 border-t border-[var(--color-border)] px-3 py-2.5 text-sm transition hover:bg-[var(--color-surface-2)]"
            >
              <LogOut size={15} className="text-[var(--color-muted)]" />
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
