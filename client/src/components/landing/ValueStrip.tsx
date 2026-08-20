import { VALUE_STRIP } from "./landing-content";

export default function ValueStrip() {
  return (
    <section
      aria-label="Platform workflow summary"
      className="border-y border-border bg-surface-muted/40"
      style={{ paddingBlock: "2.25rem" }}
    >
      <div className="landing-container">
        <ol
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6"
          role="list"
        >
          {VALUE_STRIP.map((item, i) => (
            <li key={item.label} className="flex flex-col gap-2 relative">
              {/* Step number + connector */}
              <div className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                {/* Horizontal dash connector (desktop) */}
                {i < VALUE_STRIP.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="hidden lg:block flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent"
                  />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{item.label}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{item.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
