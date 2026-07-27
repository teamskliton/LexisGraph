"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, LoginInput } from "@/services/auth-service";
import { useAuth } from "@/context/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Eye, EyeOff, ShieldCheck, Scale, Network, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { user, login, isLoading: authLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

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
    try {
      await login(data);
    } catch (err) {
      // Errors handled by toast inside auth-context
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row bg-background">
      {/* Left side brand banner (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-zinc-950 p-12 text-white relative overflow-hidden border-r border-zinc-800">
        {/* Glow Effects */}
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-violet-600/20 blur-[120px] pointer-events-none" />

        {/* Top Header */}
        <div className="flex items-center gap-2.5 z-10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30">
            <Scale className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            LexisGraph
          </span>
        </div>

        {/* Center Tech Visualization */}
        <div className="my-auto z-10 max-w-md space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight leading-none bg-gradient-to-br from-white via-zinc-100 to-zinc-500 bg-clip-text text-transparent">
              Enterprise Policy Compliance
            </h1>
            <p className="text-lg text-zinc-400 leading-relaxed">
              Verify compliance frameworks using vector semantics combined with Neo4j Knowledge Graph relations.
            </p>
          </div>

          {/* Features Checklist */}
          <div className="space-y-4 pt-4 border-t border-zinc-800/80">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-md bg-indigo-500/10 p-1 text-indigo-400 border border-indigo-500/25">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-200">Semantic Matching</h4>
                <p className="text-xs text-zinc-400">High-dimensional embeddings find compliance gaps instantly.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-md bg-violet-500/10 p-1 text-violet-400 border border-violet-500/25">
                <Network className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-200">Knowledge Graphs</h4>
                <p className="text-xs text-zinc-400">Explore relational networks of policies and legal requirements.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="z-10 text-xs text-zinc-500 flex items-center justify-between">
          <span>© {new Date().getFullYear()} LexisGraph Inc.</span>
          <span className="flex items-center gap-1 hover:text-zinc-300 cursor-pointer transition-colors">
            Documentation <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>

      {/* Right side form card */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-20 xl:px-24 relative">
        {/* Top-Right Theme Toggle */}
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-sm lg:w-96">
          {/* Brand header for mobile */}
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <Scale className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              LexisGraph
            </span>
          </div>

          <div className="text-center lg:text-left mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Access your regulatory intelligence workspace
            </p>
          </div>

          <Card className="border-border bg-card/50 backdrop-blur-sm shadow-xl p-6 rounded-2xl">
            <CardContent className="p-0">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Username / Email field */}
                <div className="space-y-1.5">
                  <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Username or Email
                  </label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="name@company.com"
                    className="h-10 text-sm focus-visible:ring-indigo-500/20"
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
                      className="h-10 pr-10 text-sm focus-visible:ring-indigo-500/20"
                      aria-invalid={errors.password ? "true" : "false"}
                      {...register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs text-destructive mt-1 font-medium">{errors.password.message}</p>
                  )}
                </div>

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10 mt-2 bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition-all font-semibold rounded-lg shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
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
              className="font-semibold text-indigo-600 hover:text-indigo-500 hover:underline transition-all"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
