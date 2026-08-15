// /compliance/my-work — My Work Workspace Landing Page (Sprint 6.6)

"use client";

import React, { Suspense } from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { MyWorkWorkspace } from "@/components/compliance/MyWorkWorkspace";

export default function MyWorkPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading workspace...</div>}>
        <MyWorkWorkspace />
      </Suspense>
    </ProtectedRoute>
  );
}
