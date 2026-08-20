import {
  Building2,
  KeyRound,
  FileLock2,
  ScrollText,
  GitMerge,
  ShieldHalf,
} from "lucide-react";
import { SECURITY_ITEMS } from "./landing-content";

const ICON_MAP: Record<string, React.ElementType> = {
  Building2,
  KeyRound,
  FileLock2,
  ScrollText,
  GitMerge,
  ShieldHalf,
};

export default function SecuritySection() {
  return (
    <section
      id="security"
      aria-labelledby="security-heading"
      className="landing-section"
      style={{ background: "var(--surface-muted)" }}
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center">Security & Control</div>
          <h2
            id="security-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            Your data stays yours.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "520px" }}>
            LexisGraph is designed with data isolation, role-based access, and full auditability as first-class requirements — not afterthoughts.
          </p>
        </div>

        {/* Icon grid — 3×2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SECURITY_ITEMS.map((item) => {
            const Icon = ICON_MAP[item.icon];
            return (
              <div
                key={item.title}
                className="flex gap-4 p-6 rounded-xl border border-border bg-surface transition-colors duration-150 hover:border-primary hover:bg-primary-subtle/30"
              >
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "var(--primary-subtle)", color: "var(--primary)" }}
                >
                  {Icon && <Icon className="w-4.5 h-4.5" aria-hidden="true" />}
                </div>
                {/* Content */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
