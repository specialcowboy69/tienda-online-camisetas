import Link from "next/link";

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const params = await searchParams;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">No Context Club</div>
        <Link href="/">Back to shop</Link>
      </header>
      <section className="panel">
        <h1>Checkout canceled</h1>
        <p>Payment canceled. You were not charged, and you can review your cart before trying again.</p>
        {params.order_id ? <p className="muted">Order ID: {params.order_id}</p> : null}
      </section>
    </main>
  );
}
