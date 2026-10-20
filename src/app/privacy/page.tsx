import { canonicalUrl } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/privacy") },
  title: "Privacy policy | No Context Club",
  description: "How No Context Club handles information about visitors and customers."
};

export default function PrivacyPage() {
  return <main className="ncc-page ncc-legal-page">
    <SiteHeader />
    <article className="ncc-legal-content">
      <p className="ncc-microcopy">No Context Club · Legal</p>
      <h1>Privacy policy</h1>
      <p className="ncc-legal-intro">This explains how we use information when you browse, ask about shipping, buy a product or contact us.</p>

      <section>
        <h2>Who is responsible</h2>
        <p>No Context Club S.L., Calle San Pablo 71, 03012 Alicante, Spain, operates this store. For privacy questions or requests, email <a href="mailto:orders@funnyteesforall.com">orders@funnyteesforall.com</a>.</p>
      </section>

      <section>
        <h2>Information we use and why</h2>
        <p>When you request shipping or place an order, we use your name, email, phone number if provided, delivery address, chosen items and shipping choice to calculate delivery, process payment, make and deliver your order, and help with problems. These steps are necessary to respond to your request and perform our contract. Without the required details, we cannot quote or deliver an order.</p>
        <p>Our checkout is hosted by Stripe. We receive transaction references, payment status, amounts and refunds; you enter card details on Stripe’s page, not in our own order form. We keep the records required to account for transactions and meet applicable legal obligations.</p>
        <p>If you contact us, we use your message and any photos you choose to send to answer and resolve your request. Please do not send complete card details or unnecessary identity documents. We also process limited technical and security data, including IP addresses, request details and diagnostic records, to protect the store, investigate errors and defend legal claims. These activities rely on our legitimate interests, balanced against your rights.</p>
        <p>Transactional messages about an order are service emails, not marketing subscriptions. If you choose optional analytics in <Link href="/cookies">Cookie settings and policy</Link>, we use Google Analytics to measure visits and interactions on the home, catalog and product pages on the basis of your consent. These can include page views, scrolling, outbound link clicks and, where present, form starts or submissions, video engagement and file downloads. Analytics does not run on checkout, order confirmation or administration pages. We do not send form contents, order details, addresses or payment information to Analytics. Google Ads tracking is not enabled.</p>
      </section>

      <section>
        <h2>Who receives information</h2>
        <p>We use Vercel to host the store, Google Firebase to keep order records, Stripe to process payments, Resend to send service emails, Cloudflare to serve images, and production and delivery partners to quote and fulfil orders. Recipient and item details are shared with a delivery quotation provider when you request shipping, even if you do not buy. Providers may process data outside the European Economic Area. Transfer safeguards vary by provider and destination and may include adequacy decisions or EU standard contractual clauses. Email us to ask about a particular transfer and the applicable safeguards.</p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>We keep identifiable order, transaction and related service records while the order is being fulfilled and for the periods needed for accounting, consumer rights and legal claims. Spanish commercial records are generally retained for six years from the last relevant book entry; an unresolved claim or another legal duty can require a longer period. Deletion and restriction of older order records are reviewed manually, rather than performed automatically on that date. Messages about a customer issue are kept while the issue is open and then assessed against the same legal and claims criteria. Technical logs follow the hosting provider’s retention settings.</p>
        <p>Your analytics choice remains valid for 180 days from the decision; it does not renew merely because you visit again. An expired browser record is removed while the site is open or when you next visit, so it may remain stored longer if you do not return. Optional analytics cookies are configured for 180 days from when they are first set. The current Google Analytics property settings retain event data for 2 months and user data for 14 months; aggregated reports may remain available longer. You can withdraw analytics consent at any time using Cookie settings in the footer.</p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <p>Where applicable, you can ask to access, correct or delete your information, restrict or object to processing, or receive a portable copy. You may withdraw consent at any time without affecting earlier lawful processing. Email <a href="mailto:orders@funnyteesforall.com">orders@funnyteesforall.com</a>; we may ask for reasonable identity verification. You can complain to the <a href="https://www.aepd.es/" rel="noopener noreferrer">Spanish Data Protection Agency (AEPD)</a>.</p>
        <p>Payment and shipping checks can prevent an order from proceeding. Contact us if this happens and you need a person to review the issue. We do not use automated decisions that produce legal or similarly significant effects without human review.</p>
      </section>

      <p className="ncc-legal-updated">Last updated: 21 October 2026. See our <Link href="/cookies">Cookie policy</Link>.</p>
    </article>
  </main>;
}
