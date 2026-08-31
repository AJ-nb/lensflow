import { defineBackground } from "wxt/utils/define-background";
import { normalizeApiBaseUrl } from "../shared/api-models";
import { STORAGE_KEYS } from "../shared/storage";
import { captureSourceForStudio, handleLensflowRequest, migrateLegacyProviderSettings, resumeRemoteTasks } from "../lensflow/background-service";
import { planLegacySettingsPersistence } from "../lensflow/legacy-provider-migration";
import { checkManualUpdate, isChromeWebStoreInstall } from "../lensflow/release-update";
import {
  CURRENT_SETTINGS_VERSION,
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type CaptureIntent,
  type ImageSource,
  type RuntimeRequest,
  type RuntimeResponse
} from "../shared/types";

export default defineBackground(() => {
  const sidePanelPorts = new Set<Browser.runtime.Port>();
  let activePickerTabId: number | undefined;
  void migrateLegacyProviderSettings().catch((error) => console.warn("[Lensflow] 旧 Provider 密钥迁移失败", error));
  void maybeCheckManualRelease();

  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: "lensflow-analyze",
      title: "用 Lensflow 反推提示词",
      contexts: ["image"]
    });
    browser.contextMenus.create({
      id: "lensflow-analyze-generate",
      title: "用 Lensflow 反推并生成",
      contexts: ["image"]
    });
    browser.contextMenus.create({
      id: "lensflow-collect-text",
      title: "收藏到 Lensflow 关键词库",
      contexts: ["selection"]
    });
    await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await browser.alarms.create("lensflow-remote-poll", { periodInMinutes: 1 });
    await browser.alarms.create("lensflow-release-check", { periodInMinutes: 24 * 60 });
    const stored = await browser.storage.local.get(STORAGE_KEYS.settings);
    if (!stored[STORAGE_KEYS.settings]) {
      await browser.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
    }
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "lensflow-collect-text" && info.selectionText?.trim()) {
      await handleLensflowRequest({ type: "LENSFLOW_CREATE_KEYWORD", axis: "subject", text: info.selectionText.trim() });
      if (tab?.id !== undefined) await openStudioSidePanel(tab.id);
      return;
    }
    if (!["lensflow-analyze", "lensflow-analyze-generate"].includes(String(info.menuItemId)) || !info.srcUrl) return;
    const source: ImageSource = {
      id: crypto.randomUUID(),
      kind: "web",
      url: info.srcUrl,
      pageUrl: tab?.url,
      pageTitle: tab?.title,
      tabId: tab?.id,
      windowId: tab?.windowId
    };
    const intent: CaptureIntent = info.menuItemId === "lensflow-analyze-generate" ? "analyze-generate" : "analyze";
    await browser.storage.session.set({ [STORAGE_KEYS.captureIntent]: intent });
    await setSelection(source, intent);
    if (tab?.id !== undefined) await openStudioSidePanel(tab.id);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "lensflow-remote-poll") void resumeRemoteTasks();
    if (alarm.name === "lensflow-release-check") void maybeCheckManualRelease();
  });

  void resumeRemoteTasks();

  browser.runtime.onMessage.addListener((request: RuntimeRequest, sender, sendResponse) => {
    // Keep the Chrome MV3 message channel open explicitly. Some Chromium builds
    // finish a Promise-returning listener without forwarding its resolved value.
    void respondToRuntimeRequest(request, sender).then(sendResponse);
    return true;
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== "lensflow-sidepanel") return;
    sidePanelPorts.add(port);
    void enablePagePickerForActiveTab();
    port.onDisconnect.addListener(() => {
      sidePanelPorts.delete(port);
      if (sidePanelPorts.size === 0) void disableActivePagePicker();
    });
  });

  browser.tabs.onActivated.addListener(() => {
    if (sidePanelPorts.size > 0) void switchPagePickerToActiveTab();
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (sidePanelPorts.size > 0 && changeInfo.status === "complete") void enablePagePickerForActiveTab();
  });

  async function switchPagePickerToActiveTab(): Promise<void> {
    await disableActivePagePicker();
    await enablePagePickerForActiveTab();
  }

  async function disableActivePagePicker(): Promise<void> {
    if (activePickerTabId === undefined) return;
    const tabId = activePickerTabId;
    activePickerTabId = undefined;
    try {
      await browser.tabs.sendMessage(tabId, { type: "DISABLE_PAGE_PICKER" });
    } catch {
      // The tab may have navigated or closed already.
    }
  }

  async function enablePagePickerForActiveTab(): Promise<void> {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined || !isOrdinaryWebPage(tab.url ?? tab.pendingUrl)) return;
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/picker.js"]
      });
      activePickerTabId = tab.id;
    } catch (error) {
      console.warn("[Lensflow] 当前网页自动选图未启用", error);
    }
  }
});

async function maybeCheckManualRelease(): Promise<void> {
  const manifest = browser.runtime.getManifest();
  if (isChromeWebStoreInstall(manifest.update_url)) return;
  const stored = await browser.storage.local.get(STORAGE_KEYS.releaseUpdateNotice);
  const notice = await checkManualUpdate({
    currentVersion: manifest.version,
    previous: stored[STORAGE_KEYS.releaseUpdateNotice]
  });
  await browser.storage.local.set({ [STORAGE_KEYS.releaseUpdateNotice]: notice });
}

async function respondToRuntimeRequest(
  request: RuntimeRequest,
  sender: Browser.runtime.MessageSender
): Promise<RuntimeResponse> {
  try {
    return { ok: true, data: await handleRequest(request, sender) };
  } catch (error) {
    console.error("[Lensflow]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "发生未知错误。"
    };
  }
}

async function handleRequest(request: RuntimeRequest, sender: Browser.runtime.MessageSender): Promise<unknown> {
  if (request.type.startsWith("LENSFLOW_")) return handleLensflowRequest(request);
  switch (request.type) {
    case "GET_SETTINGS":
      return getSettings();
    case "SAVE_SETTINGS":
      return saveSettings(request.settings);
    case "SET_SELECTION": {
      const source: ImageSource = {
        ...request.source,
        tabId: request.source.tabId ?? sender.tab?.id,
        windowId: request.source.windowId ?? sender.tab?.windowId
      };
      if (request.intent) await browser.storage.session.set({ [STORAGE_KEYS.captureIntent]: request.intent });
      await setSelection(source, request.intent);
      if (source.tabId !== undefined) {
        await openStudioSidePanel(source.tabId);
      }
      return source;
    }
    case "GET_SELECTION": {
      const stored = await browser.storage.session.get([STORAGE_KEYS.selection, STORAGE_KEYS.references, STORAGE_KEYS.overview, STORAGE_KEYS.result]);
      return {
        source: stored[STORAGE_KEYS.selection] ?? null,
        references: stored[STORAGE_KEYS.references] ?? [],
        overview: stored[STORAGE_KEYS.overview] ?? null,
        result: stored[STORAGE_KEYS.result] ?? null
      };
    }
    case "TEST_CONNECTION":
    case "PREPARE_IMAGE":
    case "ANALYZE_IMAGE":
    case "EDIT_IMAGE":
    case "GENERATE_THREE_VIEW":
      throw new Error("扩展已更新，长任务已迁移到侧边栏。请关闭并重新打开侧边栏后再试。");
  }
}

async function getSettings(): Promise<AppSettings> {
  const [stored, session, providerSession, providerLocal] = await Promise.all([
    browser.storage.local.get(STORAGE_KEYS.settings),
    browser.storage.session.get(STORAGE_KEYS.sessionApiKey),
    browser.storage.session.get(STORAGE_KEYS.sessionProviderSecrets),
    browser.storage.local.get(STORAGE_KEYS.providerSecrets)
  ]);
  const raw = stored[STORAGE_KEYS.settings] as Partial<AppSettings> | undefined;
  const sessionApiKey = session[STORAGE_KEYS.sessionApiKey];
  const sessionSecrets = providerSession[STORAGE_KEYS.sessionProviderSecrets] as Record<string, string> | undefined;
  const localSecrets = providerLocal[STORAGE_KEYS.providerSecrets] as Record<string, string> | undefined;
  const migratedKey = Object.values(sessionSecrets ?? {})[0] || Object.values(localSecrets ?? {})[0];
  const normalized = normalizeSettings({
    ...raw,
    apiKey: typeof sessionApiKey === "string"
      ? sessionApiKey
      : raw?.apiKey || migratedKey
  });
  if (raw?.settingsVersion !== CURRENT_SETTINGS_VERSION) {
    await persistSettings(normalized);
  }
  return normalized;
}

function isOrdinaryWebPage(value?: string): boolean {
  return Boolean(value && /^https?:\/\//i.test(value));
}

async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = normalizeSettings({ ...(await getSettings()), ...patch });
  next.analysisModel = next.analysisModel.trim() || DEFAULT_SETTINGS.analysisModel;
  next.imageModel = next.imageModel.trim() || DEFAULT_SETTINGS.imageModel;
  next.apiBaseUrl = next.apiBaseUrl.trim() ? normalizeApiBaseUrl(next.apiBaseUrl) : "";
  await persistSettings(next);
  return next;
}

async function persistSettings(settings: AppSettings): Promise<void> {
  const [sessionStored, localStored] = await Promise.all([
    browser.storage.session.get(STORAGE_KEYS.sessionProviderSecrets),
    browser.storage.local.get(STORAGE_KEYS.providerSecrets)
  ]);
  const persistence = planLegacySettingsPersistence({
    settings,
    sessionSecrets: sessionStored[STORAGE_KEYS.sessionProviderSecrets] as Record<string, string> | undefined,
    localSecrets: localStored[STORAGE_KEYS.providerSecrets] as Record<string, string> | undefined
  });
  await Promise.all([
    browser.storage.local.set({
      [STORAGE_KEYS.settings]: persistence.safeSettings,
      [STORAGE_KEYS.providerSecrets]: persistence.localSecrets
    }),
    browser.storage.session.set({ [STORAGE_KEYS.sessionProviderSecrets]: persistence.sessionSecrets }),
    browser.storage.session.remove(STORAGE_KEYS.sessionApiKey)
  ]);
}

async function setSelection(source: ImageSource, intent?: CaptureIntent): Promise<void> {
  await browser.storage.session.set({ [STORAGE_KEYS.selection]: source });
  await browser.storage.session.remove([STORAGE_KEYS.references, STORAGE_KEYS.overview, STORAGE_KEYS.result]);
  try {
    await browser.runtime.sendMessage({ type: "SELECTION_UPDATED", source, intent });
  } catch {
    // The side panel is not open yet.
  }
  if (intent) await captureSourceForStudio(source, intent);
}

async function openLegacySidePanel(tabId: number): Promise<void> {
  await browser.sidePanel.setOptions({ tabId, path: "sidepanel.html#legacy", enabled: true });
  await openSidePanel(tabId);
}

async function openStudioSidePanel(tabId: number): Promise<void> {
  await browser.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true });
  await openSidePanel(tabId);
}

function openSidePanel(tabId: number): Promise<void> {
  try {
    return browser.sidePanel.open({ tabId }).catch((error) => {
      console.warn("[Lensflow] 无法自动打开侧边栏", error);
    });
  } catch (error) {
    console.warn("[Lensflow] 无法自动打开侧边栏", error);
    return Promise.resolve();
  }
}
