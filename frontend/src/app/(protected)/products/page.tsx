"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, buildQuery, ApiError } from "@/lib/api";
import { ProductWithStock, Location, ProductFilters, NewProduct } from "@/lib/types";

const emptyNewProduct: NewProduct = {
  sku: "",
  name: "",
  series: "",
  storage_size: "",
  color: "",
  ram: "",
  price: 0,
  is_serialized: true,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [filters, setFilters] = useState<ProductFilters>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProduct>(emptyNewProduct);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    fetchProducts({});
  }, []);

  async function fetchProducts(f: ProductFilters) {
    setIsLoading(true);
    setError(null);
    try {
      const query = buildQuery({
        location_id: f.location_id,
        name: f.name,
        series: f.series,
        storage_size: f.storage_size,
        color: f.color,
        ram: f.ram,
        min_price: f.min_price,
        max_price: f.max_price,
      });
      const data = await api.get<ProductWithStock[]>(`/products${query}`);
      setProducts(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load products.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    fetchProducts(filters);
  }

  function handleClear() {
    setFilters({});
    fetchProducts({});
  }

  async function handleAddProduct(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);
    try {
      await api.post("/products", {
        ...newProduct,
        price: Number(newProduct.price),
      });
      setNewProduct(emptyNewProduct);
      setShowAddForm(false);
      fetchProducts(filters);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create product.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Products</h1>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] transition-colors"
        >
          {showAddForm ? "Cancel" : "Add Product"}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddProduct}
          className="border border-neutral-300 bg-white p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <Field label="SKU">
            <input
              required
              value={newProduct.sku}
              onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Name">
            <input
              required
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Series">
            <input
              value={newProduct.series}
              onChange={(e) => setNewProduct({ ...newProduct, series: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Storage">
            <input
              placeholder="256GB"
              value={newProduct.storage_size}
              onChange={(e) => setNewProduct({ ...newProduct, storage_size: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Color">
            <input
              value={newProduct.color}
              onChange={(e) => setNewProduct({ ...newProduct, color: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="RAM">
            <input
              placeholder="8GB"
              value={newProduct.ram}
              onChange={(e) => setNewProduct({ ...newProduct, ram: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Price (THB)">
            <input
              type="number"
              required
              min={0}
              step="0.01"
              value={newProduct.price}
              onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
              className="input"
            />
          </Field>
          <Field label="Tracking">
            <select
              value={newProduct.is_serialized ? "yes" : "no"}
              onChange={(e) =>
                setNewProduct({ ...newProduct, is_serialized: e.target.value === "yes" })
              }
              className="input"
            >
              <option value="yes">Control serial (scan each unit)</option>
              <option value="no">Non-control (quantity only)</option>
            </select>
          </Field>

          <div className="col-span-2 md:col-span-4 flex items-center gap-3 mt-1">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] disabled:opacity-50 transition-colors"
            >
              {isSaving ? "Saving…" : "Save product"}
            </button>
            {formError && <p className="text-sm text-red-700">{formError}</p>}
          </div>
        </form>
      )}

      <form
        onSubmit={handleSearch}
        className="border border-neutral-300 bg-white p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <Field label="Location">
          <select
            value={filters.location_id ?? ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                location_id: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="input"
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input
            value={filters.name ?? ""}
            onChange={(e) => setFilters({ ...filters, name: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Series">
          <input
            value={filters.series ?? ""}
            onChange={(e) => setFilters({ ...filters, series: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Storage">
          <input
            placeholder="256GB"
            value={filters.storage_size ?? ""}
            onChange={(e) => setFilters({ ...filters, storage_size: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Color">
          <input
            value={filters.color ?? ""}
            onChange={(e) => setFilters({ ...filters, color: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="RAM">
          <input
            placeholder="8GB"
            value={filters.ram ?? ""}
            onChange={(e) => setFilters({ ...filters, ram: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Min price">
          <input
            type="number"
            min={0}
            value={filters.min_price ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, min_price: e.target.value ? Number(e.target.value) : undefined })
            }
            className="input"
          />
        </Field>
        <Field label="Max price">
          <input
            type="number"
            min={0}
            value={filters.max_price ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, max_price: e.target.value ? Number(e.target.value) : undefined })
            }
            className="input"
          />
        </Field>

        <div className="col-span-2 md:col-span-4 flex gap-3">
          <button
            type="submit"
            className="bg-neutral-900 text-white text-sm font-medium px-4 py-2 hover:bg-neutral-700 transition-colors"
          >
            Search
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-neutral-600 hover:text-neutral-900 px-2"
          >
            Clear filters
          </button>
        </div>
      </form>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="border border-neutral-300 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Series</th>
              <th className="px-3 py-2 font-medium">Storage</th>
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">RAM</th>
              <th className="px-3 py-2 font-medium text-right">Price</th>
              <th className="px-3 py-2 font-medium">Tracking</th>
              {filters.location_id && <th className="px-3 py-2 font-medium text-right">Qty</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-neutral-400">
                  No products found.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{p.series || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{p.storage_size || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{p.color || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{p.ram || "—"}</td>
                  <td className="px-3 py-2 text-right">{p.price.toLocaleString()}</td>
                  <td className="px-3 py-2 text-neutral-500">
                    {p.is_serialized ? "Control serial" : "Non-control"}
                  </td>
                  {filters.location_id && (
                    <td className="px-3 py-2 text-right">{p.quantity}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-500 mb-1">{label}</span>
      {children}
    </label>
  );
}