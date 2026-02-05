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
import { Plus, Pencil } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

interface StaffRow {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
}

export function StaffManagementScreen() {
  const [users, setUsers] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [addForm, setAddForm] = useState({
    username: "",
    password: "",
    role: "cashier" as "admin" | "cashier" | "developer",
    pin: ""
  });
  const [editForm, setEditForm] = useState({
    role: "cashier" as "admin" | "cashier" | "developer",
    pin: "",
    is_active: true
  });

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("staff"));
      if (!res.ok) throw new Error("Failed to load staff");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load staff");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleCreate = async () => {
    if (!addForm.username.trim() || !addForm.password.trim() || addForm.pin.length < 4 || addForm.pin.length > 6) {
      toast.error("Username, password, and 4–6 digit PIN required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl("staff"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: addForm.username.trim(),
          password: addForm.password,
          role: addForm.role,
          pin: addForm.pin,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Create failed");
      }
      toast.success("Staff member created");
      setAddOpen(false);
      setAddForm({ username: "", password: "", role: "cashier", pin: "" });
      fetchStaff();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : "Create failed"));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (u: StaffRow) => {
    setEditingUser(u);
    setEditForm({ role: u.role as any, pin: "", is_active: u.is_active });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    const pinOk = editForm.pin === "" || (editForm.pin.length >= 4 && editForm.pin.length <= 6);
    if (!pinOk) {
      toast.error("PIN must be 4–6 digits or leave blank to keep current");
      return;
    }
    setSaving(true);
    try {
      const body: { role?: string; pin?: string; is_active?: boolean } = {
        role: editForm.role,
        is_active: editForm.is_active,
      };
      if (editForm.pin) body.pin = editForm.pin;
      const res = await fetch(apiUrl(`staff/${editingUser.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success("Staff member updated");
      setEditOpen(false);
      setEditingUser(null);
      fetchStaff();
    } catch {
      toast.error("Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">Staff Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage team members, roles, and administrative access
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
          <Plus className="size-4" />
          Add Staff
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "rounded px-2 py-0.5 text-xs font-medium uppercase",
                        u.role === "admin" ? "bg-primary/20 text-primary border border-primary/30" :
                          u.role === "developer" ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                            "bg-muted text-muted-foreground"
                      )}>
                        {u.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      {u.is_active ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                      ) : (
                        <span className="text-muted-foreground">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(u)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Staff Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="glass animate-in shadow-2xl border-white/10 no-scrollbar">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="add-username">Username</Label>
              <Input
                id="add-username"
                value={addForm.username}
                onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="e.g. cashier1"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-password">Password</Label>
              <Input
                id="add-password"
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <div className="flex flex-wrap gap-2">
                {(["admin", "cashier", "developer"] as const).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={addForm.role === r ? "default" : "outline"}
                    size="sm"
                    className="capitalize"
                    onClick={() => setAddForm((f) => ({ ...f, role: r }))}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-pin">PIN (4–6 digits)</Label>
              <Input
                id="add-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={addForm.pin}
                onChange={(e) => setAddForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))}
                placeholder="0000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Staff Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditingUser(null); setEditOpen(o); }}>
        <DialogContent className="glass animate-in shadow-2xl border-white/10 no-scrollbar">
          <DialogHeader>
            <DialogTitle>Edit Staff: {editingUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Role</Label>
              <div className="flex flex-wrap gap-2">
                {(["admin", "cashier", "developer"] as const).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={editForm.role === r ? "default" : "outline"}
                    size="sm"
                    className="capitalize"
                    onClick={() => setEditForm((f) => ({ ...f, role: r }))}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-pin">New PIN (4–6 digits, leave blank to keep current)</Label>
              <Input
                id="edit-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={editForm.pin}
                onChange={(e) => setEditForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))}
                placeholder="••••"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="rounded border-border accent-primary"
              />
              <Label htmlFor="edit-active">User is Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
