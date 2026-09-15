import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="ncc-header">
      <Link className="ncc-brand" href="/">
        <span className="ncc-mark" aria-hidden="true">
          [ ]
        </span>
        <span>No Context Club</span>
      </Link>
      <nav className="ncc-nav" aria-label="Main navigation">
        <Link href="/products">Shop All</Link>
        <Link href="/#about">About</Link>
      </nav>
    </header>
  );
}
