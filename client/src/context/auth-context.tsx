"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User } from "@/types/auth";
import { authService, LoginInput, RegisterInput } from "@/services/auth-service";
import { getToken, setToken, removeToken } from "@/utils/auth-storage";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (data: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  // Load user profile on mount if token is found
  useEffect(() => {
    async function loadUser() {
      const storedToken = getToken();
      if (storedToken) {
        setTokenState(storedToken);
        try {
          const profile = await authService.getCurrentUser();
          setUser(profile);
        } catch (error: unknown) {
          // Expected when there is no valid session yet (no token) or the
          // token has expired — the axios 401 interceptor already cleared
          // the stale token, so we just reset state here without the loud
          // AxiosError dump in the console.
          const status = (error as { response?: { status?: number } })?.response
            ?.status;
          if (status !== 401) {
            console.error("Failed to load user profile", error);
          }
          setTokenState(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    }
    loadUser();
  }, []);

  const login = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const response = await authService.login(data);
      setToken(response.access_token);
      setTokenState(response.access_token);
      
      const profile = await authService.getCurrentUser();
      setUser(profile);
      
      toast.success("Successfully logged in!");
      router.push("/dashboard");
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      const errorMsg = axiosError.response?.data?.detail || "Invalid credentials. Please try again.";
      toast.error(errorMsg);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterInput) => {
    setIsLoading(true);
    try {
      // Remove confirm_password before sending to API
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { confirm_password, ...registerPayload } = data;
      await authService.register(registerPayload);
      toast.success("Registration successful! You can now log in.");
      router.push("/login");
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      const errorMsg = axiosError.response?.data?.detail || "Registration failed. Please try again.";
      toast.error(errorMsg);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    removeToken();
    setTokenState(null);
    setUser(null);
    toast.success("Logged out successfully.");
    router.push("/login");
  };

  const refreshUser = async () => {
    try {
      const profile = await authService.getCurrentUser();
      setUser(profile);
    } catch (error) {
      console.error("Failed to refresh user profile", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
