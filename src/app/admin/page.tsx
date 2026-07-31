import Link from "next/link";
import { AdminPanel } from "@/components/admin-panel";

export default function AdminPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">Operaciones</div>
        <Link href="/">Tienda</Link>
      </header>
      <AdminPanel />
    </main>
  );
}
