import { redirect } from "next/navigation";
import { AuthForm } from "@/components/shell/auth-form";
import { AuthShell } from "@/components/shell/auth-shell";
import { getSessionUser } from "@/lib/auth/session";
import { loadServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/dashboard");
  const env = loadServerEnv();
  const enabled = env.ok && env.env.SIGNUP_ENABLED;
  return (
    <AuthShell>
      {enabled ? (
        <AuthForm mode="signup" inviteRequired={env.ok && Boolean(env.env.SIGNUP_INVITE_CODE)} />
      ) : (
        <div className="max-w-sm">
          <h2 className="text-[22px] font-semibold tracking-tight">Sign-up is closed</h2>
          <p className="mt-2 text-[13px] text-muted">This deployment does not accept new accounts.</p>
        </div>
      )}
    </AuthShell>
  );
}
