export const dynamic = "force-dynamic";

// The parent layout enforces login and each API authenticates independently.
// Missing AWS setup is an inline state, not a redirect that hijacks navigation.
export default function ConnectedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
