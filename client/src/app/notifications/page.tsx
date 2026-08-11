// /notifications — Notifications Workspace Landing Page (Sprint 6.9)

"use client";

import React from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { NotificationsWorkspace } from "@/components/notifications/NotificationsWorkspace";

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <NotificationsWorkspace />
    </ProtectedRoute>
  );
}
