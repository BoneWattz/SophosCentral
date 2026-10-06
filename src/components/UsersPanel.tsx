"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

interface UserRow {
  id: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
  lastSignInAt: string | null;
}

export default function UsersPanel({ currentEmail }: { currentEmail: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/users", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to load users");
      return;
    }
    setUsers(body.users);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to add user");
        return;
      }
      setMessage(`Added ${email}`);
      setEmail("");
      setPassword("");
      setRole("user");
      await load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(u: UserRow) {
    if (!confirm(`Delete ${u.email}?`)) return;
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to delete user");
      return;
    }
    await load();
  }

  return (
    <section className="card panel">
      <h2>User accounts</h2>

      <form className="inline-form" onSubmit={addUser}>
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password (min 8)"
          minLength={8}
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add user"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Last sign-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}</td>
                <td>
                  {u.email !== currentEmail && (
                    <button className="secondary" onClick={() => removeUser(u)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
