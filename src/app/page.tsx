import Link from "next/link";
import { Storefront } from "@/components/storefront";
import { env, getAllowedShippingCountries } from "@/lib/env";
import { listCatalogProducts } from "@/lib/firestore";
import { CatalogProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let products: CatalogProduct[] = [];
  let setupError = "";

  try {
    products = await listCatalogProducts();
  } catch (error) {
    setupError = error instanceof Error ? error.message : "Catalog is not available yet.";
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">Tienda Camisetas</div>
        <nav>
          <Link href="/admin">Admin</Link>
        </nav>
      </header>

      {setupError ? (
        <section className="notice">
          Firebase is not configured yet or the catalog has not been synced. Add environment variables, then run the catalog sync from Admin.
          <br />
          <span className="muted">{setupError}</span>
        </section>
      ) : null}

      <Storefront
        products={products}
        allowedCountries={getAllowedShippingCountries()}
        defaultCountry={env.ALLOWED_SHIPPING_COUNTRIES.split(",")[0]?.trim().toUpperCase() || "ES"}
      />
    </main>
  );
}
