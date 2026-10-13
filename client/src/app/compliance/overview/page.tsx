// /compliance/overview — Canonical Compliance Operations Overview Landing Page (Sprint 6.5)

"use client";

import React from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ComplianceOperationsOverview } from "@/components/compliance/ComplianceOperationsOverview";
import { useAuth } from "@/context/auth-context";

export default function ComplianceOperationsOverviewSubRoutePage() {
  const { activeMembership } = useAuth();
  const activeOrgId = activeMembership?.organization_id;

  return (
    <ProtectedRoute>
      <ComplianceOperationsOverview key={activeOrgId || "no-org"} />
    </ProtectedRoute>
  );
}
