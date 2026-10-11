import Link from "next/link";
import { FOOTER_LINKS } from "./landing-content";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BrandLogo } from "@/components/ui/brand-logo";

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
            <Link href="/" aria-label="LexisGraph home" className="flex items-center gap-2.5 group">
              <BrandLogo size={32} />
              <span className="text-base font-bold text-foreground group-hover:text-primary transition-colors">LexisGraph</span>
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-subtle-foreground">
              Compliance Intelligence Platform
            </span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
