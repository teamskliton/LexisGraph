import Link from "next/link";
import { FOOTER_LINKS } from "./landing-content";

export default function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      aria-labelledby="footer-heading"
      className="border-t border-border bg-surface"
    >
      <h2 id="footer-heading" className="sr-only">Footer</h2>

      <div className="landing-container py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">

          {/* Brand column */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-4">
            {/* Logo */}
            <Link href="/" aria-label="LexisGraph home" className="flex items-center gap-2">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <rect width="32" height="32" rx="8" fill="var(--primary)" />
                <circle cx="16" cy="16" r="3" fill="white" />
                <circle cx="8" cy="10" r="2" fill="white" opacity="0.7" />
                <circle cx="24" cy="10" r="2" fill="white" opacity="0.7" />
                <circle cx="8" cy="22" r="2" fill="white" opacity="0.7" />
                <circle cx="24" cy="22" r="2" fill="white" opacity="0.7" />
                <line x1="16" y1="16" x2="8" y2="10" stroke="white" strokeWidth="1.5" opacity="0.5" />
                <line x1="16" y1="16" x2="24" y2="10" stroke="white" strokeWidth="1.5" opacity="0.5" />
                <line x1="16" y1="16" x2="8" y2="22" stroke="white" strokeWidth="1.5" opacity="0.5" />
                <line x1="16" y1="16" x2="24" y2="22" stroke="white" strokeWidth="1.5" opacity="0.5" />
              </svg>
              <span className="text-base font-bold text-foreground">LexisGraph</span>
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Compliance intelligence for organizations that need clarity across regulations, policies, and evidence.
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map((col) => (
            <div key={col.heading} className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{col.heading}</h3>
              <ul className="flex flex-col gap-2" role="list">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-subtle-foreground">
            © {year} LexisGraph. All rights reserved.
          </p>
          <p className="text-xs text-subtle-foreground">
            Compliance Intelligence Platform
          </p>
        </div>
      </div>
    </footer>
  );
}
