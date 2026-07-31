import Link from "next/link";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const params = await searchParams;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">Pedido confirmado</div>
        <Link href="/">Volver</Link>
      </header>
      <section className="panel">
        <h1 className="success">Pago recibido</h1>
        <p>Tu pedido queda registrado y se enviara a Printful automaticamente cuando Stripe confirme el webhook.</p>
        {params.order_id ? <p className="muted">Order ID: {params.order_id}</p> : null}
      </section>
    </main>
  );
}
