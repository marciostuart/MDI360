import { useQuery } from "@tanstack/react-query";

import { fetchCurrentUser, fetchSetupState } from "./auth.functions";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: () => fetchCurrentUser(),
    staleTime: 30_000,
  });
}

export function useSetupState() {
  return useQuery({
    queryKey: ["setup-state"],
    queryFn: () => fetchSetupState(),
    staleTime: 15_000,
  });
}