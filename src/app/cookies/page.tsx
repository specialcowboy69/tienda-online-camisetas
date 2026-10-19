import { canonicalUrl } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/cookies") },
  title: "Cookie policy | No Context Club",
  description: "Optional analytics, browser storage and cookie choices at No Context Club."
};

export default function CookiesPage() {
  return <main className="ncc-page ncc-legal-page">
    <SiteHeader />
    <article className="ncc-legal-content">
      <p className="ncc-microcopy">No Context Club · Legal</p>
      <h1>Cookie policy</h1>
      <p className="ncc-legal-intro">You can browse and buy without allowing optional analytics. Our footer has a Cookie settings button you can use to make or change your choice.</p>

      <section>
        <h2>Storage used by this store</h2>
        <div className="ncc-legal-table-wrap">
          <table>
            <thead><tr><th scope="col">Technology</th><th scope="col">Purpose and provider</th><th scope="col">Duration and choice</th></tr></thead>
            <tbody>
              <tr><th scope="row">Browser preference (<code>ncc.analytics-consent.v1</code>)</th><td>Stores your accept or reject decision, its date and version in localStorage on this site. This does not identify you and does not itself activate measurement.</td><td>180 days from your choice; needed to remember it.</td></tr>
              <tr><th scope="row">Google Analytics cookies (<code>ncc_ga</code> and <code>ncc_ga_*</code>)</th><td>Configured first-party cookies for recognising a browser and its sessions on our domain. Google Analytics receives visits to the home, catalog and product pages only after you accept analytics.</td><td>Configured to expire after 180 days without renewal on each visit. Optional: reject or withdraw at any time.</td></tr>
              <tr><th scope="row">Hosted checkout</th><td>Stripe runs payment on its own website and may use technologies needed for payment, security or fraud prevention under its own <a href="https://stripe.com/privacy" rel="noopener noreferrer">privacy notice</a>.</td><td>Stripe controls its own storage and provides its applicable details.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>How your choice works</h2>
        <p>Google Analytics is optional. Before you accept, this store does not load its tag or send analytics requests. Rejecting keeps analytics off. Accepting allows the tag on eligible store pages; withdrawing stops further measurement and removes the analytics cookies this store controls. A request already sent cannot be recalled. Advertising storage and Google Ads tracking stay off.</p>
        <p>Open <strong>Cookie settings</strong> in the footer to accept, reject or withdraw. If Analytics is temporarily unavailable, the settings explain that state. Changing browser settings can also remove stored information, but browser controls do not replace the choice we offer here.</p>
      </section>

      <section>
        <h2>Other services</h2>
        <p>Our site serves product images from an external image host, and our hosting and security services may receive technical request information. The shopping bag is kept in page state rather than a persistent browser cookie. Visiting Stripe Checkout takes you to a separate site, where its own technologies and policies apply.</p>
        <p>For personal data, recipients, retention and your rights, see our <Link href="/privacy">Privacy policy</Link>. You can ask us at <a href="mailto:orders@funnyteesforall.com">orders@funnyteesforall.com</a>.</p>
      </section>

      <p className="ncc-legal-updated">Last updated: 19 October 2026.</p>
    </article>
  </main>;
}
