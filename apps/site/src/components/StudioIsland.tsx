import { useMemo } from "react";
import { StudioApp } from "@lensflow/ui";
import "@lensflow/ui/styles.css";
import { BridgeStudioRuntime } from "./BridgeRuntime";
import { DemoStudioRuntime } from "./DemoStudioRuntime";

export default function StudioIsland() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const demoMode = new URLSearchParams(location.search).get("demo") === "1";
  const runtime = useMemo(() => demoMode ? new DemoStudioRuntime(`${base}/media/demo-arc-lamp.webp`) : new BridgeStudioRuntime(), [base, demoMode]);
  const logoUrl = `${base}/brand/lensflow-mark.png`;
  const surface = import.meta.env.DEV && new URLSearchParams(location.search).get("surface") === "sidepanel" ? "sidepanel" : "site";
  return <StudioApp runtime={runtime} surface={surface} logoUrl={logoUrl} />;
}
