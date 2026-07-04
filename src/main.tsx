import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
// Arabic game stack: Lalezar (bold rounded display — big & characterful),
// Cairo (highly readable body), Reem Kufi (geometric UI labels).
import "@fontsource/lalezar/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/reem-kufi/500.css";
import "@fontsource/reem-kufi/600.css";
import "@fontsource/reem-kufi/700.css";
import "./theme/global.css";
import App from "./App";
import { SystemProvider } from "./state/SystemProvider";
import { I18nProvider } from "./i18n/I18nProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <SystemProvider>
        <App />
      </SystemProvider>
    </I18nProvider>
  </React.StrictMode>,
);
