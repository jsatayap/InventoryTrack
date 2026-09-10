"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/locations", label: "Locations" },
  { href: "/invoices", label: "Invoices" },
  { href: "/issue", label: "Issue" },
  { href: "/stock", label: "Current Stock" },
  { href: "/stock-tracking", label: "Stock Tracking" },
];

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    // brief flash before redirect effect fires
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-300 bg-white">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <span className="font-semibold text-neutral-900">InventoryTrack</span>
            <nav className="flex gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-[#1E3A5F] text-white"
                        : "text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-500">
              {user.full_name || user.username}
              <span className="text-neutral-400"> · {user.role}</span>
            </span>
            <button
              onClick={logout}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}