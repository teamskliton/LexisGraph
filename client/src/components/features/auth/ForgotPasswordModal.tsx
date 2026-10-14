"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Loader2,
  ArrowLeft,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";

interface ForgotPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
  onSuccess?: (email: string) => void;
}

export function ForgotPasswordModal({
  open,
  onOpenChange,
  defaultEmail = "",
  onSuccess,
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<"email" | "reset" | "success">("email");
  const [email, setEmail] = useState(defaultEmail);
  const [token, setToken] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync defaultEmail when modal opens
  React.useEffect(() => {
    if (open) {
      if (defaultEmail && !email) {
        setEmail(defaultEmail);
      }
      setErrorMessage(null);
    } else {
      // Reset state on close after exit animation
      const timer = setTimeout(() => {
        setStep("email");
        setErrorMessage(null);
        setNewPassword("");
        setConfirmPassword("");
        setToken("");
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open, defaultEmail]);

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
      toast.success("Account verified. Please choose a new password.");
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

      toast.success("Password reset successfully! You can now log in.");
      setStep("success");
      if (onSuccess) {
        onSuccess(email.trim());
      }
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        (typeof err?.message === "string"
          ? err.message
          : "Failed to reset password. The token may be expired.");
      setErrorMessage(detail);
      toast.error(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 bg-card border-border shadow-2xl rounded-xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {step === "email" && "Forgot Password"}
                {step === "reset" && "Create New Password"}
                {step === "success" && "Password Reset Complete"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {step === "email" &&
                  "Enter your registered email address to verify your account."}
                {step === "reset" &&
                  "Set a strong new password for your LexisGraph account."}
                {step === "success" &&
                  "Your password has been successfully updated."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed font-medium">{errorMessage}</p>
          </div>
        )}

        {/* STEP 1: Enter Email */}
        {step === "email" && (
          <form onSubmit={handleRequestToken} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="reset-email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Account Email Address
              </label>
              <div className="relative">
                <Input
                  id="reset-email"
                  type="email"
                  autoFocus
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 pl-9 text-sm border-border bg-surface-elevated text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  disabled={isLoading}
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                We'll verify your account credentials to issue a secure password reset.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
                className="text-xs h-9 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isLoading || !email.trim()}
                className="text-xs h-9 bg-primary text-primary-foreground hover:bg-primary-hover font-semibold flex items-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* STEP 2: Set New Password */}
        {step === "reset" && (
          <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
            <div className="p-2.5 rounded-lg bg-surface-elevated border border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Account:</span>
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                {email}
              </span>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="new-password"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                New Password
              </label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-10 pl-9 pr-10 text-sm border-border bg-surface-elevated text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  disabled={isLoading}
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

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="confirm-new-password"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <Input
                  id="confirm-new-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter your new password"
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
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[11px] text-destructive font-medium">
                  Passwords do not match
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep("email")}
                disabled={isLoading}
                className="text-xs h-9 flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Change email
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  isLoading ||
                  newPassword.length < 8 ||
                  newPassword !== confirmPassword
                }
                className="text-xs h-9 bg-primary text-primary-foreground hover:bg-primary-hover font-semibold flex items-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    Reset Password
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* STEP 3: Success Confirmation */}
        {step === "success" && (
          <div className="space-y-4 pt-3 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground">
                Password Successfully Reset
              </h3>
              <p className="text-xs text-muted-foreground">
                Your credentials have been updated. You can now log into your LexisGraph workspace.
              </p>
            </div>
            <div className="pt-2">
              <Button
                type="button"
                onClick={handleFinish}
                className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary-hover font-semibold text-xs cursor-pointer"
              >
                Back to Sign In
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
