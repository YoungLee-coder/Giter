import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { api, DEFAULT_SETTINGS, type AppSettings } from "@/lib/tauri";
import { applyTheme, loadSettings, syncSystemThemeListener } from "@/lib/theme";

export function useSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => {
      const settings = await loadSettings();
      applyTheme(settings.theme);
      syncSystemThemeListener(settings.theme);
      return settings;
    },
    staleTime: Infinity,
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (next: AppSettings) => api.updateSettings(next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings });
      const previous = queryClient.getQueryData<AppSettings>(queryKeys.settings);
      queryClient.setQueryData(queryKeys.settings, next);
      applyTheme(next.theme);
      syncSystemThemeListener(next.theme);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.settings, context.previous);
        applyTheme(context.previous.theme);
        syncSystemThemeListener(context.previous.theme);
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.settings, saved);
      applyTheme(saved.theme);
      syncSystemThemeListener(saved.theme);
    },
  });
}

export function useSettings() {
  const query = useSettingsQuery();
  const mutation = useUpdateSettingsMutation();
  const settings = query.data ?? DEFAULT_SETTINGS;

  const updateSettings = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    await mutation.mutateAsync(next);
  };

  return {
    settings,
    ready: query.isSuccess || query.isError,
    updateSettings,
    isUpdating: mutation.isPending,
  };
}

export function useThemeSetting() {
  const { settings, updateSettings } = useSettings();
  return {
    theme: settings.theme,
    updateSettings,
  };
}
