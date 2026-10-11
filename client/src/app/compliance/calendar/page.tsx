"use client";

import React from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { ComplianceCalendarWorkspace } from "@/components/compliance/ComplianceCalendarWorkspace";

export default function ComplianceCalendarPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <ComplianceCalendarWorkspace />
      </AppShell>
    </ProtectedRoute>
  );
}
