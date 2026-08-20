import type { Metadata } from "next";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import ValueStrip from "@/components/landing/ValueStrip";
import ProblemSection from "@/components/landing/ProblemSection";
import SolutionFlow from "@/components/landing/SolutionFlow";
import HowItWorks from "@/components/landing/HowItWorks";
import CapabilitiesSection from "@/components/landing/CapabilitiesSection";
import KnowledgeGraphShowcase from "@/components/landing/KnowledgeGraphShowcase";
import FindingLifecycle from "@/components/landing/FindingLifecycle";
import RolesSection from "@/components/landing/RolesSection";
import SecuritySection from "@/components/landing/SecuritySection";
import UseCasesSection from "@/components/landing/UseCasesSection";
import DifferentiationSection from "@/components/landing/DifferentiationSection";
import ProductPreview from "@/components/landing/ProductPreview";
import FinalCTA from "@/components/landing/FinalCTA";
import LandingFooter from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "LexisGraph — Compliance Intelligence for Modern Organizations",
  description:
    "LexisGraph connects regulations, policies, evidence, findings, and remediation to help organizations understand and manage compliance with full traceability.",
  openGraph: {
    title: "LexisGraph — Compliance Intelligence for Modern Organizations",
    description:
      "Turn regulatory complexity into compliance clarity. LexisGraph maps every compliance relationship — from regulation to resolution — in one connected platform.",
    type: "website",
    siteName: "LexisGraph",
  },
  twitter: {
    card: "summary_large_image",
    title: "LexisGraph — Compliance Intelligence",
    description:
      "Turn regulatory complexity into compliance clarity with LexisGraph.",
  },
};

/**
 * Public landing page — Server Component.
 * No auth check; unauthenticated users see this page.
 * Authenticated users can navigate to /dashboard from the navbar after login.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <LandingNavbar />

      {/* Main content */}
      <main id="main-content">
        {/* Skip link target */}
        <HeroSection />
        <ValueStrip />
        <ProblemSection />
        <SolutionFlow />
        <HowItWorks />
        <CapabilitiesSection />
        <KnowledgeGraphShowcase />
        <FindingLifecycle />
        <ProductPreview />
        <RolesSection />
        <UseCasesSection />
        <DifferentiationSection />
        <SecuritySection />
        <FinalCTA />
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}
