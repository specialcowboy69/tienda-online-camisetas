import Link from "next/link";

export default async function SuccessPage(_props: { searchParams: Promise<{ order_id?: string }> }) {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">No Context Club</div>
        <Link href="/">Back to shop</Link>
      </header>
      <section className="panel">
        <h1 className="success">Payment received</h1>
        <p>We’re processing your order. We’ll email you with updates.</p>
      </section>
    </main>
  );
}
