// /compliance/my-work — My Work Workspace Landing Page (Sprint 6.6)

"use client";

import React from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { MyWorkWorkspace } from "@/components/compliance/MyWorkWorkspace";

export default function MyWorkPage() {
  return (
    <ProtectedRoute>
      <MyWorkWorkspace />
    </ProtectedRoute>
  );
}
