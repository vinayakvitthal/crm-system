import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { setAccessToken, clearAccessToken } from "@/lib/auth";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "sales_rep" | "support_agent" | "viewer";
  is_active: boolean;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  email: string;
  full_name: string;
  password: string;
}

interface AuthResponse {
  access_token: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["currentUser"],
    queryFn: async () => {
      try {
        return await api.get<User>("/users/me");
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const data = await api.post<AuthResponse>("/auth/login", payload);
      setAccessToken(data.access_token);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      const data = await api.post<AuthResponse>("/auth/register", payload);
      setAccessToken(data.access_token);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post("/auth/logout");
      clearAccessToken();
    },
    onSuccess: () => {
      queryClient.setQueryData(["currentUser"], null);
      queryClient.clear();
    },
  });

  return {
    user: user ?? null,
    isAuthenticated: !!user,
    isLoading,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
  };
}
