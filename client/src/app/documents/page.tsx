"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { Loader2 } from "lucide-react";

function DocumentsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "REGULATIONS") {
      router.replace("/regulations");
    } else {
      router.replace("/policies");
    }
  }, [router, searchParams]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <DocumentsRedirect />
      </Suspense>
    </ProtectedRoute>
  );
}
