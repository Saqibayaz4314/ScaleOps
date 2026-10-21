import { redirect } from "next/navigation";
import { AuthForm } from "@/components/shell/auth-form";
import { AuthShell } from "@/components/shell/auth-shell";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <AuthShell>
      <AuthForm mode="login" />
    </AuthShell>
  );
}
