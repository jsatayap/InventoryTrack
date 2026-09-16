"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";

interface MonthlyTrend {
  month: string;
  received: number;
  issued: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [trend, setTrend] = useState<MonthlyTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/stock/dashboard/monthly-trend?months=6")
      .then((res) => setTrend(res))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">
          Welcome, {user?.full_name || user?.username}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Use the nav above to manage products, locations, and invoices.
        </p>
      </div>

      <div className="border border-neutral-300 bg-white p-4">
        <h2 className="mb-4 text-sm font-medium text-neutral-900">
          Received vs Issued — Last 6 Months
        </h2>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="received" stroke="#16a34a" strokeWidth={2} name="Received" />
              <Line type="monotone" dataKey="issued" stroke="#dc2626" strokeWidth={2} name="Issued" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}