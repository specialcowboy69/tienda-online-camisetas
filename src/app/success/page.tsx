import Link from "next/link";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const params = await searchParams;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">No Context Club</div>
        <Link href="/">Back to shop</Link>
      </header>
      <section className="panel">
        <h1 className="success">Order confirmed</h1>
        <p>Payment received. Your order is registered and will be sent to Printful automatically after Stripe confirms the webhook.</p>
        {params.order_id ? <p className="muted">Order ID: {params.order_id}</p> : null}
      </section>
    </main>
  );
}
