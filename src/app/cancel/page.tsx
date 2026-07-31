import Link from "next/link";

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const params = await searchParams;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">Checkout cancelado</div>
        <Link href="/">Volver</Link>
      </header>
      <section className="panel">
        <h1>Pago cancelado</h1>
        <p>No se ha cobrado el pedido. Puedes revisar el carrito y volver a intentarlo.</p>
        {params.order_id ? <p className="muted">Order ID: {params.order_id}</p> : null}
      </section>
    </main>
  );
}
