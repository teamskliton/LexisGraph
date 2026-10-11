import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "LexisGraph — Compliance Intelligence for Modern Organizations",
  description:
    "LexisGraph connects regulations, requirements, policies, evidence, findings, and remediation — so your compliance team works from a single source of truth instead of scattered documents.",
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
  icons: {
    icon: "/logoL.jpg",
    shortcut: "/logoL.jpg",
    apple: "/logoL.jpg",
  },
};

/**
 * Public landing page — Server Component with metadata.
 * Renders the clean, high-performance 6-section B2B SaaS landing page.
 */
export default function Page() {
  return <LandingPage />;
}
