import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Search, Upload, ArrowUpDown, Calendar, FileDown } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

interface ProductRow {
  id: number;
  name: string;
  barcode: string;
  description?: string | null;
  category: string;
  price_buying: number;
  price_selling: number;
  stock_quantity: number;
  min_stock_alert: number;
  wholesale_price?: number | null;
  wholesale_threshold?: number | null;
  image_url?: string | null;
  item_discount_type?: "percent" | "fixed" | null;
  item_discount_value?: number | null;
  item_discount_start?: string | null;
  item_discount_expiry?: string | null;
}

const STOCK_STATUS = {
  inStock: (qty: number, min: number) => qty > min && qty > 10,
  medium: (qty: number, min: number) => qty > min && qty <= 10,
  low: (qty: number, min: number) => qty > 0 && qty <= min,
  out: (qty: number) => qty <= 0,
};

interface InventoryManagerScreenProps {
  /** Cashier: read-only, hide add/edit/delete/upload */
  readOnly?: boolean;
}

export function InventoryManagerScreen({ readOnly = false }: InventoryManagerScreenProps) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState<Partial<ProductRow>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // Stock adjustment state
  const [adjustProduct, setAdjustProduct] = useState<ProductRow | null>(null);
  const [adjustChange, setAdjustChange] = useState("");
  const [adjustReason, setAdjustReason] = useState("Correction");
  const [adjustSaving, setAdjustSaving] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("products"));
      if (!res.ok) throw new Error("Failed to load");
      const list = await res.json();
      setProducts(Array.isArray(list) ? list : []);
    } catch {
      toast.error("Failed to load products");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetch(apiUrl("products/categories"))
      .then((r) => r.json())
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => setCategories([]));
  }, [fetchProducts]);

  const filtered = products.filter((p) => {
    const matchesSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search);
    const matchesCategory =
      categoryFilter === "all" || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this product?")) return;
    try {
      const res = await fetch(apiUrl(`products/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Product deleted");
      fetchProducts();
    } catch (e) {
      toast.error("Delete failed", { description: String(e) });
    }
  };

  const handleSaveEdit = async () => {
    if (!editing?.id) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`products/${editing.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Product updated");
      setEditing(null);
      setForm({});
      fetchProducts();
    } catch (e) {
      toast.error("Update failed", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleStockAdjust = async () => {
    if (!adjustProduct) return;
    const qty = parseInt(adjustChange, 10);
    if (isNaN(qty) || qty === 0) {
      toast.error("Enter a non-zero quantity change");
      return;
    }
    if (Math.abs(qty) > 100_000) {
      toast.error("Adjustment too large", { description: "Maximum adjustment is ±100,000 units" });
      return;
    }
    setAdjustSaving(true);
    try {
      const res = await fetch(apiUrl("inventory/adjust"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: adjustProduct.id,
          quantity_change: qty,
          reason: adjustReason,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Stock adjusted", {
        description: `${adjustProduct.name}: ${qty > 0 ? "+" : ""}${qty} (${adjustReason})`,
      });
      setAdjustProduct(null);
      setAdjustChange("");
      setAdjustReason("Correction");
      fetchProducts();
    } catch (e) {
      toast.error("Adjustment failed", { description: String(e) });
    } finally {
      setAdjustSaving(false);
    }
  };

  const openAdd = () => {
    setForm({
      name: "",
      barcode: "",
      description: null,
      category: "General",
      price_buying: 0,
      price_selling: 0,
      stock_quantity: 0,
      min_stock_alert: 5,
      wholesale_price: null,
      wholesale_threshold: null,
      image_url: null,
      item_discount_type: null,
      item_discount_value: null,
      item_discount_start: null,
      item_discount_expiry: null,
    });
    setEditing({ id: 0, name: "", barcode: "", description: null, category: "General", price_buying: 0, price_selling: 0, stock_quantity: 0, min_stock_alert: 5, wholesale_price: null, wholesale_threshold: null });
  };

  const handleAdd = async () => {
    if (!form.name || !form.barcode) {
      toast.error("Name and Barcode required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl("products"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          barcode: form.barcode,
          description: form.description || null,
          category: form.category || "General",
          price_buying: form.price_buying ?? 0,
          price_selling: form.price_selling ?? 0,
          stock_quantity: form.stock_quantity ?? 0,
          min_stock_alert: form.min_stock_alert ?? 5,
          wholesale_price: form.wholesale_price ?? null,
          wholesale_threshold: form.wholesale_threshold ?? null,
          image_url: form.image_url || null,
          item_discount_type: form.item_discount_type || null,
          item_discount_value: form.item_discount_value || null,
          item_discount_start: form.item_discount_start || null,
          item_discount_expiry: form.item_discount_expiry || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Product added");
      setEditing(null);
      setForm({});
      fetchProducts();
    } catch (e) {
      toast.error("Add failed", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const marginPct = (buy: number, sell: number) =>
    buy > 0 ? (((sell - buy) / buy) * 100).toFixed(1) : "0";

  return (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} of {products.length} products
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              id="inventory-upload"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const toastId = toast.loading("Uploading inventory...");
                try {
                  const formData = new FormData();
                  formData.append("file", file);
                  const res = await fetch(apiUrl("inventory/upload"), {
                    method: "POST",
                    body: formData,
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || "Upload failed");
                  }
                  const data = await res.json();
                  toast.success(`Import complete! Created: ${data.created}, Updated: ${data.updated}`, {
                    id: toastId,
                    description: data.errors?.length ? `Errors: ${data.errors.length} rows skipped` : undefined,
                  });
                  fetchProducts();
                } catch (err) {
                  toast.error("Import failed", {
                    id: toastId,
                    description: String(err instanceof Error ? err.message : err),
                  });
                } finally {
                  // Reset input
                  e.target.value = "";
                }
              }}
            />
            <Button
              variant="outline"
              onClick={() => {
                const url = apiUrl("reports/inventory/export/xlsx");
                window.open(url, "_blank");
              }}
            >
              <Upload className="mr-2 size-4 rotate-180" />
              Export Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(apiUrl("inventory/template"), "_blank")}
            >
              <FileDown className="mr-2 size-4" />
              Download Template
            </Button>
            <Button
              variant="outline"
              onClick={() => document.getElementById("inventory-upload")?.click()}
            >
              <Upload className="mr-2 size-4" />
              Import Excel
            </Button>
            <Button className="bg-[#43B02A] hover:bg-[#3a9824]" onClick={openAdd}>
              <Plus className="mr-2 size-4" />
              Add Product
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <Card className="glass shadow-xl border-white/5 overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Buying Price</TableHead>
                  <TableHead>Selling Price</TableHead>
                  <TableHead>Margin</TableHead>
                  <TableHead>Stock Level</TableHead>
                  {!readOnly && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const min = p.min_stock_alert ?? 5;
                  const status = STOCK_STATUS.out(p.stock_quantity)
                    ? "out"
                    : STOCK_STATUS.low(p.stock_quantity, min)
                      ? "low"
                      : STOCK_STATUS.medium(p.stock_quantity, min)
                        ? "medium"
                        : "inStock";
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.name}
                        {p.item_discount_type && p.item_discount_value && (() => {
                          const now = Date.now();
                          const started = !p.item_discount_start || new Date(p.item_discount_start).getTime() <= now;
                          const active = !p.item_discount_expiry || new Date(p.item_discount_expiry).getTime() > now;
                          return started && active ? (
                            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                              {p.item_discount_type === "percent" ? `-${p.item_discount_value}% OFF` : `-${formatKsh(p.item_discount_value)}`}
                            </span>
                          ) : null;
                        })()}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">{p.barcode}</TableCell>
                      <TableCell className="font-mono">{formatKsh(p.price_buying)}</TableCell>
                      <TableCell className="font-mono">{formatKsh(p.price_selling)}</TableCell>
                      <TableCell>{marginPct(p.price_buying, p.price_selling)}%</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            status === "inStock" && "bg-emerald-500/10 text-emerald-600",
                            status === "medium" && "bg-amber-500/10 text-amber-600",
                            status === "low" && "bg-orange-500/10 text-orange-600",
                            status === "out" && "bg-rose-500/10 text-rose-600"
                          )}
                        >
                          {status === "inStock" && "In Stock"}
                          {status === "medium" && "Medium"}
                          {status === "low" && "Low Stock"}
                          {status === "out" && "Out of Stock"} {p.stock_quantity}
                        </span>
                      </TableCell>
                      {!readOnly && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                            title="Adjust Stock"
                            onClick={() => { setAdjustProduct(p); setAdjustChange(""); setAdjustReason("Correction"); }}
                          >
                            <ArrowUpDown className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => {
                              setEditing(p);
                              setForm({ ...p });
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                            onClick={() => handleDelete(p.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Stock Adjustment Dialog */}
      <Dialog open={!!adjustProduct} onOpenChange={(o) => !o && setAdjustProduct(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="size-4" />
              Adjust Stock — {adjustProduct?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Quantity Change</Label>
              <Input
                type="number"
                placeholder="e.g. -5 for removal, +10 for addition"
                value={adjustChange}
                onChange={(e) => setAdjustChange(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Current stock: <strong>{adjustProduct?.stock_quantity ?? 0}</strong>
                {adjustChange && !isNaN(parseInt(adjustChange)) && (
                  <> → New: <strong>{(adjustProduct?.stock_quantity ?? 0) + parseInt(adjustChange)}</strong></>
                )}
              </p>
            </div>
            <div>
              <Label>Reason</Label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              >
                <option>Correction</option>
                <option>Received</option>
                <option>Damage</option>
                <option>Expired</option>
                <option>Theft</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustProduct(null)}>Cancel</Button>
            <Button disabled={adjustSaving} onClick={handleStockAdjust}>
              {adjustSaving ? "Saving..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md glass animate-in shadow-2xl border-white/10 no-scrollbar">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto max-h-[70vh] pr-1">
            <div>
              <Label>Name <span className="text-rose-500">*</span></Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1"
                placeholder="e.g. Brookside Milk 500ml"
              />
            </div>
            <div>
              <Label>Barcode <span className="text-rose-500">*</span></Label>
              <Input
                value={form.barcode ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                className="mt-1 font-mono"
                disabled={!!(editing && editing.id)}
                placeholder="e.g. 6001059039614"
              />
            </div>
            <div>
              <Label>Description</Label>
              <textarea
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Optional product description"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                list="category-list"
                value={form.category ?? "General"}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="mt-1"
                placeholder="e.g. Beverages, Snacks, Dairy"
              />
              <datalist id="category-list">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Buying Price (KSh)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price_buying ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, price_buying: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Selling Price (KSh) <span className="text-rose-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price_selling ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, price_selling: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Stock Quantity</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.stock_quantity ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, stock_quantity: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Low Stock Alert</Label>
                <Input
                  type="number"
                  value={form.min_stock_alert ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, min_stock_alert: parseInt(e.target.value, 10) || 0 }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Wholesale Price (KSh)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.wholesale_price ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, wholesale_price: e.target.value ? Math.max(0, parseFloat(e.target.value)) : null }))}
                  className="mt-1"
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label>Wholesale Min Qty</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.wholesale_threshold ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, wholesale_threshold: e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : null }))}
                  className="mt-1"
                  placeholder="e.g. 12"
                />
              </div>
            </div>
            <div>
              <Label>Image URL</Label>
              <Input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={form.image_url ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value || null }))}
                className="mt-1"
              />
              {form.image_url && /^https?:\/\//i.test(form.image_url) && (
                <img
                  src={form.image_url}
                  alt="preview"
                  className="mt-2 h-16 rounded border object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>

            <div className="space-y-3 border p-3 rounded-lg bg-emerald-900/10 border-emerald-900/20">
              <div>
                <Label className="font-semibold text-emerald-600">Campaign Discount</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Applies automatically at checkout within the selected date window.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <select
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.item_discount_type || ""}
                    onChange={(e) => setForm((f) => ({ ...f, item_discount_type: e.target.value as "percent" | "fixed" | null || null }))}
                  >
                    <option value="">None</option>
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed (KSh)</option>
                  </select>
                </div>
                <div>
                  <Label>Value</Label>
                  <Input
                    type="number"
                    min="0"
                    step={form.item_discount_type === "percent" ? "1" : "0.01"}
                    value={form.item_discount_value ?? ""}
                    disabled={!form.item_discount_type}
                    onChange={(e) => setForm((f) => ({ ...f, item_discount_value: parseFloat(e.target.value) || null }))}
                    className="mt-1 disabled:opacity-50"
                    placeholder="e.g. 10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  Campaign Window (Optional)
                </Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <Label htmlFor="camp-start" className="text-sm whitespace-nowrap text-muted-foreground">From</Label>
                    <Input
                      id="camp-start"
                      type="date"
                      value={form.item_discount_start ? form.item_discount_start.slice(0, 10) : ""}
                      disabled={!form.item_discount_type}
                      onChange={(e) => setForm((f) => ({ ...f, item_discount_start: e.target.value || null }))}
                      className="flex-1 disabled:opacity-50"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <Label htmlFor="camp-end" className="text-sm whitespace-nowrap text-muted-foreground">To</Label>
                    <Input
                      id="camp-end"
                      type="date"
                      value={form.item_discount_expiry ? form.item_discount_expiry.slice(0, 10) : ""}
                      disabled={!form.item_discount_type}
                      onChange={(e) => {
                        if (e.target.value) {
                          const d = new Date(e.target.value);
                          d.setHours(23, 59, 59, 999);
                          setForm((f) => ({ ...f, item_discount_expiry: d.toISOString() }));
                        } else {
                          setForm((f) => ({ ...f, item_discount_expiry: null }));
                        }
                      }}
                      className="flex-1 disabled:opacity-50"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Leave blank to run the campaign indefinitely.</p>
              </div>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              className="bg-[#43B02A] hover:bg-[#3a9824]"
              disabled={saving}
              onClick={editing?.id ? handleSaveEdit : handleAdd}
            >
              {editing?.id ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
