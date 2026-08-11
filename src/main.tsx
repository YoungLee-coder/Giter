import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AppUiProvider } from "@/hooks/AppUiProvider";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/query";
import "@/i18n";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppUiProvider>
        <App />
        <Toaster />
      </AppUiProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
