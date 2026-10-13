"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { organizationsService } from "@/services/api/organizations";
import { Skeleton } from "@/components/ui/skeleton";

function OrganizationsRedirectContent() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function redirectToWorkspace() {
      try {
        const storedId =
          typeof window !== "undefined"
            ? localStorage.getItem("selected_organization_id")
            : null;

        if (storedId) {
          router.replace(`/organizations/${storedId}`);
          return;
        }

        const orgs = await organizationsService.getOrganizations();
        if (!isMounted) return;

        if (orgs && orgs.length > 0) {
          if (typeof window !== "undefined") {
            localStorage.setItem("selected_organization_id", orgs[0].id);
            window.dispatchEvent(new Event("organization_changed"));
          }
          router.replace(`/organizations/${orgs[0].id}`);
        } else {
          router.replace("/dashboard");
        }
      } catch {
        if (isMounted) {
          router.replace("/dashboard");
        }
      }
    }

    redirectToWorkspace();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 space-y-4">
      <div className="space-y-3 w-full max-w-md text-center">
        <Skeleton className="h-7 w-48 mx-auto rounded-lg" />
        <Skeleton className="h-4 w-72 mx-auto rounded-md" />
        <div className="pt-4 grid grid-cols-3 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function OrganizationsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <OrganizationsRedirectContent />
      </AppShell>
    </ProtectedRoute>
  );
}
