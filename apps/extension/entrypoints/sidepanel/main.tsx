import React from "react";
import ReactDOM from "react-dom/client";
import { ProviderDialog, StudioApp } from "@lensflow/ui";
import "@lensflow/ui/styles.css";
import { ExtensionStudioRuntime } from "../../lensflow/runtime";
import { STORAGE_KEYS } from "../../shared/storage";
import type { ImageSource } from "../../shared/types";
import "../workspace/shell.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (location.hash === "#legacy") {
  void Promise.all([import("./App"), import("./style.css")]).then(([module]) => {
    const LegacyApp = module.default;
    root.render(<React.StrictMode><button className="lensflow-back" onClick={() => { void returnToStudio(); }}>返回 Lensflow</button><LegacyApp /></React.StrictMode>);
  });
} else {
  root.render(<React.StrictMode><StudioApp runtime={new ExtensionStudioRuntime()} surface="sidepanel" providerDialog={ProviderDialog} logoUrl={browser.runtime.getURL("/icon-128.png")} /></React.StrictMode>);
}

async function returnToStudio() {
  const stored = await browser.storage.session.get(STORAGE_KEYS.selection);
  const source = stored[STORAGE_KEYS.selection] as ImageSource | undefined;
  if (source?.tabId !== undefined) {
    await browser.sidePanel.setOptions({ tabId: source.tabId, path: "sidepanel.html", enabled: true });
  }
  location.hash = "";
  location.reload();
}
