import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Truck, Plus, Pencil, Trash2, Package, CheckCircle } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";

interface Supplier {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface POItem {
  product_id: number;
  qty_ordered: number;
  unit_cost: number;
}

interface PORead {
  id: number;
  supplier_id: number;
  status: string;
  created_at: string;
  total_cost: number;
  notes: string;
  items: { id: number; product_id: number; qty_ordered: number; qty_received: number; unit_cost: number }[];
}

interface ProductOption {
  id: number;
  name: string;
  barcode: string;
}

export function SuppliersScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSupplier, setEditSupplier] = useState<Partial<Supplier> | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PORead[]>([]);
  const [loadingPOs, setLoadingPOs] = useState(false);
  const [createPOOpen, setCreatePOOpen] = useState(false);
  const [poItems, setPoItems] = useState<POItem[]>([{ product_id: 0, qty_ordered: 1, unit_cost: 0 }]);
  const [poNotes, setPoNotes] = useState("");
  const [savingPO, setSavingPO] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("suppliers"));
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
    fetch(apiUrl("products"))
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setProducts([]));
  }, [fetchSuppliers]);

  const fetchPOs = useCallback(async (supplierId: number) => {
    setLoadingPOs(true);
    try {
      const res = await fetch(apiUrl(`suppliers/${supplierId}/purchase-orders`));
      const data = await res.json();
      setPurchaseOrders(Array.isArray(data) ? data : []);
    } catch {
      setPurchaseOrders([]);
    } finally {
      setLoadingPOs(false);
    }
  }, []);

  const handleSelectSupplier = (s: Supplier) => {
    setSelectedSupplier(s);
    fetchPOs(s.id);
  };

  const handleSaveSupplier = async () => {
    if (!editSupplier?.name?.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    setSaving(true);
    try {
      const isNew = !editSupplier.id;
      const url = isNew ? apiUrl("suppliers") : apiUrl(`suppliers/${editSupplier.id}`);
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editSupplier),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(isNew ? "Supplier added" : "Supplier updated");
      setEditSupplier(null);
      fetchSuppliers();
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSupplier = async (id: number) => {
    if (!confirm("Delete this supplier?")) return;
    try {
      const res = await fetch(apiUrl(`suppliers/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Supplier deleted");
      if (selectedSupplier?.id === id) setSelectedSupplier(null);
      fetchSuppliers();
    } catch (e) {
      toast.error("Delete failed", { description: String(e) });
    }
  };

  const handleCreatePO = async () => {
    if (!selectedSupplier) return;
    const validItems = poItems.filter((it) => it.product_id > 0 && it.qty_ordered > 0);
    if (validItems.length === 0) {
      toast.error("Add at least one product to the order");
      return;
    }
    setSavingPO(true);
    try {
      const res = await fetch(apiUrl(`suppliers/${selectedSupplier.id}/purchase-orders`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: validItems, notes: poNotes }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Purchase order created");
      setCreatePOOpen(false);
      setPoItems([{ product_id: 0, qty_ordered: 1, unit_cost: 0 }]);
      setPoNotes("");
      fetchPOs(selectedSupplier.id);
    } catch (e) {
      toast.error("Failed to create PO", { description: String(e) });
    } finally {
      setSavingPO(false);
    }
  };

  const handleReceivePO = async (poId: number) => {
    if (!confirm("Mark this order as received? Stock will be updated automatically.")) return;
    try {
      const res = await fetch(apiUrl(`suppliers/purchase-orders/${poId}/receive`), { method: "PUT" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Purchase order received — stock updated!");
      if (selectedSupplier) fetchPOs(selectedSupplier.id);
    } catch (e) {
      toast.error("Receive failed", { description: String(e) });
    }
  };

  return (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
          <Truck className="size-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Suppliers & Purchase Orders</h1>
          <p className="text-muted-foreground">Manage suppliers and restock inventory</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Supplier list */}
        <Card className="glass shadow-xl border-white/5">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-sm whitespace-nowrap">Suppliers</CardTitle>
              <Button size="sm" onClick={() => setEditSupplier({ name: "" })}>
                <Plus className="size-4 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : suppliers.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No suppliers yet</div>
            ) : (
              <div className="divide-y">
                {suppliers.map((s) => (
                  <div
                    key={s.id}
                    className={`p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors ${selectedSupplier?.id === s.id ? "bg-muted" : ""}`}
                    onClick={() => handleSelectSupplier(s)}
                  >
                    <div>
                      <div className="font-medium text-sm">{s.name}</div>
                      {s.phone && <div className="text-xs text-muted-foreground">{s.phone}</div>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="size-7"
                        onClick={(e) => { e.stopPropagation(); setEditSupplier({ ...s }); }}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-rose-600"
                        onClick={(e) => { e.stopPropagation(); handleDeleteSupplier(s.id); }}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Purchase Orders */}
        <div className="md:col-span-2 space-y-4">
          {selectedSupplier ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  Purchase Orders — {selectedSupplier.name}
                </h2>
                <Button size="sm" onClick={() => setCreatePOOpen(true)}>
                  <Package className="size-4 mr-1" />
                  Create PO
                </Button>
              </div>
              {loadingPOs ? (
                <div className="text-sm text-muted-foreground">Loading orders...</div>
              ) : purchaseOrders.length === 0 ? (
                <div className="text-sm text-muted-foreground">No purchase orders for this supplier.</div>
              ) : (
                <div className="space-y-3">
                  {purchaseOrders.map((po) => (
                    <Card key={po.id} className="glass border-white/5">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-mono text-xs text-muted-foreground">PO #{po.id}</span>
                            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${po.status === "received" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                              {po.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{formatKsh(po.total_cost)}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(po.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="h-7 text-xs">Product</TableHead>
                              <TableHead className="h-7 text-xs">Qty</TableHead>
                              <TableHead className="h-7 text-xs">Unit Cost</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {po.items.map((it) => {
                              const prod = products.find((p) => p.id === it.product_id);
                              return (
                                <TableRow key={it.id}>
                                  <TableCell className="text-sm">{prod?.name ?? `#${it.product_id}`}</TableCell>
                                  <TableCell className="text-sm">{it.qty_ordered}</TableCell>
                                  <TableCell className="text-sm">{formatKsh(it.unit_cost)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        {po.notes && <p className="text-xs text-muted-foreground mt-2">{po.notes}</p>}
                        {po.status === "pending" && (
                          <Button
                            size="sm"
                            className="mt-3 gap-1"
                            onClick={() => handleReceivePO(po.id)}
                          >
                            <CheckCircle className="size-4" />
                            Mark as Received
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Select a supplier to view purchase orders
            </div>
          )}
        </div>
      </div>

      {/* Supplier Edit/Add Dialog */}
      <Dialog open={!!editSupplier} onOpenChange={(o) => !o && setEditSupplier(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editSupplier?.id ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div>
              <Label>Name *</Label>
              <Input value={editSupplier?.name ?? ""} onChange={(e) => setEditSupplier((s) => ({ ...s, name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Contact Name</Label>
              <Input value={editSupplier?.contact_name ?? ""} onChange={(e) => setEditSupplier((s) => ({ ...s, contact_name: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={editSupplier?.phone ?? ""} onChange={(e) => setEditSupplier((s) => ({ ...s, phone: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={editSupplier?.email ?? ""} onChange={(e) => setEditSupplier((s) => ({ ...s, email: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={editSupplier?.address ?? ""} onChange={(e) => setEditSupplier((s) => ({ ...s, address: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSupplier(null)}>Cancel</Button>
            <Button disabled={saving} onClick={handleSaveSupplier}>
              {saving ? "Saving..." : editSupplier?.id ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create PO Dialog */}
      <Dialog open={createPOOpen} onOpenChange={setCreatePOOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Purchase Order — {selectedSupplier?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-96 overflow-y-auto">
            {poItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2 items-end">
                <div className="col-span-1">
                  <Label className="text-xs">Product</Label>
                  <select
                    className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    value={item.product_id}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      const prod = products.find((p) => p.id === v);
                      setPoItems((prev) => prev.map((it, i) => i === idx ? { ...it, product_id: v, unit_cost: it.unit_cost || 0 } : it));
                      void prod;
                    }}
                  >
                    <option value={0}>Select...</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" min={1} className="mt-1" value={item.qty_ordered}
                    onChange={(e) => setPoItems((prev) => prev.map((it, i) => i === idx ? { ...it, qty_ordered: parseInt(e.target.value) || 1 } : it))} />
                </div>
                <div>
                  <Label className="text-xs">Unit Cost (KSh)</Label>
                  <Input type="number" min={0} step="0.01" className="mt-1" value={item.unit_cost}
                    onChange={(e) => setPoItems((prev) => prev.map((it, i) => i === idx ? { ...it, unit_cost: parseFloat(e.target.value) || 0 } : it))} />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPoItems((p) => [...p, { product_id: 0, qty_ordered: 1, unit_cost: 0 }])}>
              <Plus className="size-4 mr-1" />
              Add Line
            </Button>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={poNotes} onChange={(e) => setPoNotes(e.target.value)} className="mt-1" placeholder="Optional notes..." />
            </div>
            <div className="text-sm font-semibold">
              Total: {formatKsh(poItems.reduce((sum, it) => sum + it.qty_ordered * it.unit_cost, 0))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePOOpen(false)}>Cancel</Button>
            <Button disabled={savingPO} onClick={handleCreatePO}>
              {savingPO ? "Creating..." : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
