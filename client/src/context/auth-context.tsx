"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, UserMembership } from "@/types/auth";
import { authService, LoginInput, RegisterInput } from "@/services/auth-service";
import { organizationsService } from "@/services/api/organizations";
import { getToken, setToken, removeToken } from "@/utils/auth-storage";
import {
  isRoleAdmin,
  isRoleReviewer,
  isRoleComplianceAnalyst,
  isRoleViewer,
  formatRoleLabel,
  getUserPermissions,
  UserPermissions,
} from "@/utils/role-utils";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  activeMembership: UserMembership | null;
  activeRole: string | null;
  isAdmin: boolean;
  isReviewer: boolean;
  isComplianceAnalyst: boolean;
  isViewer: boolean;
  permissions: UserPermissions;
  login: (data: LoginInput, inviteToken?: string) => Promise<void>;
  register: (data: RegisterInput, inviteToken?: string) => Promise<{ isInviteFlow: boolean }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  // Keep activeOrgId in sync with localStorage and organization_changed events
  useEffect(() => {
    const syncActiveOrg = () => {
      const storedId = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
      setActiveOrgId(storedId);
    };

    syncActiveOrg();
    window.addEventListener("organization_changed", syncActiveOrg);
    return () => window.removeEventListener("organization_changed", syncActiveOrg);
  }, []);

  // Compute active membership from current user's memberships and activeOrgId
  const activeMembership: UserMembership | null = React.useMemo(() => {
    if (!user || !user.memberships || user.memberships.length === 0) return null;
    if (activeOrgId) {
      const match = user.memberships.find((m) => m.organization_id === activeOrgId);
      if (match) return match;
    }
    return user.memberships[0];
  }, [user, activeOrgId]);

  const activeRole: string | null = React.useMemo(() => {
    if (activeMembership?.role) return activeMembership.role;
    if (user?.is_superuser) return "ADMIN";
    return null;
  }, [activeMembership, user]);

  const isAdmin: boolean = React.useMemo(() => {
    return isRoleAdmin(activeRole, user?.is_superuser);
  }, [activeRole, user?.is_superuser]);

  const isReviewer: boolean = React.useMemo(() => {
    return isRoleReviewer(activeRole);
  }, [activeRole]);

  const isComplianceAnalyst: boolean = React.useMemo(() => {
    return isRoleComplianceAnalyst(activeRole);
  }, [activeRole]);

  const isViewer: boolean = React.useMemo(() => {
    return isRoleViewer(activeRole);
  }, [activeRole]);

  const permissions: UserPermissions = React.useMemo(() => {
    return getUserPermissions(activeRole, user?.is_superuser);
  }, [activeRole, user?.is_superuser]);

  // Load user profile on mount if token is found
  useEffect(() => {
    async function loadUser() {
      const storedToken = getToken();
      if (storedToken) {
        setTokenState(storedToken);
        try {
          const profile = await authService.getCurrentUser();
          setUser(profile);

          const currentSelectedOrg = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
          const hasValidSelectedOrg = profile?.memberships?.some((m) => m.organization_id === currentSelectedOrg);
          if (!hasValidSelectedOrg && profile?.memberships && profile.memberships.length > 0) {
            localStorage.setItem("selected_organization_id", profile.memberships[0].organization_id);
            setActiveOrgId(profile.memberships[0].organization_id);
            window.dispatchEvent(new Event("organization_changed"));
          }
        } catch (error: unknown) {
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

  const login = async (data: LoginInput, inviteToken?: string) => {
    setIsLoading(true);
    try {
      const response = await authService.login(data);
      setToken(response.access_token);
      setTokenState(response.access_token);

      const tokenToAccept =
        inviteToken ||
        (typeof window !== "undefined"
          ? localStorage.getItem("pending_invite_token") ||
            localStorage.getItem("post_auth_redirect")?.replace("/invite/", "")
          : null);

      if (tokenToAccept && tokenToAccept.length > 10) {
        try {
          const acceptRes = await organizationsService.acceptInvitation(tokenToAccept);
          if (acceptRes.organization_id) {
            localStorage.setItem("selected_organization_id", acceptRes.organization_id);
            setActiveOrgId(acceptRes.organization_id);
            window.dispatchEvent(new Event("organization_changed"));
          }
          if (typeof window !== "undefined") {
            localStorage.removeItem("pending_invite_token");
            localStorage.removeItem("post_auth_redirect");
          }
          const roleLabel = acceptRes.role ? formatRoleLabel(acceptRes.role) : "Member";
          toast.success(`Welcome to ${acceptRes.organization_name}! Signed in as ${roleLabel}.`);
        } catch (acceptErr: any) {
          console.warn("Failed auto-accepting invitation on login:", acceptErr);
        }
      } else {
        toast.success("Successfully logged in!");
      }

      const profile = await authService.getCurrentUser();
      setUser(profile);

      const currentSelectedOrg = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
      const hasValidSelectedOrg = profile?.memberships?.some((m) => m.organization_id === currentSelectedOrg);
      if (!hasValidSelectedOrg && profile?.memberships && profile.memberships.length > 0) {
        localStorage.setItem("selected_organization_id", profile.memberships[0].organization_id);
        setActiveOrgId(profile.memberships[0].organization_id);
        window.dispatchEvent(new Event("organization_changed"));
      }

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

  const register = async (
    data: RegisterInput,
    inviteToken?: string
  ): Promise<{ isInviteFlow: boolean }> => {
    setIsLoading(true);
    try {
      // Remove confirm_password before sending to API
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { confirm_password, ...registerPayload } = data;
      await authService.register(registerPayload);

      const tokenToAccept =
        inviteToken ||
        (typeof window !== "undefined"
          ? localStorage.getItem("pending_invite_token") ||
            localStorage.getItem("post_auth_redirect")?.replace("/invite/", "")
          : null);

      // Auto-login to obtain access token
      const tokenResponse = await authService.login({
        username: registerPayload.email,
        password: registerPayload.password,
      });
      setToken(tokenResponse.access_token);
      setTokenState(tokenResponse.access_token);

      if (tokenToAccept && tokenToAccept.length > 10) {
        try {
          const acceptRes = await organizationsService.acceptInvitation(tokenToAccept);
          if (acceptRes.organization_id) {
            localStorage.setItem("selected_organization_id", acceptRes.organization_id);
            setActiveOrgId(acceptRes.organization_id);
            window.dispatchEvent(new Event("organization_changed"));
          }
          if (typeof window !== "undefined") {
            localStorage.removeItem("pending_invite_token");
            localStorage.removeItem("post_auth_redirect");
          }
          const profile = await authService.getCurrentUser();
          setUser(profile);
          const roleLabel = acceptRes.role ? formatRoleLabel(acceptRes.role) : "Member";
          toast.success(`Account created! Joined ${acceptRes.organization_name} as ${roleLabel}.`);
          router.push("/dashboard");
          return { isInviteFlow: true };
        } catch (acceptErr: any) {
          console.error("Failed auto-accepting invitation during registration:", acceptErr);
          const profile = await authService.getCurrentUser();
          setUser(profile);
          router.push(`/invite/${tokenToAccept}`);
          return { isInviteFlow: true };
        }
      } else {
        // Normal signup flow: stay on page for Step 2 role selection
        const profile = await authService.getCurrentUser();
        setUser(profile);
        return { isInviteFlow: false };
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      const errorMsg =
        axiosError.response?.data?.detail || "Registration failed. Please try again.";
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
      const storedId = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
      const hasValidSelectedOrg = profile?.memberships?.some((m) => m.organization_id === storedId);
      if (!hasValidSelectedOrg && profile?.memberships && profile.memberships.length > 0) {
        localStorage.setItem("selected_organization_id", profile.memberships[0].organization_id);
        setActiveOrgId(profile.memberships[0].organization_id);
        window.dispatchEvent(new Event("organization_changed"));
      } else {
        setActiveOrgId(storedId);
      }
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
        activeMembership,
        activeRole,
        isAdmin,
        isReviewer,
        isComplianceAnalyst,
        isViewer,
        permissions,
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
