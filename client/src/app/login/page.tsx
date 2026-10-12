"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, LoginInput } from "@/services/auth-service";
import { useAuth } from "@/context/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Eye, EyeOff, ShieldCheck, Network, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";

function LoginContent() {
  const searchParams = useSearchParams();
  const inviteToken =
    searchParams.get("invite_token") ||
    (typeof window !== "undefined"
      ? localStorage.getItem("pending_invite_token")
      : null);

  const { user, login, isLoading: authLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNoAccount, setIsNoAccount] = useState(false);
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading && !isSubmitting) {
      if (inviteToken) {
        router.replace(`/invite/${inviteToken}`);
      } else {
        router.replace("/dashboard");
      }
    }
  }, [user, authLoading, router, isSubmitting, inviteToken]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setIsNoAccount(false);
    try {
      await login(data, inviteToken || undefined);
    } catch (err: any) {
      console.error(err);
      const detail =
        err?.response?.data?.detail ||
        (typeof err?.message === "string" ? err.message : "Invalid credentials. Please try again.");
      setErrorMessage(detail);
      const lower = String(detail).toLowerCase();
      if (
        lower.includes("no account found") ||
        lower.includes("not found") ||
        lower.includes("create an account") ||
        lower.includes("register") ||
        err?.response?.status === 404
      ) {
        setIsNoAccount(true);
      }
    } finally {
      setIsSubmitting(false);
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
            <h1 className="text-4xl font-extrabold tracking-tight leading-none text-foreground">
              Enterprise Policy Compliance
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Verify compliance frameworks using vector semantics combined with Neo4j Knowledge Graph relations.
            </p>
          </div>

          {/* Features Checklist */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-md bg-surface-elevated p-1.5 text-primary border border-border">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Semantic Matching</h4>
                <p className="text-xs text-muted-foreground">High-dimensional embeddings find compliance gaps instantly.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-md bg-surface-elevated p-1.5 text-accent border border-border">
                <Network className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Knowledge Graphs</h4>
                <p className="text-xs text-muted-foreground">Explore relational networks of policies and legal requirements.</p>
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

          <div className="text-center lg:text-left mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Access your regulatory intelligence workspace
            </p>
          </div>

          <Card className="border-border bg-card shadow-xl p-6 rounded-xl">
            <CardContent className="p-0">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Visual Error Banner */}
                {errorMessage && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
                      <div className="space-y-0.5">
                        <p className="font-semibold text-xs uppercase tracking-wider text-destructive">
                          {isNoAccount ? "No Account Found" : "Sign In Failed"}
                        </p>
                        <p className="text-xs text-destructive/90 leading-relaxed">
                          {errorMessage}
                        </p>
                      </div>
                    </div>
                    {isNoAccount && (
                      <div className="pt-2 pl-7 border-t border-destructive/20">
                        <Link
                          href="/register"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        >
                          Create an account here <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    )}
                  </div>
                )}
                {/* Username / Email field */}
                <div className="space-y-1.5">
                  <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Username or Email
                  </label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="name@company.com"
                    className="h-10 text-sm border-border bg-surface-elevated text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    aria-invalid={errors.username ? "true" : "false"}
                    {...register("username")}
                  />
                  {errors.username && (
                    <p className="text-xs text-destructive mt-1 font-medium">{errors.username.message}</p>
                  )}
                </div>

                {/* Password field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="h-10 pr-10 text-sm border-border bg-surface-elevated text-foreground focus-visible:outline-2 focus-visible:outline-primary"
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

                {/* Submit button — solid primary */}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10 mt-2 bg-primary text-primary-foreground hover:bg-primary-hover border border-primary transition-colors font-semibold rounded-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New to LexisGraph?{" "}
            <Link
              href="/register"
              className="font-semibold text-primary hover:underline transition-colors"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
