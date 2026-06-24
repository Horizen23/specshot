import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { startMocks } from "../.specshot/msw/browser";

async function prepareApp() {
  if (import.meta.env.VITE_USE_MSW === "true") {
    await startMocks({ baseUrl: "http://localhost:3000" });
  }
}

prepareApp().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
