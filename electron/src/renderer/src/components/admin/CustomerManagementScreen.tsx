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
import { Plus, Pencil, Banknote } from "lucide-react";
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
    const t = setTimeout(() => fetchCustomers(), 300);
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
                  {!readOnly && <TableHead className="w-[180px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 4 : 5} className="text-center text-muted-foreground">
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
    </div>
  );
}
