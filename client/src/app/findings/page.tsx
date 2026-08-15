"use client";

import React, { Suspense } from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { MyWorkWorkspace } from "@/components/compliance/MyWorkWorkspace";

export default function FindingsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading findings workspace...</div>}>
        <MyWorkWorkspace initialView="ALL_FINDINGS" />
      </Suspense>
    </ProtectedRoute>
  );
}
