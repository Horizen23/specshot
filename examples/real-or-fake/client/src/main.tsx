import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { startMocks } from "./lib/api/meme/msw/handlers/browser";

startMocks({ baseUrl: "http://localhost:3000" }).then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
