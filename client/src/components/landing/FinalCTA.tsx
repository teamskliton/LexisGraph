import Link from "next/link";

export default function FinalCTA() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="cta-gradient landing-section"
    >
      <div className="landing-container relative z-10 flex flex-col items-center text-center gap-6">
        {/* Headline */}
        <h2
          id="final-cta-heading"
          className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight"
          style={{ maxWidth: "700px" }}
        >
          Build a clearer path from regulation to resolution.
        </h2>

        <p className="text-base sm:text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.80)", maxWidth: "540px" }}>
          LexisGraph gives compliance teams the structure, traceability, and clarity they need to operate with confidence.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <Link
            href="/register"
            id="final-cta-register"
            className="inline-flex items-center gap-2 px-7 py-3.5 text-base font-semibold rounded-xl transition-all duration-150"
            style={{
              background: "white",
              color: "var(--primary)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            }}
          >
            Get Started
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/login"
            id="final-cta-login"
            className="inline-flex items-center gap-2 px-7 py-3.5 text-base font-medium rounded-xl border transition-all duration-150"
            style={{
              borderColor: "rgba(255,255,255,0.40)",
              color: "white",
              background: "rgba(255,255,255,0.10)",
            }}
          >
            Sign In
          </Link>
        </div>

        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          No credit card required · Role-based access · Organization-scoped
        </p>
      </div>
    </section>
  );
}
