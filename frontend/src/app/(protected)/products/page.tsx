"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, buildQuery, ApiError } from "@/lib/api";
import { ProductWithStock, Location, ProductFilters, NewProduct } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Field,
  FieldLabel,
  FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2 } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const emptyNewProduct: NewProduct = {
  sku: "",
  name: "",
  series: "",
  storage_size: undefined,
  color: "",
  ram: undefined,
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

  const [editingProduct, setEditingProduct] = useState<ProductWithStock | null>(null);
  const [editForm, setEditForm] = useState<NewProduct>(emptyNewProduct);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  const [deletingProduct, setDeletingProduct] = useState<ProductWithStock | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

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
        min_storage: f.min_storage,
        max_storage: f.max_storage,
        color: f.color,
        ram: f.ram,
        min_ram: f.min_ram,
        max_ram: f.max_ram,
        min_price: f.min_price,
        max_price: f.max_price,
      });
      const data = await api.get<ProductWithStock[]>(`/products${query}`);
      setProducts(data);
      setCurrentPage(1);
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

  function openEditDialog(p: ProductWithStock) {
    setEditForm({
      sku: p.sku,
      name: p.name,
      series: p.series ?? "",
      storage_size: p.storage_size ?? undefined,
      color: p.color ?? "",
      ram: p.ram ?? undefined,
      price: p.price,
      is_serialized: p.is_serialized,
    });
    setEditFormError(null);
    setEditingProduct(p);
  }

  async function handleEditProduct(e: FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    setEditFormError(null);
    setIsEditSaving(true);
    try {
      await api.put(`/products/${editingProduct.id}`, {
        ...editForm,
        price: Number(editForm.price),
      });
      setEditingProduct(null);
      fetchProducts(filters);
    } catch (err) {
      setEditFormError(err instanceof ApiError ? err.message : "Could not update product.");
    } finally {
      setIsEditSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!deletingProduct) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await api.delete(`/products/${deletingProduct.id}`);
      setDeletingProduct(null);
      fetchProducts(filters);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete product.");
    } finally {
      setIsDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pagedProducts = products.slice(pageStart, pageStart + pageSize);

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setCurrentPage(1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Products</h1>
        <Dialog
          open={showAddForm}
          onOpenChange={(open) => {
            setShowAddForm(open);
            if (!open) {
              setNewProduct(emptyNewProduct);
              setFormError(null);
            }
          }}
        >
          <DialogTrigger
            render={
              <Button className="bg-[#1E3A5F] text-white hover:bg-[#16304d]">
                Add Product
              </Button>
            }
          />
          <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Add Product</DialogTitle>
            </DialogHeader>

            <form
              onSubmit={handleAddProduct}
              className="overflow-y-auto pr-1 -mr-1"
            >
              <FieldGroup>
                <ProductFormFields idPrefix="add" value={newProduct} onChange={setNewProduct} />

                <div className="flex items-center gap-3 mt-1">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? "Saving…" : "Save product"}
                  </Button>
                  {formError && <p className="text-sm text-red-700">{formError}</p>}
                </div>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog
        open={editingProduct !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProduct(null);
            setEditFormError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditProduct} className="overflow-y-auto pr-1 -mr-1">
            <FieldGroup>
              <ProductFormFields idPrefix="edit" value={editForm} onChange={setEditForm} />

              <div className="flex items-center gap-3 mt-1">
                <Button type="submit" disabled={isEditSaving}>
                  {isEditSaving ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingProduct(null);
                    setEditFormError(null);
                  }}
                >
                  Cancel
                </Button>
                {editFormError && <p className="text-sm text-red-700">{editFormError}</p>}
              </div>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingProduct !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingProduct(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-neutral-900">{deletingProduct?.name}</span>{" "}
              ({deletingProduct?.sku}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-red-700">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="ghost">Cancel</Button>} />
            <AlertDialogAction
              render={
                <Button
                  variant="destructive"
                  disabled={isDeleting}
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteProduct();
                  }}
                >
                  {isDeleting ? "Deleting…" : "Confirm deletion"}
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <form
        onSubmit={handleSearch}
        className="border border-neutral-300 bg-white p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <Field>
          <FieldLabel htmlFor="filter-location">Location</FieldLabel>
          <select
            id="filter-location"
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
        <Field>
          <FieldLabel htmlFor="filter-name">Name</FieldLabel>
          <Input
            id="filter-name"
            value={filters.name ?? ""}
            onChange={(e) => setFilters({ ...filters, name: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-series">Series</FieldLabel>
          <Input
            id="filter-series"
            value={filters.series ?? ""}
            onChange={(e) => setFilters({ ...filters, series: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-min-storage">Min storage (GB)</FieldLabel>
          <Input
            id="filter-min-storage"
            type="number"
            min={0}
            value={filters.min_storage ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, min_storage: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-max-storage">Max storage (GB)</FieldLabel>
          <Input
            id="filter-max-storage"
            type="number"
            min={0}
            value={filters.max_storage ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, max_storage: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-color">Color</FieldLabel>
          <Input
            id="filter-color"
            value={filters.color ?? ""}
            onChange={(e) => setFilters({ ...filters, color: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-min-ram">Min RAM (GB)</FieldLabel>
          <Input
            id="filter-min-ram"
            type="number"
            min={0}
            value={filters.min_ram ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, min_ram: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-max-ram">Max RAM (GB)</FieldLabel>
          <Input
            id="filter-max-ram"
            type="number"
            min={0}
            value={filters.max_ram ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, max_ram: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-min-price">Min price</FieldLabel>
          <Input
            id="filter-min-price"
            type="number"
            min={0}
            value={filters.min_price ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, min_price: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="filter-max-price">Max price</FieldLabel>
          <Input
            id="filter-max-price"
            type="number"
            min={0}
            value={filters.max_price ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, max_price: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </Field>

        <div className="col-span-2 md:col-span-4 flex gap-3">
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <Button type="button" variant="ghost" onClick={handleClear}>
            Clear filters
          </Button>
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
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : pagedProducts.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-neutral-400">
                  No products found.
                </td>
              </tr>
            ) : (
              pagedProducts.map((p) => (
                <tr key={p.id} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{p.series || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{p.storage_size != null ? `${p.storage_size} GB` : "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{p.color || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{p.ram != null ? `${p.ram} GB` : "—"}</td>
                  <td className="px-3 py-2 text-right">{p.price.toLocaleString()}</td>
                  <td className="px-3 py-2 text-neutral-500">
                    {p.is_serialized ? "Control serial" : "Non-control"}
                  </td>
                  {filters.location_id && (
                    <td className="px-3 py-2 text-right">{p.quantity}</td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => openEditDialog(p)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => {
                          setDeleteError(null);
                          setDeletingProduct(p);
                        }}
                      >
                        <Trash2 className="size-4 text-red-700" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <Field orientation="horizontal" className="items-center gap-2 w-auto">
          <FieldLabel htmlFor="page-size" className="font-normal text-neutral-500">
            Rows per page
          </FieldLabel>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger id="page-size" className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="flex items-center gap-4">
          <p className="text-sm text-neutral-500">
            Page {currentPage} of {totalPages}
          </p>
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage((p) => Math.max(1, p - 1));
                  }}
                  aria-disabled={currentPage === 1}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                  }}
                  aria-disabled={currentPage === totalPages}
                  className={
                    currentPage === totalPages ? "pointer-events-none opacity-50" : undefined
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}

function ProductFormFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: NewProduct;
  onChange: (value: NewProduct) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-sku`}>SKU</FieldLabel>
        <Input
          id={`${idPrefix}-sku`}
          required
          value={value.sku}
          onChange={(e) => onChange({ ...value, sku: e.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          required
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-series`}>Series</FieldLabel>
        <Input
          id={`${idPrefix}-series`}
          value={value.series}
          onChange={(e) => onChange({ ...value, series: e.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-storage_size`}>Storage (GB)</FieldLabel>
        <Input
          id={`${idPrefix}-storage_size`}
          type="number"
          min={0}
          placeholder="256"
          value={value.storage_size ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              storage_size: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-color`}>Color</FieldLabel>
        <Input
          id={`${idPrefix}-color`}
          value={value.color}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-ram`}>RAM (GB)</FieldLabel>
        <Input
          id={`${idPrefix}-ram`}
          type="number"
          min={0}
          placeholder="8"
          value={value.ram ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              ram: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-price`}>Price (THB)</FieldLabel>
        <Input
          id={`${idPrefix}-price`}
          type="number"
          required
          min={0}
          step="0.01"
          value={value.price}
          onChange={(e) => onChange({ ...value, price: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <FieldLabel>Tracking</FieldLabel>
        <RadioGroup
          value={value.is_serialized ? "yes" : "no"}
          onValueChange={(v) => onChange({ ...value, is_serialized: v === "yes" })}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id={`${idPrefix}-tracking-yes`} />
            <FieldLabel htmlFor={`${idPrefix}-tracking-yes`} className="font-normal">
              Control serial (scan each unit)
            </FieldLabel>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id={`${idPrefix}-tracking-no`} />
            <FieldLabel htmlFor={`${idPrefix}-tracking-no`} className="font-normal">
              Non-control (quantity only)
            </FieldLabel>
          </div>
        </RadioGroup>
      </Field>
    </>
  );
}