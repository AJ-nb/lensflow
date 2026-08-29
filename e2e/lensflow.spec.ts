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

function snapshot(options: { keyword?: boolean; childCount?: number; partial?: boolean } = {}) {
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
    protocolVersion: 1,
    extensionVersion: "0.1.0",
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
    assets: [],
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
    storage: { usage: 1024, quota: 1024 * 1024, persisted: true }
  };
}

async function installBridgeMock(page: Page, initialSnapshot: ReturnType<typeof snapshot>, incompatible = false) {
  await page.addInitScript(({ initialSnapshot, incompatible }) => {
    const state = structuredClone(initialSnapshot);
    Object.defineProperty(window, "__lensflowBridgeMethods", { value: [], writable: false });
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.type !== "LENSFLOW_BRIDGE_CONNECT") return;
      if (incompatible) {
        window.postMessage({ type: "LENSFLOW_BRIDGE_INCOMPATIBLE", nonce: event.data.nonce, expectedVersion: 2, receivedVersion: 1, extensionVersion: "0.0.9" }, location.origin);
        return;
      }
      const channel = new MessageChannel();
      channel.port1.onmessage = (message) => {
        const request = message.data;
        (window as unknown as { __lensflowBridgeMethods: string[] }).__lensflowBridgeMethods.push(request.method);
        let data: unknown = null;
        if (request.method === "version.get") data = { version: 1, extensionVersion: "0.1.0" };
        if (request.method === "snapshot.get") data = state;
        if (request.method === "provider.open") data = null;
        if (request.method === "analysis.open") data = null;
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
        channel.port1.postMessage({ version: 1, id: request.id, ok: true, data });
      };
      channel.port1.start();
      window.postMessage({ type: "LENSFLOW_BRIDGE_CONNECTED", nonce: event.data.nonce, version: 1 }, location.origin, [channel.port2]);
    });
  }, { initialSnapshot, incompatible });
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
