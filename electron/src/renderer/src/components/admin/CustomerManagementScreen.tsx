import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Banknote, Star } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";

interface CustomerRow {
  id: number;
  name: string | null;
  phone: string | null;
  kra_pin?: string;
  current_balance: number;
  debt_limit: number;
  points_balance?: number;
  lifetime_points?: number;
}

interface CustomerManagementScreenProps {
  /** Cashier: read-only, hide add/edit/record payment */
  readOnly?: boolean;
}

export function CustomerManagementScreen({ readOnly = false }: CustomerManagementScreenProps) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null);
  const [paymentCustomer, setPaymentCustomer] = useState<CustomerRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [pointsCustomer, setPointsCustomer] = useState<CustomerRow | null>(null);
  const [pointsAmount, setPointsAmount] = useState("");
  const [pointsMode, setPointsMode] = useState<"add" | "redeem">("add");

  const [addForm, setAddForm] = useState({ name: "", phone: "", kra_pin: "", debt_limit: "0" });
  const [editForm, setEditForm] = useState({ name: "", phone: "", kra_pin: "", debt_limit: "0" });
  const [paymentAmount, setPaymentAmount] = useState("");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const url = search.trim()
        ? apiUrl(`customers?q=${encodeURIComponent(search.trim())}`)
        : apiUrl("customers");
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load customers");
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load customers");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => fetchCustomers(), 500);
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  const handleCreate = async () => {
    const debtLimit = parseFloat(addForm.debt_limit);
    if (Number.isNaN(debtLimit) || debtLimit < 0) {
      toast.error("Debt limit must be ≥ 0");
      return;
    }
    if (!addForm.name?.trim() && !addForm.phone?.trim()) {
      toast.error("Enter at least name or phone");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl("customers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name.trim() || null,
          phone: addForm.phone.trim() || null,
          debt_limit: debtLimit,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Create failed");
      }
      toast.success("Customer created");
      setAddOpen(false);
      setAddForm({ name: "", phone: "", kra_pin: "", debt_limit: "0" });
      fetchCustomers();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : "Create failed"));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c: CustomerRow) => {
    setEditingCustomer(c);
    setEditForm({
      name: c.name ?? "",
      phone: c.phone ?? "",
      kra_pin: c.kra_pin ?? "",
      debt_limit: String(c.debt_limit),
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingCustomer) return;
    const debtLimit = parseFloat(editForm.debt_limit);
    if (Number.isNaN(debtLimit) || debtLimit < 0) {
      toast.error("Debt limit must be ≥ 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`customers/${editingCustomer.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim() || null,
          phone: editForm.phone.trim() || null,
          kra_pin: editForm.kra_pin.trim() || null,
          debt_limit: debtLimit,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success("Customer updated");
      setEditOpen(false);
      setEditingCustomer(null);
      fetchCustomers();
    } catch {
      toast.error("Update failed");
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (c: CustomerRow) => {
    setPaymentCustomer(c);
    setPaymentAmount("");
    setPaymentOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!paymentCustomer) return;
    const amount = parseFloat(paymentAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        apiUrl(`customers/${paymentCustomer.id}/payment?amount=${encodeURIComponent(amount)}`),
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Payment failed");
      }
      const data = (await res.json()) as { new_balance: number };
      toast.success("Payment recorded", { description: `New balance: ${formatKsh(data.new_balance)}` });
      setPaymentOpen(false);
      setPaymentCustomer(null);
      setPaymentAmount("");
      fetchCustomers();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : "Payment failed"));
    } finally {
      setSaving(false);
    }
  };

  const openPoints = (c: CustomerRow) => {
    setPointsCustomer(c);
    setPointsAmount("");
    setPointsMode("add");
    setPointsOpen(true);
  };

  const handleAdjustPoints = async () => {
    if (!pointsCustomer) return;
    const amount = parseInt(pointsAmount, 10);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a positive integer for points");
      return;
    }
    setSaving(true);
    try {
      const delta = pointsMode === "add" ? amount : -amount;
      const res = await fetch(apiUrl(`customers/${pointsCustomer.id}/add-points`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: delta }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Failed");
      }
      toast.success(`Points ${pointsMode === "add" ? "added" : "redeemed"}`, {
        description: `${amount} pts ${pointsMode === "add" ? "added to" : "deducted from"} ${pointsCustomer.name ?? "customer"}`,
      });
      setPointsOpen(false);
      setPointsCustomer(null);
      fetchCustomers();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : "Failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Customers (Credit / Debtors)</CardTitle>
          {!readOnly && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add Customer
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search by name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Debt limit</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  {!readOnly && <TableHead className="w-[200px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 5 : 6} className="text-center text-muted-foreground">
                      No customers. Add one or search.
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.name ?? "—"}</TableCell>
                      <TableCell>{c.phone ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{formatKsh(c.current_balance)}</TableCell>
                      <TableCell className="text-right font-mono">{formatKsh(c.debt_limit)}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1 font-mono text-sm">
                          <Star className="size-3 text-amber-500" />
                          {c.points_balance ?? 0}
                        </span>
                      </TableCell>
                      {!readOnly && (
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openPayment(c)}
                              disabled={c.current_balance <= 0}
                              title={c.current_balance <= 0 ? "No balance to pay" : "Record payment"}
                            >
                              <Banknote className="size-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openPoints(c)}
                              title="Add / Redeem loyalty points"
                              className="text-amber-600 hover:text-amber-700"
                            >
                              <Star className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer (Debtor)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Name</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={addForm.phone}
                onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>KRA PIN (for eTIMS CSV)</Label>
              <Input
                value={addForm.kra_pin}
                onChange={(e) => setAddForm((f) => ({ ...f, kra_pin: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Debt limit (KSh)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={addForm.debt_limit}
                onChange={(e) => setAddForm((f) => ({ ...f, debt_limit: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label>KRA PIN (for eTIMS CSV)</Label>
              <Input
                value={editForm.kra_pin}
                onChange={(e) => setEditForm((f) => ({ ...f, kra_pin: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Debt limit (KSh)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editForm.debt_limit}
                onChange={(e) => setEditForm((f) => ({ ...f, debt_limit: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>{saving ? "Saving…" : "Update"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            {paymentCustomer && (
              <p className="text-sm text-muted-foreground">
                {paymentCustomer.name || paymentCustomer.phone || `Customer #${paymentCustomer.id}`} — Balance: {formatKsh(paymentCustomer.current_balance)}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Amount (KSh)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Amount received"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={saving || !paymentAmount.trim()}>
              {saving ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loyalty Points Dialog */}
      <Dialog open={pointsOpen} onOpenChange={setPointsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="size-5 text-amber-500" />
              Loyalty Points
            </DialogTitle>
            {pointsCustomer && (
              <p className="text-sm text-muted-foreground">
                {pointsCustomer.name || pointsCustomer.phone || `Customer #${pointsCustomer.id}`} — Current: {pointsCustomer.points_balance ?? 0} pts (Lifetime: {pointsCustomer.lifetime_points ?? 0})
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Action</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={pointsMode === "add"} onChange={() => setPointsMode("add")} />
                  <span className="text-sm text-emerald-600 font-medium">Add Points</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={pointsMode === "redeem"} onChange={() => setPointsMode("redeem")} />
                  <span className="text-sm text-rose-600 font-medium">Redeem Points</span>
                </label>
              </div>
            </div>
            <div>
              <Label>Points</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={pointsAmount}
                onChange={(e) => setPointsAmount(e.target.value)}
                placeholder="Number of points"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPointsOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAdjustPoints}
              disabled={saving || !pointsAmount.trim()}
              className={pointsMode === "add" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}
            >
              {saving ? "Saving…" : pointsMode === "add" ? "Add Points" : "Redeem Points"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
