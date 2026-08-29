import React from "react";
import ReactDOM from "react-dom/client";
import { ProviderDialog, StudioApp } from "@lensflow/ui";
import "@lensflow/ui/styles.css";
import { ExtensionStudioRuntime } from "../../lensflow/runtime";
import "./shell.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (location.hash === "#legacy") {
  void Promise.all([import("../sidepanel/App"), import("../sidepanel/style.css")]).then(([module]) => {
    const LegacyApp = module.default;
    root.render(<React.StrictMode><button className="lensflow-back" onClick={() => { location.hash = ""; location.reload(); }}>返回 Lensflow 工作台</button><LegacyApp /></React.StrictMode>);
  });
} else {
  root.render(<React.StrictMode><StudioApp runtime={new ExtensionStudioRuntime()} surface="page" initialView={location.hash === "#backup" ? "backup" : "create"} initialProviderOpen={location.hash === "#provider"} providerDialog={ProviderDialog} logoUrl={browser.runtime.getURL("/icon-128.png")} /></React.StrictMode>);
}
