"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authService } from "@/services/auth-service";
import { toast } from "sonner";
import {
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "reset" | "success">("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage("Please enter your account email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await authService.forgotPassword(cleanEmail);
      if (res.reset_token) {
        setToken(res.reset_token);
      }
      toast.success("Account verified. Please set your new password.");
      setStep("reset");
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        (typeof err?.message === "string"
          ? err.message
          : "Unable to find an account with that email address.");
      setErrorMessage(detail);
      toast.error(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!newPassword) {
      setErrorMessage("Please enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter.");
      return;
    }

    setIsLoading(true);

    try {
      await authService.resetPassword({
        email: email.trim(),
        new_password: newPassword,
        token: token || undefined,
      });

      toast.success("Password updated successfully!");
      setStep("success");
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        (typeof err?.message === "string"
          ? err.message
          : "Failed to reset password. Please try again.");
      setErrorMessage(detail);
      toast.error(detail);
    } finally {
      setIsLoading(false);
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
              Account Recovery
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Securely regain access to your enterprise compliance workspace and GraphRAG knowledge base.
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-md bg-surface-elevated p-1.5 text-primary border border-border">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Zero Knowledge Credentials
                </h4>
                <p className="text-xs text-muted-foreground">
                  Passwords are encrypted with bcrypt salts and protected against brute-force attacks.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-md bg-surface-elevated p-1.5 text-primary border border-border">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Instant Verification
                </h4>
                <p className="text-xs text-muted-foreground">
                  Quick identity check restores workspace access without administrator delay.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Footer info */}
        <div className="z-10 text-xs text-muted-foreground">
          © {new Date().getFullYear()} LexisGraph Systems. All rights reserved.
        </div>
      </div>

      {/* Right side form */}
      <div className="flex flex-1 flex-col justify-between p-6 sm:p-12 lg:w-1/2 relative">
        <div className="flex items-center justify-between w-full">
          <div className="lg:hidden flex items-center gap-2">
            <BrandLogo size={32} />
            <span className="text-lg font-bold tracking-tight text-foreground">
              LexisGraph
            </span>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm my-auto py-8">
          <div className="space-y-2 mb-6 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-medium mb-1">
              <KeyRound className="h-3.5 w-3.5" />
              Security & Access
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {step === "email" && "Reset your password"}
              {step === "reset" && "Set new password"}
              {step === "success" && "Password updated"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {step === "email" &&
                "Enter your email address and we'll help you recover your account."}
              {step === "reset" &&
                "Choose a strong password containing at least 8 characters."}
              {step === "success" &&
                "You can now sign in with your new credentials."}
            </p>
          </div>

          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="pt-6">
              {errorMessage && (
                <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p className="leading-relaxed font-medium">{errorMessage}</p>
                </div>
              )}

              {/* STEP 1: Email */}
              {step === "email" && (
                <form onSubmit={handleRequestToken} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="forgot-email"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Email Address
                    </label>
                    <div className="relative">
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-10 pl-9 text-sm border-border bg-surface-elevated text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                        disabled={isLoading}
                        autoFocus
                      />
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary-hover font-semibold rounded-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              )}

              {/* STEP 2: Password */}
              {step === "reset" && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="p-2.5 rounded-lg bg-surface-elevated border border-border flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Account:</span>
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      {email}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="new-pwd"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      New Password
                    </label>
                    <div className="relative">
                      <Input
                        id="new-pwd"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-10 pl-9 pr-10 text-sm border-border bg-surface-elevated text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                        disabled={isLoading}
                        autoFocus
                      />
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="confirm-pwd"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Input
                        id="confirm-pwd"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-10 pl-9 pr-10 text-sm border-border bg-surface-elevated text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                        disabled={isLoading}
                      />
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={
                      isLoading ||
                      newPassword.length < 8 ||
                      newPassword !== confirmPassword
                    }
                    className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary-hover font-semibold rounded-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating password...
                      </>
                    ) : (
                      <>
                        Reset Password
                        <CheckCircle2 className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              )}

              {/* STEP 3: Success */}
              {step === "success" && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-foreground">
                      Password Reset Successfully
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Your password has been changed. You can now log into your account.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary-hover font-semibold cursor-pointer"
                  >
                    Sign In Now
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Link>
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground py-2">
          LexisGraph Compliance & Intelligence Platform
        </div>
      </div>
    </div>
  );
}
