// /compliance — Canonical Compliance Operations Overview Landing Page (Sprint 6.5)

"use client";

import React from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ComplianceOperationsOverview } from "@/components/compliance/ComplianceOperationsOverview";

export default function ComplianceOverviewPage() {
  return (
    <ProtectedRoute>
      <ComplianceOperationsOverview />
    </ProtectedRoute>
  );
}
