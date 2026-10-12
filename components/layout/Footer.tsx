import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border mt-2.5">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
        <p>© {new Date().getFullYear()} Tim Management — Centre d&apos;aide</p>
        <nav className="flex items-center gap-6 flex-wrap justify-center">
          <Link href="/" className="hover:text-foreground transition-colors">
            Accueil
          </Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">
            Nous contacter
          </Link>
          <a
            href="https://tim-management.co"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Site Tim Management
          </a>
          <a
            href={process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tim-management.co"}
            className="hover:text-foreground transition-colors"
          >
            Accéder au logiciel
          </a>
        </nav>
      </div>
    </footer>
  );
}
