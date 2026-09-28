import { api } from "@/lib/api";
import type { ProfileUpdatePayload, User } from "@/types";

export function updateProfile(payload: ProfileUpdatePayload): Promise<User> {
  return api.put<User>("/api/customers/me", payload);
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  return api.put<{ message: string }>("/api/customers/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
