import { defineBackground } from "wxt/utils/define-background";
import { normalizeApiBaseUrl } from "../shared/api-models";
import { STORAGE_KEYS } from "../shared/storage";
import {
  CURRENT_SETTINGS_VERSION,
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type ImageSource,
  type RuntimeRequest,
  type RuntimeResponse
} from "../shared/types";

export default defineBackground(() => {
  const sidePanelPorts = new Set<Browser.runtime.Port>();
  let activePickerTabId: number | undefined;

  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: "visual-lens-analyze",
      title: "用砚台分析图片",
      contexts: ["image"]
    });
    await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    const stored = await browser.storage.local.get(STORAGE_KEYS.settings);
    if (!stored[STORAGE_KEYS.settings]) {
      await browser.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
    }
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "visual-lens-analyze" || !info.srcUrl) return;
    const source: ImageSource = {
      id: crypto.randomUUID(),
      kind: "web",
      url: info.srcUrl,
      pageUrl: tab?.url,
      pageTitle: tab?.title,
      tabId: tab?.id,
      windowId: tab?.windowId
    };
    const openPanel = tab?.id !== undefined ? openSidePanel(tab.id) : Promise.resolve();
    await Promise.all([setSelection(source), openPanel]);
  });

  browser.runtime.onMessage.addListener((request: RuntimeRequest, sender, sendResponse) => {
    // Keep the Chrome MV3 message channel open explicitly. Some Chromium builds
    // finish a Promise-returning listener without forwarding its resolved value.
    void respondToRuntimeRequest(request, sender).then(sendResponse);
    return true;
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== "yantai-sidepanel") return;
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
        files: ["/content-scripts/content.js"]
      });
      activePickerTabId = tab.id;
    } catch (error) {
      console.warn("[砚台] 当前网页自动选图未启用", error);
    }
  }
});

async function respondToRuntimeRequest(
  request: RuntimeRequest,
  sender: Browser.runtime.MessageSender
): Promise<RuntimeResponse> {
  try {
    return { ok: true, data: await handleRequest(request, sender) };
  } catch (error) {
    console.error("[砚台]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "发生未知错误。"
    };
  }
}

async function handleRequest(request: RuntimeRequest, sender: Browser.runtime.MessageSender): Promise<unknown> {
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
      const openPanel = source.tabId !== undefined ? openSidePanel(source.tabId) : Promise.resolve();
      await Promise.all([setSelection(source), openPanel]);
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
  const [stored, session] = await Promise.all([
    browser.storage.local.get(STORAGE_KEYS.settings),
    browser.storage.session.get(STORAGE_KEYS.sessionApiKey)
  ]);
  const raw = stored[STORAGE_KEYS.settings] as Partial<AppSettings> | undefined;
  const sessionApiKey = session[STORAGE_KEYS.sessionApiKey];
  const normalized = normalizeSettings({
    ...raw,
    apiKey: typeof sessionApiKey === "string"
      ? sessionApiKey
      : raw?.apiKey
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
  if (settings.rememberApiKey) {
    await Promise.all([
      browser.storage.local.set({ [STORAGE_KEYS.settings]: settings }),
      browser.storage.session.remove(STORAGE_KEYS.sessionApiKey)
    ]);
    return;
  }
  const { apiKey, ...safeSettings } = settings;
  await Promise.all([
    browser.storage.local.set({ [STORAGE_KEYS.settings]: { ...safeSettings, apiKey: "" } }),
    apiKey
      ? browser.storage.session.set({ [STORAGE_KEYS.sessionApiKey]: apiKey })
      : browser.storage.session.remove(STORAGE_KEYS.sessionApiKey)
  ]);
}

async function setSelection(source: ImageSource): Promise<void> {
  await browser.storage.session.set({ [STORAGE_KEYS.selection]: source });
  await browser.storage.session.remove([STORAGE_KEYS.references, STORAGE_KEYS.overview, STORAGE_KEYS.result]);
  try {
    await browser.runtime.sendMessage({ type: "SELECTION_UPDATED", source });
  } catch {
    // The side panel is not open yet.
  }
}

function openSidePanel(tabId: number): Promise<void> {
  try {
    return browser.sidePanel.open({ tabId }).catch((error) => {
      console.warn("[砚台] 无法自动打开侧边栏", error);
    });
  } catch (error) {
    console.warn("[砚台] 无法自动打开侧边栏", error);
    return Promise.resolve();
  }
}
