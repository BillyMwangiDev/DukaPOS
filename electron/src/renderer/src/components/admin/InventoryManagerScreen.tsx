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
import { Plus, Pencil, Trash2, Search, Upload } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

interface ProductRow {
  id: number;
  name: string;
  barcode: string;
  price_buying: number;
  price_selling: number;
  stock_quantity: number;
  min_stock_alert: number;
  wholesale_price?: number | null;
  wholesale_threshold?: number | null;
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
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState<Partial<ProductRow>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

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
  }, [fetchProducts]);

  const filtered = products.filter(
    (p) =>
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search)
  );

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

  const openAdd = () => {
    setForm({
      name: "",
      barcode: "",
      price_buying: 0,
      price_selling: 0,
      stock_quantity: 0,
      min_stock_alert: 5,
    });
    setEditing({ id: 0, name: "", barcode: "", price_buying: 0, price_selling: 0, stock_quantity: 0, min_stock_alert: 5 });
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
          price_buying: form.price_buying ?? 0,
          price_selling: form.price_selling ?? 0,
          stock_quantity: form.stock_quantity ?? 0,
          min_stock_alert: form.min_stock_alert ?? 5,
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
              onClick={() => toast.info("Bulk import", { description: "Use the Inventory tab from the main nav for Excel/CSV import." })}
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
          <option value="all">All Stock Levels</option>
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
                      <TableCell className="font-medium">{p.name}</TableCell>
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md glass animate-in shadow-2xl border-white/10 no-scrollbar">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Barcode</Label>
              <Input
                value={form.barcode ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                className="mt-1 font-mono"
                disabled={!!(editing && editing.id)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Buying Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price_buying ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, price_buying: parseFloat(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Selling Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price_selling ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, price_selling: parseFloat(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Stock Quantity</Label>
                <Input
                  type="number"
                  value={form.stock_quantity ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, stock_quantity: parseInt(e.target.value, 10) || 0 }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Min Stock Alert</Label>
                <Input
                  type="number"
                  value={form.min_stock_alert ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, min_stock_alert: parseInt(e.target.value, 10) || 0 }))}
                  className="mt-1"
                />
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
