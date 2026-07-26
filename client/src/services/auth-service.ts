import { api } from "./api";
import { User, TokenResponse } from "@/types/auth";
// Let's write the exact schemas and inline type interfaces for the API requests.

import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(255),
  username: z.string().min(3, "Username must be at least 3 characters").max(50),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  confirm_password: z.string().min(1, "Confirm password is required"),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export const authService = {
  async login(data: LoginInput): Promise<TokenResponse> {
    // fastapi auth/token expects UserLogin model which has username and password fields.
    const response = await api.post<TokenResponse>("/auth/token", {
      username: data.username,
      password: data.password,
    });
    return response.data;
  },

  async register(data: Omit<RegisterInput, "confirm_password">): Promise<User> {
    const response = await api.post<User>("/auth/register", data);
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>("/auth/me");
    return response.data;
  },
};
