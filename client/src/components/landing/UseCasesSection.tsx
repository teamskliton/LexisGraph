import {
  Scale,
  Shield,
  Briefcase,
  Rocket,
} from "lucide-react";
import { USE_CASES } from "./landing-content";

const ICON_MAP: Record<string, React.ElementType> = {
  Scale,
  Shield,
  Briefcase,
  Rocket,
};

export default function UseCasesSection() {
  return (
    <section
      aria-labelledby="use-cases-heading"
      className="landing-section bg-background"
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center">Who It's For</div>
          <h2
            id="use-cases-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            Built for teams that take compliance seriously.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "520px" }}>
            LexisGraph works for any team that needs to track regulatory obligations and demonstrate compliance.
          </p>
        </div>

        {/* Use case cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {USE_CASES.map((uc) => {
            const Icon = ICON_MAP[uc.icon];
            return (
              <div
                key={uc.title}
                className="feature-card p-6 flex flex-col gap-4 text-center items-center"
              >
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--primary-subtle)", color: "var(--primary)" }}
                >
                  {Icon && <Icon className="w-6 h-6" aria-hidden="true" />}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-2">{uc.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{uc.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
