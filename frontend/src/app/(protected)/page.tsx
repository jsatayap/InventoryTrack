"use client";

import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">
        Welcome, {user?.full_name || user?.username}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Use the nav above to manage products, locations, and invoices.
      </p>
    </div>
  );
}