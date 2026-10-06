"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import DataTable, { type Column } from "./DataTable";
import { IconTrash } from "./icons";

interface UserRow {
  id: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
  lastSignInAt: string | null;
}

// Parses a JSON reply; if the server sent something else (e.g. a hosting error page),
// returns a readable message that includes the HTTP status.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return { error: `Server error (HTTP ${res.status}). Check the Netlify function logs.` };
  }
}

export default function UsersView({ currentEmail }: { currentEmail: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const body = await readJson(res);
      if (!res.ok) {
        setError(body.error ?? "Failed to load users");
        return;
      }
      setError(null);
      setUsers(body.users);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function removeUser(u: UserRow) {
    if (!confirm(`Delete ${u.email}?`)) return;
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    const body = await readJson(res);
    if (!res.ok) {
      setError(body.error ?? "Failed to delete user");
      return;
    }
    setMessage(`Deleted ${u.email}`);
    await load();
  }

  const columns: Column<UserRow>[] = [
    { header: "Email", render: (u) => u.email, sort: (u) => u.email },
    { header: "Role", render: (u) => <span className={`badge ${u.role}`}>{u.role}</span>, sort: (u) => u.role },
    {
      header: "Created",
      render: (u) => new Date(u.createdAt).toLocaleDateString(),
      sort: (u) => new Date(u.createdAt).getTime(),
    },
    {
      header: "Last sign-in",
      render: (u) => (u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"),
      sort: (u) => (u.lastSignInAt ? new Date(u.lastSignInAt).getTime() : null),
    },
  ];

  return (
    <>
      <div className="page-head">
        <h1>Users</h1>
        <div className="actions">
          <button className="btn" onClick={() => setOpen(true)}>
            + Add User
          </button>
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
      {message && <p className="success" style={{ marginBottom: 12 }}>{message}</p>}

      <DataTable
        columns={columns}
        rows={users}
        rowKey={(u) => u.id}
        searchText={(u) => u.email}
        searchPlaceholder="Search email…"
        filterOf={(u) => u.role}
        filterOptions={["admin", "user"]}
        filterLabel="All roles"
        loading={loading}
        emptyText="No users found"
        actions={(u) =>
          u.email === currentEmail ? null : (
            <button
              className="icon-btn danger"
              onClick={() => removeUser(u)}
              aria-label={`Delete ${u.email}`}
              title="Delete"
            >
              <IconTrash size={16} />
            </button>
          )
        }
      />

      {open && (
        <AddUserModal
          onClose={() => setOpen(false)}
          onAdded={async (email) => {
            setOpen(false);
            setError(null);
            setMessage(`Added ${email}`);
            await load();
          }}
        />
      )}
    </>
  );
}

function AddUserModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (email: string) => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setError(body.error ?? "Failed to add user");
        return;
      }
      await onAdded(email);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Add user</h2>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Adding…" : "Add user"}
          </button>
        </div>
      </form>
    </div>
  );
}
