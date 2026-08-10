import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useI18nStore } from "@/stores/i18nStore";
import { useSettingsStore } from "@/stores/settingsStore";

useI18nStore.getState().init();
void useSettingsStore.getState().init();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
