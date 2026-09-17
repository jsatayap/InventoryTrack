"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/locations", label: "Locations" },
  { href: "/invoices", label: "Invoices" },
  { href: "/issue", label: "Issue" },
  { href: "/stock", label: "Current Stock" },
  { href: "/stock-tracking", label: "Stock Tracking" },
  { href: "/alerts", label: "Alerts"}
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
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link href="/" />}
                    className={navigationMenuTriggerStyle()}
                    >
                      Dashboard
                    </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link href="/products" />}
                    className={navigationMenuTriggerStyle()}
                    >
                      Products
                    </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link href="/locations" />}
                    className={navigationMenuTriggerStyle()}
                    >
                      Locations
                    </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link href="/invoices" />}
                    className={navigationMenuTriggerStyle()}
                    >
                      Invoices
                    </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link href="/issue" />}
                    className={navigationMenuTriggerStyle()}
                    >
                      Issue
                    </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link href="/stock" />}
                    className={navigationMenuTriggerStyle()}
                    >
                      Current Stock
                    </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link href="/stock-tracking" />}
                    className={navigationMenuTriggerStyle()}
                    >
                      Stock Tracking
                    </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link href="/alerts" />}
                    className={navigationMenuTriggerStyle()}
                    >
                      Alerts
                    </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
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