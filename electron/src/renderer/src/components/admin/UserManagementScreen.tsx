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

interface UserRow {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
}

export function UserManagementScreen() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [addForm, setAddForm] = useState({ username: "", password: "", role: "cashier" as "admin" | "cashier", pin: "" });
  const [editForm, setEditForm] = useState({ role: "cashier" as "admin" | "cashier", pin: "", is_active: true });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("users"));
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async () => {
    if (!addForm.username.trim() || !addForm.password.trim() || addForm.pin.length < 4 || addForm.pin.length > 6) {
      toast.error("Username, password, and 4–6 digit PIN required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl("users"), {
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
      toast.success("User created");
      setAddOpen(false);
      setAddForm({ username: "", password: "", role: "cashier", pin: "" });
      fetchUsers();
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : "Create failed"));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (u: UserRow) => {
    setEditingUser(u);
    setEditForm({ role: u.role as "admin" | "cashier", pin: "", is_active: u.is_active });
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
      const res = await fetch(apiUrl(`users/${editingUser.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success("User updated");
      setEditOpen(false);
      setEditingUser(null);
      fetchUsers();
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
          <h1 className="text-3xl font-bold">Users & Staff Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage team members, roles, and permissions
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
          <Plus className="size-4" />
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff List</CardTitle>
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
                        "rounded px-2 py-0.5 text-xs font-medium",
                        u.role === "admin" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
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

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={addForm.role === "admin" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAddForm((f) => ({ ...f, role: "admin" }))}
                >
                  Admin
                </Button>
                <Button
                  type="button"
                  variant={addForm.role === "cashier" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAddForm((f) => ({ ...f, role: "cashier" }))}
                >
                  Cashier
                </Button>
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

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditingUser(null); setEditOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User {editingUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Role</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={editForm.role === "admin" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditForm((f) => ({ ...f, role: "admin" }))}
                >
                  Admin
                </Button>
                <Button
                  type="button"
                  variant={editForm.role === "cashier" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditForm((f) => ({ ...f, role: "cashier" }))}
                >
                  Cashier
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-pin">New PIN (4–6 digits, leave blank to keep)</Label>
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
                className="rounded border-border"
              />
              <Label htmlFor="edit-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
