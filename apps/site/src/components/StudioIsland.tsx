import { useMemo } from "react";
import { StudioApp } from "@lensflow/ui";
import "@lensflow/ui/styles.css";
import { BridgeStudioRuntime } from "./BridgeRuntime";

export default function StudioIsland() {
  const runtime = useMemo(() => new BridgeStudioRuntime(), []);
  const logoUrl = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/brand/lensflow-mark.png`;
  const surface = import.meta.env.DEV && new URLSearchParams(location.search).get("surface") === "sidepanel" ? "sidepanel" : "site";
  return <StudioApp runtime={runtime} surface={surface} logoUrl={logoUrl} />;
}
