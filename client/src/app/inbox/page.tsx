// /inbox — Dedicated Action Inbox Landing Page

"use client";

import React from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { ActionInboxWorkspace } from "@/components/inbox/ActionInboxWorkspace";

export default function InboxPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <ActionInboxWorkspace />
      </AppShell>
    </ProtectedRoute>
  );
}
