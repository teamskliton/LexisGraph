"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Building2,
  UserCheck,
  Shield,
  Clock,
  AlertTriangle,
  Loader2,
  ArrowRight,
  UserPlus,
  LogIn,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { format } from "date-fns";

import { useAuth } from "@/context/auth-context";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  organizationsService,
  InvitationDetailsResponse,
} from "@/services/api/organizations";

function formatRoleLabel(role: string) {
  const normalized = role.toUpperCase();
  if (normalized === "ADMIN" || normalized === "ORGANIZATION_ADMIN" || normalized === "SUPER_ADMIN") {
    return "Admin (Full Access)";
  }
  if (normalized === "LEGAL_ANALYST" || normalized === "MANAGER") {
    return "Legal Analyst";
  }
  if (normalized === "REVIEWER") {
    return "Reviewer";
  }
  if (normalized === "VIEWER" || normalized === "EMPLOYEE") {
    return "Viewer (Read Only)";
  }
  return role.replace("_", " ");
}

export default function AcceptInvitePage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const token = Array.isArray(params?.token) ? params.token[0] : (params?.token as string) || "";

  const [details, setDetails] = useState<InvitationDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState<boolean>(false);

  useEffect(() => {
    if (!token) {
      setErrorMessage("Missing invitation token.");
      setIsLoading(false);
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await organizationsService.getInvitationDetails(token);
        setDetails(data);
      } catch (err: any) {
        console.error("Failed to load invitation details:", err);
        const detail = err?.response?.data?.detail || "Invalid or expired invitation link.";
        setErrorMessage(detail);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setIsAccepting(true);
    try {
      const res = await organizationsService.acceptInvitation(token);
      toast.success(`Welcome! Successfully joined ${res.organization_name}.`);

      if (res.organization_id) {
        localStorage.setItem("selected_organization_id", res.organization_id);
        window.dispatchEvent(new Event("organization_changed"));
      }

      localStorage.removeItem("post_auth_redirect");
      router.push("/dashboard");
    } catch (err: any) {
      console.error("Failed accepting invitation:", err);
      const msg = err?.response?.data?.detail || "Failed to accept invitation.";
      toast.error(msg);
    } finally {
      setIsAccepting(false);
    }
  };

  const saveRedirectAndNavigate = (destination: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("post_auth_redirect", `/invite/${token}`);
    }
    router.push(destination);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-6">
      {/* Top Navbar */}
      <header className="flex h-14 items-center justify-between px-6 max-w-4xl w-full mx-auto border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
            <Layers className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold tracking-tight text-foreground text-sm">LexisGraph</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content Card */}
      <main className="flex-1 flex items-center justify-center p-4">
        {isLoading || isAuthLoading ? (
          <Card className="p-10 max-w-md w-full text-center space-y-4 bg-card border-border shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
            <p className="text-xs text-muted-foreground font-medium">Validating secure invitation token...</p>
          </Card>
        ) : errorMessage || !details ? (
          <Card className="p-8 max-w-md w-full text-center space-y-4 bg-card border-rose-500/30 shadow-2xl">
            <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-foreground">Invalid Invitation</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">{errorMessage}</p>
            </div>
            <Button
              onClick={() => router.push(user ? "/dashboard" : "/login")}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 px-4 rounded-xl cursor-pointer"
            >
              Return to Home
            </Button>
          </Card>
        ) : (
          <Card className="p-8 max-w-md w-full space-y-6 bg-card border-border shadow-2xl rounded-2xl">
            {/* Header Icon & Title */}
            <div className="text-center space-y-2">
              <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center mx-auto shadow-md">
                <Building2 className="h-7 w-7" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Organization Invitation
              </span>
              <h1 className="text-xl font-extrabold text-foreground">
                You're invited to join <span className="text-indigo-500">{details.organization_name}</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Invited by <strong className="text-foreground">{details.inviter_name}</strong>
              </p>
            </div>

            {/* Details Panel */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-indigo-500" /> Assigned Role
                </span>
                <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 text-[11px] font-mono">
                  {formatRoleLabel(details.role)}
                </Badge>
              </div>

              <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500" /> Link Expires
                </span>
                <span className="font-mono text-foreground font-semibold">
                  {format(new Date(details.expires_at), "MMM d, yyyy")}
                </span>
              </div>
            </div>

            {/* Authentication Conditionals */}
            {user ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Authenticated as <strong>{user.full_name || user.email}</strong>
                  </span>
                </div>

                <Button
                  onClick={handleAccept}
                  disabled={isAccepting}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-10 rounded-xl shadow-lg shadow-indigo-600/20 font-bold cursor-pointer gap-1.5"
                >
                  {isAccepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Accept Invitation & Join <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Log in or sign up for a LexisGraph account to accept this invitation and access <strong className="text-foreground">{details.organization_name}</strong>.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    onClick={() => saveRedirectAndNavigate("/register")}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 rounded-xl font-semibold cursor-pointer gap-1"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Sign up
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => saveRedirectAndNavigate("/login")}
                    className="bg-card border-border text-foreground hover:bg-muted text-xs h-9 rounded-xl font-semibold cursor-pointer gap-1"
                  >
                    <LogIn className="h-3.5 w-3.5" /> Log in
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-muted-foreground py-4">
        LexisGraph Enterprise Compliance Intelligence Platform
      </footer>
    </div>
  );
}
