import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tags, Plus, Pencil, Trash2, Calendar } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";

const formatKsh = (amount: number) => `KSh ${amount.toFixed(2)}`;

interface Discount {
  id: number;
  name: string;
  discount_type: "percent" | "fixed";
  value: number;
  scope: "order" | "item";
  is_active: boolean;
  code: string | null;
  start_date: string | null;
  end_date: string | null;
}

export function DiscountsScreen() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState(0);
  const [code, setCode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchDiscounts = async () => {
    try {
      // active_only=false to get ALL discounts for management
      const res = await fetch(apiUrl("discounts?active_only=false"));
      if (res.ok) {
        const data = await res.json();
        setDiscounts(data);
      }
    } catch (e) {
      toast.error("Failed to fetch discounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscounts();
  }, []);

  const resetForm = () => {
    setName("");
    setDiscountType("percent");
    setValue(0);
    setCode("");
    setIsActive(true);
    setStartDate("");
    setEndDate("");
    setEditingId(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (d: Discount) => {
    setName(d.name);
    setDiscountType(d.discount_type);
    setValue(d.value);
    setCode(d.code || "");
    setIsActive(d.is_active);
    setStartDate(d.start_date || "");
    setEndDate(d.end_date || "");
    setEditingId(d.id);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Name is required");
    if (value <= 0) return toast.error("Value must be greater than 0");
    if (discountType === "percent" && value > 100) return toast.error("Percentage cannot exceed 100");

    if (startDate && endDate && endDate < startDate) {
      return toast.error("End date cannot be before start date");
    }

    const payload = {
      name: name.trim(),
      discount_type: discountType,
      value,
      scope: "order",
      code: code.trim() || null,
      is_active: isActive,
      start_date: startDate || null,
      end_date: endDate || null,
    };

    try {
      const url = editingId ? apiUrl(`discounts/${editingId}`) : apiUrl("discounts");
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editingId ? "Discount updated" : "Discount created");
        setIsDialogOpen(false);
        fetchDiscounts();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Failed to save discount");
      }
    } catch (e) {
      toast.error("Network error");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to permanently delete this discount?")) return;
    try {
      const res = await fetch(apiUrl(`discounts/${id}`), { method: "DELETE" });
      if (res.ok) {
        toast.success("Discount deleted");
        fetchDiscounts();
      } else {
        toast.error("Failed to delete discount");
      }
    } catch (e) {
      toast.error("Network error");
    }
  };

  const toggleActive = async (d: Discount, newActive: boolean) => {
    try {
      const res = await fetch(apiUrl(`discounts/${d.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newActive }),
      });
      if (res.ok) {
        toast.success(`Discount ${newActive ? "activated" : "deactivated"}`);
        fetchDiscounts();
      } else {
        toast.error("Failed to toggle status");
      }
    } catch (e) {
      toast.error("Network error");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl animate-in fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#43B02A]/10 text-[#43B02A]">
            <Tags className="size-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Discounts & Promos</h1>
            <p className="text-muted-foreground">Manage order presets, percentages, and promo codes.</p>
          </div>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2 bg-[#43B02A] hover:bg-[#3a9824] text-white">
          <Plus className="size-4" />
          Add Discount
        </Button>
      </div>

      <Card className="glass border-white/5 shadow-xl">
        <CardHeader>
          <CardTitle>Available Discounts</CardTitle>
          <CardDescription>All your configured discounts that cashiers can apply.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-slate-800">
            <Table>
              <TableHeader className="bg-slate-900/50">
                <TableRow>
                  <TableHead>Active</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Promo Code</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : discounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No discounts found. Click "Add Discount" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  discounts.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4 rounded accent-[#43B02A]"
                          checked={d.is_active}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => toggleActive(d, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="capitalize">{d.discount_type}</TableCell>
                      <TableCell>
                        {d.discount_type === "percent" ? `${d.value}%` : formatKsh(d.value)}
                      </TableCell>
                      <TableCell>
                        {d.code ? (
                          <span className="bg-secondary px-2 py-1 rounded text-xs font-mono">{d.code}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {d.start_date || d.end_date ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3 shrink-0" />
                            {d.start_date ?? "∞"} → {d.end_date ?? "∞"}
                          </span>
                        ) : (
                          <span>Always</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(d)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => handleDelete(d.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Discount" : "Create Discount"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Discount Name</Label>
              <Input
                placeholder="e.g. Employee Discount, Boxing Day"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={discountType} onValueChange={(v: "percent" | "fixed") => setDiscountType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{discountType === "percent" ? "Percentage (%)" : "Amount (KSh)"}</Label>
                <Input
                  type="number"
                  min="0"
                  step={discountType === "percent" ? "1" : "0.01"}
                  value={value || ""}
                  onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Promo Code (Optional)</Label>
              <Input
                placeholder="e.g. SAVE20"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <p className="text-xs text-muted-foreground">If provided, cashiers can type this code at checkout to apply it.</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Validity Window (Optional)
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <Label htmlFor="disc-start" className="text-sm whitespace-nowrap text-muted-foreground">From</Label>
                  <Input
                    id="disc-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <Label htmlFor="disc-end" className="text-sm whitespace-nowrap text-muted-foreground">To</Label>
                  <Input
                    id="disc-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Leave blank for a discount that never expires.</p>
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3 mt-2 bg-slate-900/30">
              <div className="space-y-0.5">
                <Label>Active Status</Label>
                <p className="text-xs text-muted-foreground">Cashiers can only use active discounts.</p>
              </div>
              <input
                type="checkbox"
                className="size-5 rounded accent-[#43B02A]"
                checked={isActive}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsActive(e.target.checked)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingId ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
