import { PageHeader } from "@/components/shell/environment-strip";
import { getSessionUser } from "@/lib/auth/session";
import { getConnectionMeta } from "@/lib/db/connections";
import { ConnectionManager } from "./connection-manager";

export const dynamic = "force-dynamic";

export default async function ConnectionPage() {
  const user = await getSessionUser();
  const meta = user ? await getConnectionMeta(user.id) : null;
  return (
    <>
      <PageHeader
        title="AWS connection"
        lead="Connect one AWS account with read-only access keys. Keys are verified against AWS, then stored encrypted; they are never shown again."
      />
      <div className="px-4 pb-6 pt-3 sm:px-6 lg:px-9">
        <ConnectionManager initial={meta} />
      </div>
    </>
  );
}
