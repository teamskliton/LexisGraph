import {
  BarChart3,
  FileSearch,
  Network,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { CAPABILITIES } from "./landing-content";

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3,
  FileSearch,
  Network,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
};

const COLOR_STYLES: Record<string, { bg: string; color: string }> = {
  primary: { bg: "var(--primary-subtle)",  color: "var(--primary)" },
  accent:  { bg: "var(--accent-subtle)",   color: "var(--accent)"  },
  info:    { bg: "var(--info-subtle)",     color: "var(--info)"    },
  warning: { bg: "var(--warning-subtle)",  color: "var(--warning)" },
  success: { bg: "var(--accent-subtle)",   color: "var(--accent)"  },
  danger:  { bg: "var(--danger-subtle)",   color: "var(--danger)"  },
};

export default function CapabilitiesSection() {
  return (
    <section
      id="capabilities"
      aria-labelledby="capabilities-heading"
      className="landing-section"
      style={{ background: "var(--surface-muted)" }}
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center">Capabilities</div>
          <h2
            id="capabilities-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            Everything compliance needs in one place.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "540px" }}>
            Built for teams that manage regulations, policies, and findings at scale.
          </p>
        </div>

        {/* 3×2 Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CAPABILITIES.map((cap) => {
            const Icon = ICON_MAP[cap.icon];
            const colors = COLOR_STYLES[cap.color] ?? COLOR_STYLES.primary;
            return (
              <div key={cap.title} className="feature-card p-6 flex flex-col gap-4">
                {/* Icon */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: colors.bg, color: colors.color }}
                >
                  {Icon && <Icon className="w-5 h-5" aria-hidden="true" />}
                </div>
                {/* Content */}
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-1.5">{cap.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{cap.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
