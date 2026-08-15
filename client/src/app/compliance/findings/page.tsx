"use client";

import React, { Suspense } from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { MyWorkWorkspace } from "@/components/compliance/MyWorkWorkspace";

export default function ComplianceFindingsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading compliance findings...</div>}>
        <MyWorkWorkspace initialView="ALL_FINDINGS" />
      </Suspense>
    </ProtectedRoute>
  );
}
