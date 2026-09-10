"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { Location } from "@/lib/types";

interface LocationForm {
  code: string;
  name: string;
  address: string;
}

const emptyForm: LocationForm = { code: "", name: "", address: "" };

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newLocation, setNewLocation] = useState<LocationForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<LocationForm>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    fetchLocations();
  }, []);

  async function fetchLocations() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<Location[]>("/locations?include_inactive=true");
      setLocations(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load locations.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);
    try {
      await api.post("/locations", newLocation);
      setNewLocation(emptyForm);
      setShowAddForm(false);
      fetchLocations();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create location.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(loc: Location) {
    setEditingId(loc.id);
    setEditForm({ code: loc.code, name: loc.name, address: loc.address ?? "" });
    setEditError(null);
  }

  async function handleSaveEdit(id: number) {
    setEditError(null);
    try {
      await api.put(`/locations/${id}`, editForm);
      setEditingId(null);
      fetchLocations();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Could not save changes.");
    }
  }

  async function toggleActive(loc: Location) {
    try {
      if (loc.is_active) {
        await api.delete(`/locations/${loc.id}`); // soft delete -> is_active = false
      } else {
        await api.put(`/locations/${loc.id}`, { is_active: true });
      }
      fetchLocations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Locations</h1>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] transition-colors"
        >
          {showAddForm ? "Cancel" : "Add Location"}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="border border-neutral-300 bg-white p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Code</span>
            <input
              required
              value={newLocation.code}
              onChange={(e) => setNewLocation({ ...newLocation, code: e.target.value })}
              className="input"
              placeholder="BKK-01"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Name</span>
            <input
              required
              value={newLocation.name}
              onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
              className="input"
              placeholder="Siam Store"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Address</span>
            <input
              value={newLocation.address}
              onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })}
              className="input"
            />
          </label>

          <div className="md:col-span-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] disabled:opacity-50 transition-colors"
            >
              {isSaving ? "Saving…" : "Save location"}
            </button>
            {formError && <p className="text-sm text-red-700">{formError}</p>}
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="border border-neutral-300 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : locations.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  No locations yet.
                </td>
              </tr>
            ) : (
              locations.map((loc) => (
                <tr key={loc.id} className="border-b border-neutral-200 last:border-0 align-top">
                  {editingId === loc.id ? (
                    <>
                      <td className="px-3 py-2">
                        <input
                          value={editForm.code}
                          onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                          className="input"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="input"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editForm.address}
                          onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                          className="input"
                        />
                      </td>
                      <td className="px-3 py-2 text-neutral-500">
                        {loc.is_active ? "Active" : "Inactive"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(loc.id)}
                            className="text-sm text-[#1E3A5F] hover:underline"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-sm text-neutral-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                        {editError && <p className="text-xs text-red-700 mt-1">{editError}</p>}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-xs">{loc.code}</td>
                      <td className="px-3 py-2">{loc.name}</td>
                      <td className="px-3 py-2 text-neutral-500">{loc.address || "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            loc.is_active
                              ? "text-green-700"
                              : "text-neutral-400"
                          }
                        >
                          {loc.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-3">
                          <button
                            onClick={() => startEdit(loc)}
                            className="text-sm text-[#1E3A5F] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(loc)}
                            className="text-sm text-neutral-500 hover:underline"
                          >
                            {loc.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </>
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