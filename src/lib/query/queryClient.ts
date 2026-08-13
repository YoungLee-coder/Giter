import { QueryClient } from "@tanstack/react-query";

/** Repo git status is expensive; refresh is user-driven (Refresh / batch / mutations). */
export const REPOS_STALE_TIME_MS = Infinity;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60_000,
    },
    mutations: {
      retry: false,
    },
  },
});
