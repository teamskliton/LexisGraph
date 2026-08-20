import {
  FileX2,
  GitBranchPlus,
  SearchX,
  CircleX,
} from "lucide-react";
import { PROBLEMS } from "./landing-content";

const ICON_MAP: Record<string, React.ElementType> = {
  FileX2,
  GitBranchPlus,
  SearchX,
  CircleX,
};

export default function ProblemSection() {
  return (
    <section
      id="about"
      aria-labelledby="problem-heading"
      className="landing-section bg-background"
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center">The Challenge</div>
          <h2
            id="problem-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            Compliance is harder than it should be.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "560px" }}>
            Most organizations manage compliance through a patchwork of tools and manual processes. The gaps this creates are real.
          </p>
        </div>

        {/* Problem cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PROBLEMS.map((problem) => {
            const Icon = ICON_MAP[problem.icon];
            return (
              <div key={problem.title} className="feature-card p-6 flex flex-col gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}
                >
                  {Icon && <Icon className="w-5 h-5" aria-hidden="true" />}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-1.5">{problem.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{problem.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
