"use client";

// Operator console (M3, restyled pop-brutalist in M9). Gated by ADMIN_SECRET (entered here,
// sent as the x-admin-secret header). Drives the live demo: seed, lifecycle, seed-RNG, draw,
// reset, and a CROSS-SURFACE entry view (web World ID + agent AgentKit entries side by side).
import { useCallback, useState } from "react";

type Variant = { id: string; name: string; sku: string | null; stock: number };
type Drop = {
  id: string;
  name: string;
  status: string;
  totalSlots: number;
  priceUsdc: string;
  drawSeed: string | null;
  closesAt: string | null;
  variants: Variant[];
};
type EntryRow = {
  id: string;
  source: string;
  status: string;
  humanKey: string;
  walletAddress: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-white",
  won: "bg-lime",
  lost: "bg-muted",
  purchased: "bg-pop-blue text-white",
  expired: "bg-muted",
};

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [drops, setDrops] = useState<Drop[]>([]);
  const [entriesByDrop, setEntriesByDrop] = useState<Record<string, EntryRow[]>>({});
  const [log, setLog] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const headers = useCallback(
    () => ({ "content-type": "application/json", "x-admin-secret": secret }),
    [secret],
  );

  const append = (msg: string) =>
    setLog((l) => `${new Date().toISOString().slice(11, 19)}  ${msg}\n${l}`);

  const loadEntries = useCallback(
    async (dropId: string) => {
      try {
        const res = await fetch(`/api/admin/drops/${dropId}/entries`, { headers: headers() });
        if (!res.ok) return;
        const data = await res.json();
        setEntriesByDrop((m) => ({ ...m, [dropId]: data.entries ?? [] }));
      } catch {
        /* ignore */
      }
    },
    [headers],
  );

  const refresh = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/drops", { headers: headers() });
      if (res.status === 401) {
        append("401 unauthorized — check the secret");
        setDrops([]);
        return;
      }
      const data = await res.json();
      const list: Drop[] = data.drops ?? [];
      setDrops(list);
      append(`loaded ${list.length} drops`);
      await Promise.all(list.map((d) => loadEntries(d.id)));
    } catch (e) {
      append(`error: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [secret, headers, loadEntries]);

  const action = async (path: string, method = "POST", body?: unknown) => {
    setLoading(true);
    try {
      const res = await fetch(path, {
        method,
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      append(`${method} ${path} → ${res.status} ${JSON.stringify(data).slice(0, 180)}`);
      await refresh();
    } catch (e) {
      append(`error: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
      <header className="flex items-center justify-between border-b-[3px] border-ink pb-4">
        <h1 className="display text-3xl sm:text-4xl">ADMIN · RESET CONSOLE</h1>
        <a href="/" className="pill brutal-hover">
          ← Site
        </a>
      </header>
      <p className="text-sm font-medium text-muted-foreground">
        Operator plane. Enter the admin secret to load drops, run draws, and reset for a fresh
        demo. Entries below show both web (World ID) and agent (AgentKit) surfaces.
      </p>

      <div className="flex flex-wrap gap-3">
        <input
          type="password"
          placeholder="ADMIN_SECRET"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="min-w-[220px] flex-1 border-[3px] border-ink bg-white px-4 py-3 font-mono text-sm outline-none focus:bg-lime/20"
        />
        <button
          onClick={refresh}
          disabled={loading || !secret}
          className="border-[3px] border-ink bg-lime px-5 py-3 font-extrabold uppercase brutal-hover disabled:opacity-50"
        >
          Load
        </button>
        <button
          onClick={() => action("/api/admin/seed")}
          disabled={loading || !secret}
          className="border-[3px] border-ink bg-white px-5 py-3 font-extrabold uppercase brutal-hover disabled:opacity-50"
        >
          Seed demo
        </button>
        <button
          onClick={() =>
            // One-button reset-to-demo-start (M10). The :id is ignored — the action resolves
            // the demo drops by name. Falls back to a placeholder id if none are loaded.
            action(`/api/admin/drops/${drops[0]?.id ?? "demo"}/reset-demo`)
          }
          disabled={loading || !secret}
          className="border-[3px] border-ink bg-pop-blue px-5 py-3 font-extrabold uppercase text-white brutal-hover disabled:opacity-50"
        >
          ⟳ Reset demo
        </button>
      </div>

      {drops.map((d) => {
        const rows = entriesByDrop[d.id] ?? [];
        const web = rows.filter((r) => r.source === "web").length;
        const agent = rows.filter((r) => r.source === "agent").length;
        return (
          <div key={d.id} className="brutal flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="display text-2xl">{d.name}</span>
              <span className="pill bg-lime">{d.status}</span>
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              id={d.id} · {d.priceUsdc} USDC · {d.totalSlots} slot(s) · seed=
              {d.drawSeed ?? "—"} · variants: {d.variants.map((v) => v.name).join(", ") || "none"}
            </div>

            {/* Cross-surface entry view */}
            <div className="flex flex-col gap-2 border-[3px] border-ink p-3">
              <div className="flex items-center gap-3 text-xs font-extrabold uppercase">
                <span>Entries: {rows.length}</span>
                <span className="pill">web {web}</span>
                <span className="pill bg-pop-blue text-white">agent {agent}</span>
              </div>
              {rows.length === 0 ? (
                <span className="text-xs text-muted-foreground">no entries</span>
              ) : (
                <div className="flex flex-col gap-1">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 border-2 border-ink px-2 py-1 font-mono text-[11px]"
                    >
                      <span
                        className={`px-1.5 py-0.5 font-bold uppercase ${
                          r.source === "agent" ? "bg-pop-blue text-white" : "bg-lime"
                        }`}
                      >
                        {r.source}
                      </span>
                      <span className="flex-1 truncate">{r.humanKey}</span>
                      <span
                        className={`px-1.5 py-0.5 font-bold uppercase ${
                          STATUS_COLORS[r.status] ?? "bg-white"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                ["open", `/api/admin/drops/${d.id}/open`],
                ["close", `/api/admin/drops/${d.id}/close`],
                ["draw", `/api/admin/drops/${d.id}/draw`],
                ["reset", `/api/admin/drops/${d.id}/reset`],
                ["flip", `/api/admin/drops/${d.id}/flip`],
              ].map(([label, path]) => (
                <button
                  key={label}
                  className="border-2 border-ink bg-white px-3 py-1.5 text-xs font-extrabold uppercase brutal-hover"
                  onClick={() => action(path)}
                >
                  {label}
                </button>
              ))}
              <button
                className="border-2 border-ink bg-white px-3 py-1.5 text-xs font-extrabold uppercase brutal-hover"
                onClick={() => {
                  const seed = prompt("RNG seed (blank to clear):") ?? "";
                  action(`/api/admin/drops/${d.id}/seed`, "POST", { seed: seed || null });
                }}
              >
                set seed
              </button>
              <button
                className="border-2 border-ink bg-white px-3 py-1.5 text-xs font-extrabold uppercase brutal-hover"
                onClick={() =>
                  action(`/api/admin/drops/${d.id}/dummy-entry`, "POST", {
                    humanKey: `dummy-${Math.random().toString(36).slice(2, 8)}`,
                  })
                }
              >
                + dummy
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex flex-col gap-2">
        <h2 className="display text-xl">Log</h2>
        <pre className="max-h-72 overflow-auto border-[3px] border-ink bg-ink p-3 text-xs whitespace-pre-wrap text-lime">
          {log || "(no actions yet)"}
        </pre>
      </div>
    </main>
  );
}
