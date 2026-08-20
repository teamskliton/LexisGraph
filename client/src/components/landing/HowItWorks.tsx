import { HOW_IT_WORKS } from "./landing-content";

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="landing-section bg-background"
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="section-label justify-center">How It Works</div>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            Four steps from chaos to clarity.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "520px" }}>
            LexisGraph provides a structured path through every phase of the compliance lifecycle.
          </p>
        </div>

        {/* Steps — horizontal desktop, vertical mobile */}
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4 relative" role="list">
          {/* Horizontal connector (desktop only) */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-7 left-[12.5%] right-[12.5%] h-px"
            style={{ background: "linear-gradient(to right, var(--primary), var(--accent))", opacity: 0.3 }}
          />

          {HOW_IT_WORKS.map((step, i) => (
            <li
              key={step.step}
              className="flex flex-col items-center lg:items-center text-left lg:text-center gap-4 group"
            >
              {/* Step number badge */}
              <div
                className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center font-extrabold text-base border-2 transition-all duration-200 group-hover:scale-105"
                style={{
                  background: "var(--primary-subtle)",
                  borderColor: "var(--primary)",
                  color: "var(--primary)",
                  boxShadow: "0 0 0 6px var(--background)",
                }}
              >
                {step.step}
              </div>

              {/* Content */}
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-bold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
