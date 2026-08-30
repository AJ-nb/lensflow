import { expect, test, type Page } from "@playwright/test";

const now = "2026-08-29T00:00:00.000Z";
const capabilities = {
  authentication: "supported",
  visionInput: "supported",
  structuredOutputs: "supported",
  imageGeneration: "supported",
  imageEditing: "supported",
  backgroundTasks: "supported",
  cancellation: "unsupported"
} as const;

function snapshot(options: { keyword?: boolean; childCount?: number; partial?: boolean; analyzedAsset?: boolean } = {}) {
  const childCount = options.childCount ?? 0;
  const children = Array.from({ length: childCount }, (_, index) => {
    const failed = Boolean(options.partial && index === childCount - 2);
    const generating = Boolean(options.partial && index === childCount - 1);
    return {
      id: `child-${index}`,
      batchId: "batch-1",
      index,
      state: failed ? "failed" : generating ? "generating" : "ready",
      imageUrl: failed || generating ? undefined : "/lensflow/brand/lensflow-mark.png",
      error: failed ? "Provider 处理失败" : undefined,
      progress: generating ? 0.46 : undefined,
      attempt: 0,
      updatedAt: now
    };
  });
  const state = options.partial ? "partial" : childCount ? "ready" : undefined;
  return {
    connectionState: "connected",
    connected: true,
    readOnly: false,
    protocolVersion: 2,
    extensionVersion: "0.2.0",
    connectionMessage: "网页与本机插件已连接。",
    provider: {
      id: "provider",
      name: "本机 Provider",
      kind: "openai-compatible",
      baseUrl: "https://provider.example/v1",
      protocolMode: "responses",
      analysisModel: "analysis-model",
      imageModel: "image-model",
      rememberSecret: false,
      createdAt: now,
      updatedAt: now
    },
    capabilities,
    keywords: options.keyword ? [{ id: "keyword-1", axis: "style", text: "胶片质感", locked: false, createdAt: now }] : [],
    analyses: options.analyzedAsset ? [{ id: "analysis-1", assetId: "asset-1", mode: "quick", state: "ready", providerId: "provider", model: "analysis-model", contentKind: "product", summary: "白色便携音箱", promptZh: "白色便携音箱，产品摄影", promptEn: "white portable speaker, product photography", createdAt: now, updatedAt: now }] : [],
    prompts: [],
    assets: options.analyzedAsset ? [{ id: "asset-1", kind: "capture", name: "便携音箱.png", previewUrl: "/lensflow/brand/lensflow-mark.png", metadata: { width: { value: 1200, source: "measured" }, height: { value: 800, source: "measured" }, aspectRatio: { value: "3:2", source: "measured" }, palette: { value: [{ hex: "#ffffff", proportion: 1 }], source: "measured" } }, createdAt: now, updatedAt: now }] : [],
    references: [],
    batches: childCount ? [{
      id: "batch-1",
      providerId: "provider",
      prompt: "胶片质感，窗边人像",
      settings: { model: "image-model", size: "1024x1024", quality: "medium", count: childCount, concurrency: 2 },
      referenceIds: [],
      state,
      children,
      createdAt: now,
      updatedAt: now
    }] : [],
    historyEvents: [],
    storage: { usage: 1024, quota: 1024 * 1024, persisted: true },
    captureHandoff: options.analyzedAsset ? { assetId: "asset-1", intent: "analyze", createdAt: now } : null
  };
}

function analysisRecord() {
  const note = (value: string) => ({ value, source: "observed", confidence: 0.9 });
  const pair = { positive: { zh: "白色便携音箱，产品摄影", en: "white portable speaker, product photography" }, negative: { zh: "变形", en: "deformation" } };
  return {
    id: "analysis-1", assetId: "asset-1", captureId: "asset-1", mode: "quick", state: "ready", providerId: "provider", model: "analysis-model", createdAt: now, updatedAt: now,
    result: {
      schemaVersion: "2.0", classification: { kind: "product", confidence: 0.92, reason: "可见独立实体" }, summary: note("白色便携音箱"), subject: note("消费电子产品"), formStructure: [note("圆柱主体")], cmf: { color: [note("白色")], material: [note("塑料")], finish: [note("哑光")] }, composition: note("居中"), camera: note("平视"), lighting: note("柔光"), style: note("商业摄影"), visibleText: [], evidenceBoundary: { observed: ["轮廓"], inferred: ["材质"], unknown: ["内部"] }, prompts: pair,
      variants: [{ kind: "faithful", label: "忠实复现", prompts: pair }, { kind: "commercial", label: "商业呈现", prompts: pair }, { kind: "exploratory", label: "概念变化", prompts: pair }],
      axisSuggestions: { style: ["商业摄影"], subject: ["便携音箱"], composition: ["居中"], color: ["白色"], motion: ["静态"] },
      measurements: { width: { value: 1200, source: "measured" }, height: { value: 800, source: "measured" }, aspectRatio: { value: "3:2", source: "measured" }, orientation: { value: "landscape", source: "measured" }, palette: { value: [{ hex: "#ffffff", proportion: 1 }], source: "measured" } }, createdAt: now
    }
  };
}

async function installBridgeMock(page: Page, initialSnapshot: ReturnType<typeof snapshot>, incompatible = false) {
  await page.addInitScript(({ initialSnapshot, incompatible, mockAnalysis }) => {
    const state = structuredClone(initialSnapshot);
    Object.defineProperty(window, "__lensflowBridgeMethods", { value: [], writable: false });
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.type !== "LENSFLOW_BRIDGE_CONNECT") return;
      if (incompatible) {
        window.postMessage({ type: "LENSFLOW_BRIDGE_INCOMPATIBLE", nonce: event.data.nonce, expectedVersion: 1, receivedVersion: 2, extensionVersion: "0.1.0" }, location.origin);
        return;
      }
      const channel = new MessageChannel();
      channel.port1.onmessage = (message) => {
        const request = message.data;
        (window as unknown as { __lensflowBridgeMethods: string[] }).__lensflowBridgeMethods.push(request.method);
        let data: unknown = null;
        if (request.method === "version.get") data = { version: 2, extensionVersion: "0.2.0" };
        if (request.method === "snapshot.get") data = state;
        if (request.method === "provider.open") data = null;
        if (request.method === "analysis.open") data = null;
        if (request.method === "analysis.get") data = mockAnalysis;
        if (request.method === "prompt.save") {
          const createdAt = new Date().toISOString();
          data = { id: "saved-1", ...request.payload, createdAt, updatedAt: createdAt };
          state.prompts.push(data);
        }
        if (request.method === "asset.put" && request.payload?.kind === "prompt") {
          const keyword = { id: `keyword-${state.keywords.length + 1}`, axis: request.payload.metadata.axis, text: request.payload.name, locked: false, createdAt: new Date().toISOString() };
          state.keywords.push(keyword);
          data = keyword;
        }
        if (request.method === "task.retryFailed") {
          const batch = state.batches.find((item) => item.id === request.payload.batchId);
          if (batch) {
            batch.children = batch.children.map((child) => child.state === "failed" ? { ...child, state: "retrying", error: undefined } : child);
            batch.state = "retrying";
          }
          data = batch;
        }
        channel.port1.postMessage({ version: 2, id: request.id, ok: true, data });
      };
      channel.port1.start();
      window.postMessage({ type: "LENSFLOW_BRIDGE_CONNECTED", nonce: event.data.nonce, version: 2 }, location.origin, [channel.port2]);
    });
  }, { initialSnapshot, incompatible, mockAnalysis: analysisRecord() });
}

test("all public routes render", async ({ request }) => {
  for (const path of ["./", "product", "studio", "docs/", "download", "changelog", "privacy"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
});

test("missing extension remains browseable and blocks writes", async ({ page }) => {
  await page.goto("studio");
  await expect(page.getByText("未检测到 Lensflow 插件。请安装后重新检测。")).toBeVisible();
  await expect(page.getByRole("link", { name: "安装插件" })).toBeVisible();
  await expect(page.getByRole("button", { name: "上传图片" })).toBeDisabled();
  await expect(page.locator(".lf-stepper button").filter({ hasText: "组合" })).toBeEnabled();
});

test("incompatible protocol exposes an update path", async ({ page }) => {
  await installBridgeMock(page, snapshot(), true);
  await page.goto("studio");
  await expect(page.getByText(/桥接协议不兼容/)).toBeVisible();
  await expect(page.getByRole("link", { name: "更新插件" })).toBeVisible();
});

test("connected empty library can create and validate keywords", async ({ page }) => {
  await installBridgeMock(page, snapshot());
  await page.goto("studio");
  await expect(page.getByText("本机插件在线")).toBeVisible();
  await page.getByRole("button", { name: "创建关键词" }).click();
  const dialog = page.getByRole("dialog", { name: "创建关键词" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("输入自己的关键词").fill("胶片质感");
  await dialog.getByRole("button", { name: "保存到关键词库" }).click();
  await expect(dialog).toBeHidden();
  await page.locator(".lf-stepper button").filter({ hasText: "组合" }).click();
  await page.getByRole("button", { name: "抽一张" }).first().click();
  await expect(page.locator(".lf-axis-card strong", { hasText: "胶片质感" })).toBeVisible();
  await page.getByRole("button", { name: "新增关键词" }).click();
  await dialog.getByPlaceholder("输入自己的关键词").fill("胶片质感");
  await dialog.getByRole("button", { name: "保存到关键词库" }).click();
  await expect(dialog.getByText(/已存在相同关键词/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("website Provider control only sends provider.open and never renders a key field", async ({ page }) => {
  await installBridgeMock(page, snapshot({ keyword: true }));
  await page.goto("studio");
  await page.getByRole("button", { name: "Provider 设置" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __lensflowBridgeMethods: string[] }).__lensflowBridgeMethods)).toContain("provider.open");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByText("API Key", { exact: true })).toHaveCount(0);
});

test("composition reaches preflight without exposing secrets", async ({ page }) => {
  await installBridgeMock(page, snapshot({ keyword: true }));
  await page.goto("studio");
  await page.locator(".lf-stepper button").filter({ hasText: "组合" }).click();
  await page.getByRole("button", { name: "抽一张" }).first().click();
  await page.getByPlaceholder(/描述主体/).fill("窗边人像");
  await page.getByRole("button", { name: "检查并提交" }).click();
  await expect(page.getByRole("heading", { name: "确认发送内容和能力边界" })).toBeVisible();
  await expect(page.getByRole("button", { name: "生成 4 张" })).toBeEnabled();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("analyzed product shows measured evidence and sends a bilingual prompt to Composer", async ({ page }) => {
  await installBridgeMock(page, snapshot({ analyzedAsset: true }));
  await page.goto("studio");
  await expect(page.getByRole("heading", { name: "分析产品并生成可编辑提示词" })).toBeVisible();
  await expect(page.getByText("1200 × 800")).toBeVisible();
  await expect(page.getByText("measured", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "正向提示词" })).toHaveValue("白色便携音箱，产品摄影");
  await page.getByRole("button", { name: /送入组合/ }).click();
  await expect(page.getByPlaceholder(/描述主体/)).toHaveValue("白色便携音箱，产品摄影");
});

test("collection exposes keyword, prompt, palette and work assets without mixing them", async ({ page }) => {
  const state = snapshot({ keyword: true, analyzedAsset: true });
  state.prompts.push({ id: "prompt-1", text: "产品摄影提示词", negativeText: "", language: "zh", model: "analysis-model", createdAt: now, updatedAt: now });
  state.references.push({ id: "palette-1", kind: "palette", name: "音箱色卡", previewUrl: "/lensflow/brand/lensflow-mark.png", enabled: true, createdAt: now });
  state.assets.push({ id: "work-1", kind: "work", name: "音箱作品", previewUrl: "/lensflow/brand/lensflow-mark.png", prompt: "产品摄影提示词", metadata: {}, createdAt: now, updatedAt: now });
  await installBridgeMock(page, state);
  await page.goto("studio");
  await page.getByRole("button", { name: "收藏", exact: true }).click();
  await expect(page.getByRole("tab", { name: "关键词 1" })).toBeVisible();
  await page.getByRole("tab", { name: "提示词 1" }).click();
  await expect(page.getByText("产品摄影提示词", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "色卡 1" }).click();
  await expect(page.getByText("音箱色卡", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "作品 1" }).click();
  await expect(page.getByText("音箱作品", { exact: true })).toBeVisible();
});

test("history filters tasks and opens the selected older batch instead of the newest one", async ({ page }) => {
  const state = snapshot({ analyzedAsset: true, childCount: 3 });
  const newest = state.batches[0]!;
  state.batches.push({
    ...newest,
    id: "batch-older",
    prompt: "旧批次提示词",
    settings: { ...newest.settings, count: 2 },
    children: newest.children.slice(0, 2).map((child, index) => ({ ...child, id: `older-${index}`, batchId: "batch-older" }))
  });
  await installBridgeMock(page, state);
  await page.goto("studio");
  await page.getByRole("button", { name: "历史", exact: true }).click();
  await expect(page.getByRole("heading", { name: "历史与任务" })).toBeVisible();
  await page.getByLabel("任务类型").selectOption("generation");
  await expect(page.getByText("白色便携音箱", { exact: true })).toHaveCount(0);
  const older = page.locator(".lf-history-row").filter({ hasText: "旧批次提示词" });
  await older.getByRole("button", { name: "打开结果" }).click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
});

test("fan uses one focus model and reveals three results from the keyboard", async ({ page }) => {
  await installBridgeMock(page, snapshot({ keyword: true, childCount: 3 }));
  await page.goto("studio");
  await page.getByRole("button", { name: "结果" }).click();
  const fan = page.getByRole("listbox");
  await expect(fan.getByRole("option")).toHaveCount(3);
  await expect(fan.getByRole("option").first()).toHaveAttribute("tabindex", "-1");
  await fan.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(fan.getByRole("option").nth(1)).toHaveClass(/is-revealed/);
});

test("ten-card partial batch keeps successes and retries only failures", async ({ page }) => {
  await installBridgeMock(page, snapshot({ keyword: true, childCount: 10, partial: true }));
  await page.goto("studio");
  await page.getByRole("button", { name: "结果" }).click();
  const cards = page.getByRole("listbox").getByRole("option");
  await expect(cards).toHaveCount(10);
  await expect(cards.first()).toHaveAttribute("style", /--lf-angle: -24deg/);
  await expect(cards.last()).toHaveAttribute("style", /--lf-angle: 24deg/);
  await page.getByRole("button", { name: "补全失败位置" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __lensflowBridgeMethods: string[] }).__lensflowBridgeMethods)).toContain("task.retryFailed");
});

test("reduced motion renders a stable revealed grid", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installBridgeMock(page, snapshot({ keyword: true, childCount: 3 }));
  await page.goto("studio");
  await page.getByRole("button", { name: "结果" }).click();
  await expect(page.getByRole("listbox")).toHaveClass(/is-reduced/);
  await expect(page.getByRole("listbox").getByRole("option").first()).toHaveClass(/is-revealed/);
});

test("mobile Studio is read-only and hides write controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installBridgeMock(page, snapshot({ keyword: true }));
  await page.goto("studio");
  await expect(page.getByText(/移动端仅提供只读预览/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Provider 设置" })).toBeHidden();
  await expect(page.getByRole("button", { name: "上传图片" })).toBeHidden();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("desktop and zoom-equivalent layouts avoid horizontal overflow", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 720, height: 512 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["./", "studio"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(0);
    }
  }
});

test("mobile navigation and homepage performance stay within the acceptance budget", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0 };
    Object.defineProperty(window, "__lensflowVitals", { value: metrics });
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) metrics.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => { for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!entry.hadRecentInput) metrics.cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await page.waitForTimeout(1600);
  const metrics = await page.evaluate(() => (window as unknown as { __lensflowVitals: { lcp: number; cls: number } }).__lensflowVitals);
  expect(metrics.lcp).toBeGreaterThan(0);
  expect(metrics.lcp).toBeLessThanOrEqual(2500);
  expect(metrics.cls).toBeLessThanOrEqual(0.1);
});
