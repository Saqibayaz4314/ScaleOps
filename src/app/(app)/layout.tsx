import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Server-side gate: no AWS data is ever rendered for an unauthenticated request.
// (The API routes enforce the same check independently.)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar email={user.email} />
      <main className="min-w-0 flex-1 pb-16">{children}</main>
    </div>
  );
}
