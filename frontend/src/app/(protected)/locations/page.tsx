"use client";

import { useEffect, useState, FormEvent } from "react";
import { Pencil } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Location } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newLocation, setNewLocation] = useState<LocationForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editForm, setEditForm] = useState<LocationForm>(emptyForm);
  const [isEditSaving, setIsEditSaving] = useState(false);
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

  function openAddDialog() {
    setNewLocation(emptyForm);
    setFormError(null);
    setShowAddDialog(true);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);
    try {
      await api.post("/locations", newLocation);
      setNewLocation(emptyForm);
      setShowAddDialog(false);
      fetchLocations();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create location.");
    } finally {
      setIsSaving(false);
    }
  }

  function openEditDialog(loc: Location) {
    setEditingLocation(loc);
    setEditForm({ code: loc.code, name: loc.name, address: loc.address ?? "" });
    setEditError(null);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingLocation) return;
    setEditError(null);
    setIsEditSaving(true);
    try {
      await api.put(`/locations/${editingLocation.id}`, editForm);
      setEditingLocation(null);
      fetchLocations();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setIsEditSaving(false);
    }
  }

  async function toggleActive(loc: Location) {
    setEditError(null);
    try {
      if (loc.is_active) {
        await api.delete(`/locations/${loc.id}`); // soft delete -> is_active = false
      } else {
        await api.put(`/locations/${loc.id}`, { is_active: true });
      }
      setEditingLocation(null);
      fetchLocations();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Could not update status.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Locations</h1>
        <Button onClick={openAddDialog}>Add Location</Button>
      </div>

      {/* Add Location dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Location</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAdd}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="code">Code *</FieldLabel>
                <Input
                  id="code"
                  required
                  value={newLocation.code}
                  onChange={(e) =>
                    setNewLocation({ ...newLocation, code: e.target.value })
                  }
                  placeholder="BKK-01"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="name">Name *</FieldLabel>
                <Input
                  id="name"
                  required
                  value={newLocation.name}
                  onChange={(e) =>
                    setNewLocation({ ...newLocation, name: e.target.value })
                  }
                  placeholder="Siam Branch"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="address">Address</FieldLabel>
                <Input
                  id="address"
                  value={newLocation.address}
                  onChange={(e) =>
                    setNewLocation({ ...newLocation, address: e.target.value })
                  }
                />
              </Field>
            </FieldGroup>

            {formError && (
              <p className="text-sm text-red-700 mt-3">{formError}</p>
            )}

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save location"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Location dialog */}
      <Dialog
        open={editingLocation !== null}
        onOpenChange={(open) => !open && setEditingLocation(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Location</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEdit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="edit-code">Code *</FieldLabel>
                <Input
                  id="edit-code"
                  required
                  value={editForm.code}
                  onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-name">Name *</FieldLabel>
                <Input
                  id="edit-name"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-address">Address</FieldLabel>
                <Input
                  id="edit-address"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              </Field>
            </FieldGroup>

            {editError && (
              <p className="text-sm text-red-700 mt-3">{editError}</p>
            )}

            <DialogFooter className="mt-4 sm:justify-between">
              {editingLocation && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toggleActive(editingLocation)}
                >
                  {editingLocation.is_active ? "Deactivate" : "Activate"}
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingLocation(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isEditSaving}>
                  {isEditSaving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              <th className="px-3 py-2 font-medium w-16">Actions</th>
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
                <tr key={loc.id} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{loc.code}</td>
                  <td className="px-3 py-2">{loc.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{loc.address || "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={loc.is_active ? "text-green-700" : "text-neutral-400"}
                    >
                      {loc.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => openEditDialog(loc)}
                      className="text-neutral-500 hover:text-[#1E3A5F]"
                      aria-label={`Edit ${loc.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}