"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, RegisterInput, authService } from "@/services/auth-service";
import { useAuth } from "@/context/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  Network,
  ArrowRight,
  Loader2,
  Building2,
  CheckCircle2,
  UserCheck,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { toast } from "sonner";

function RegisterContent() {
  const searchParams = useSearchParams();
  const inviteToken =
    searchParams.get("invite_token") ||
    (typeof window !== "undefined"
      ? localStorage.getItem("pending_invite_token")
      : null);

  const { user, register: registerUser, isLoading: authLoading, refreshUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"REGISTER" | "ROLE_SELECTION">("REGISTER");
  const [selectedRole, setSelectedRole] = useState<"ADMIN" | "LEGAL_ANALYST">("ADMIN");
  const [isSettingUpRole, setIsSettingUpRole] = useState(false);
  const router = useRouter();

  // Redirect if already logged in (and not currently in registration process)
  useEffect(() => {
    if (user && !authLoading && step === "REGISTER" && !isSubmitting) {
      if (inviteToken) {
        router.replace(`/invite/${inviteToken}`);
      } else {
        router.replace("/dashboard");
      }
    }
  }, [user, authLoading, router, step, isSubmitting, inviteToken]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      username: "",
      email: "",
      password: "",
      confirm_password: "",
    },
  });

  const onSubmit = async (data: RegisterInput) => {
    setIsSubmitting(true);
    try {
      const res = await registerUser(data, inviteToken || undefined);
      if (!res.isInviteFlow) {
        setStep("ROLE_SELECTION");
      }
    } catch {
      // Error toast is displayed by auth-context
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteRoleSetup = async () => {
    setIsSettingUpRole(true);
    try {
      const res = await authService.setupRole(selectedRole);
      if (res.organization_id) {
        localStorage.setItem("selected_organization_id", res.organization_id);
        window.dispatchEvent(new Event("organization_changed"));
      }
      await refreshUser();
      toast.success(
        `Workspace created! Registered as ${
          selectedRole === "ADMIN" ? "Admin" : "Compliance Analyst"
        }.`
      );
      router.replace("/dashboard");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.detail || "Failed to complete role setup."
      );
    } finally {
      setIsSettingUpRole(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row bg-background">
      {/* Left side brand banner (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-card p-12 text-foreground relative overflow-hidden border-r border-border">
        {/* Top Header */}
        <Link href="/" className="flex items-center gap-2.5 z-10 w-fit">
          <BrandLogo size={40} priority />
          <span className="text-xl font-bold tracking-tight text-foreground">
            LexisGraph
          </span>
        </Link>

        {/* Center Tech Visualization */}
        <div className="my-auto z-10 max-w-md space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight leading-tight text-foreground">
              Start Regulatory Analytics
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Create an account to upload policy documents, extract key clauses, and check compliance rules.
            </p>
          </div>

          {/* Features Checklist */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-md bg-surface-elevated p-1.5 text-primary border border-border">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Continuous Assessment</h4>
                <p className="text-xs text-muted-foreground">Track and score policy version changes in real-time.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-md bg-surface-elevated p-1.5 text-accent border border-border">
                <Network className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Knowledge Integration</h4>
                <p className="text-xs text-muted-foreground">Store compliance metrics natively inside a scalable graph database.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="z-10 text-xs text-muted-foreground flex items-center justify-between">
          <span>© {new Date().getFullYear()} LexisGraph Inc.</span>
          <span className="flex items-center gap-1 hover:text-foreground cursor-pointer transition-colors">
            Documentation <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>

      {/* Right side form card */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-20 xl:px-24 relative bg-background">
        {/* Top-Right Theme Toggle */}
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-sm lg:w-96">
          {/* Brand header for mobile */}
          <Link href="/" className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <BrandLogo size={34} />
            <span className="text-lg font-bold tracking-tight text-foreground">
              LexisGraph
            </span>
          </Link>

          {step === "REGISTER" ? (
            <>
              <div className="text-center lg:text-left mb-6">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  Create an account
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Get started with enterprise compliance management
                </p>
              </div>

              <Card className="border-border bg-card shadow-xl p-6 rounded-xl">
                <CardContent className="p-0">
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
                    {/* Full Name field */}
                    <div className="space-y-1.5">
                      <label htmlFor="full_name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Full Name
                      </label>
                      <Input
                        id="full_name"
                        type="text"
                        placeholder="Jane Doe"
                        className="h-10 text-sm bg-surface-elevated border-border text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
                        aria-invalid={errors.full_name ? "true" : "false"}
                        {...register("full_name")}
                      />
                      {errors.full_name && (
                        <p className="text-xs text-destructive mt-1 font-medium">{errors.full_name.message}</p>
                      )}
                    </div>

                    {/* Username field */}
                    <div className="space-y-1.5">
                      <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Username
                      </label>
                      <Input
                        id="username"
                        type="text"
                        placeholder="janedoe"
                        className="h-10 text-sm bg-surface-elevated border-border text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
                        aria-invalid={errors.username ? "true" : "false"}
                        {...register("username")}
                      />
                      {errors.username && (
                        <p className="text-xs text-destructive mt-1 font-medium">{errors.username.message}</p>
                      )}
                    </div>

                    {/* Email field */}
                    <div className="space-y-1.5">
                      <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Email Address
                      </label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@company.com"
                        className="h-10 text-sm bg-surface-elevated border-border text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
                        aria-invalid={errors.email ? "true" : "false"}
                        {...register("email")}
                      />
                      {errors.email && (
                        <p className="text-xs text-destructive mt-1 font-medium">{errors.email.message}</p>
                      )}
                    </div>

                    {/* Password field */}
                    <div className="space-y-1.5">
                      <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Password
                      </label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="h-10 pr-10 text-sm bg-surface-elevated border-border text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
                          aria-invalid={errors.password ? "true" : "false"}
                          {...register("password")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.password && (
                        <p className="text-xs text-destructive mt-1 font-medium">{errors.password.message}</p>
                      )}
                    </div>

                    {/* Confirm Password field */}
                    <div className="space-y-1.5">
                      <label htmlFor="confirm_password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Confirm Password
                      </label>
                      <Input
                        id="confirm_password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="h-10 text-sm bg-surface-elevated border-border text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
                        aria-invalid={errors.confirm_password ? "true" : "false"}
                        {...register("confirm_password")}
                      />
                      {errors.confirm_password && (
                        <p className="text-xs text-destructive mt-1 font-medium">{errors.confirm_password.message}</p>
                      )}
                    </div>

                    {/* Submit button */}
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-10 mt-3 bg-primary text-primary-foreground hover:bg-primary-hover transition-colors font-semibold rounded-md shadow-none flex items-center justify-center gap-2 cursor-pointer border border-primary"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create account"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-primary hover:underline transition-all"
                >
                  Sign in instead
                </Link>
              </p>
            </>
          ) : (
            /* Step 2: Role Selection Screen */
            <div className="space-y-6">
              <div className="text-center lg:text-left space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-primary block">
                  Step 2 of 2 — Onboarding
                </span>
                <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
                  How will you use LexisGraph?
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Select your primary account role. This configures your initial workspace and capabilities.
                </p>
              </div>

              <div className="space-y-3">
                {/* Option 1: Admin */}
                <div
                  onClick={() => setSelectedRole("ADMIN")}
                  className={`p-4 rounded-xl border transition-colors cursor-pointer flex items-start gap-3.5 ${
                    selectedRole === "ADMIN"
                      ? "border-primary bg-surface-elevated"
                      : "border-border bg-card hover:bg-surface-elevated/60"
                  }`}
                >
                  <div className="mt-0.5 h-8 w-8 rounded-lg bg-surface-elevated text-primary border border-border flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground">Admin</span>
                      {selectedRole === "ADMIN" && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Create &amp; manage your organization workspace. Invite team members and manage legal roles.
                    </p>
                  </div>
                </div>

                {/* Option 2: Compliance Analyst */}
                <div
                  onClick={() => setSelectedRole("LEGAL_ANALYST")}
                  className={`p-4 rounded-xl border transition-colors cursor-pointer flex items-start gap-3.5 ${
                    selectedRole === "LEGAL_ANALYST"
                      ? "border-accent bg-surface-elevated"
                      : "border-border bg-card hover:bg-surface-elevated/60"
                  }`}
                >
                  <div className="mt-0.5 h-8 w-8 rounded-lg bg-surface-elevated text-accent border border-border flex items-center justify-center shrink-0">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground">Compliance Analyst</span>
                      {selectedRole === "LEGAL_ANALYST" && (
                        <CheckCircle2 className="h-4 w-4 text-accent" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Run compliance analyses, upload policies, and review regulatory findings. (No invitation permissions).
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleCompleteRoleSetup}
                disabled={isSettingUpRole}
                className="w-full h-10 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-sm rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2 border border-primary"
              >
                {isSettingUpRole ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Setting up workspace...
                  </>
                ) : (
                  <>
                    Complete Setup &amp; Continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
