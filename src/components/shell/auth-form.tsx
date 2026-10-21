"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode, inviteRequired = false }: { mode: "login" | "signup"; inviteRequired?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signup ? { name, email, password, ...(inviteRequired ? { inviteCode } : {}) } : { email, password }),
      });
      if (res.ok) {
        router.replace("/dashboard"); // New accounts see a one-time AWS setup link inline.
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? "Request failed. Try again.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-2 min-h-11 w-full rounded-[4px] border border-hairline bg-panel px-3 text-[14px]";
  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <h2 className="text-[22px] font-semibold tracking-tight">{signup ? "Create account" : "Sign in"}</h2>
      {signup && <>
        <label htmlFor="name" className="eyebrow mt-6 block">Name</label>
        <input id="name" name="name" type="text" autoComplete="name" maxLength={100} required value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </>}
      <label htmlFor="email" className="eyebrow mt-6 block">Email</label>
      <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      <label htmlFor="password" className="eyebrow mt-4 block">Password{signup ? " (min 10 characters)" : ""}</label>
      <input id="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 10 : undefined} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      {signup && inviteRequired && (
        <>
          <label htmlFor="invite" className="eyebrow mt-4 block">Invite code</label>
          <input id="invite" type="text" required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className={input} />
        </>
      )}
      {error && <p role="alert" className="mt-3 text-[12.5px] text-critical">{error}</p>}
      <button type="submit" disabled={busy || !email || !password || (signup && !name.trim())} className="mt-5 min-h-11 w-full rounded-[4px] bg-ink px-4 text-[13px] font-semibold text-white hover:bg-ink-2 disabled:opacity-50">
        {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
      </button>
      <p className="mt-4 text-[12.5px] text-muted">
        {signup ? "Already have an account? " : "New here? "}
        <Link href={signup ? "/login" : "/signup"} className="font-medium text-cobalt hover:underline">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
