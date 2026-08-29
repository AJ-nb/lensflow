import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import {
  formatRuntimeMessageError,
  isExtensionContextInvalidatedError
} from "../shared/runtime-messaging";
import type { ImageSource, RuntimeRequest, RuntimeResponse } from "../shared/types";

export default defineUnlistedScript({
  main() {
    if (document.documentElement.dataset.lensflowPicker === "active") return;
    document.documentElement.dataset.lensflowPicker = "active";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = "P";
    trigger.title = "反推提示词";
    trigger.setAttribute("aria-label", "用 Lensflow 反推提示词");
    Object.assign(trigger.style, {
      position: "fixed",
      display: "none",
      zIndex: "2147483647",
      height: "32px",
      width: "34px",
      padding: "0",
      border: "1px solid rgba(255,255,255,.68)",
      borderRadius: "6px",
      background: "rgba(17,24,39,.92)",
      color: "#ffffff",
      font: "600 12px/1 system-ui, sans-serif",
      letterSpacing: "0",
      boxShadow: "0 4px 12px rgba(0,0,0,.22)",
      cursor: "pointer"
    });
    const generateTrigger = trigger.cloneNode(true) as HTMLButtonElement;
    generateTrigger.textContent = "V";
    generateTrigger.title = "反推提示词后进入生成";
    generateTrigger.setAttribute("aria-label", "用 Lensflow 反推并生成");
    generateTrigger.style.background = "rgba(201,16,72,.95)";
    document.body.append(trigger, generateTrigger);

    let activeImage: HTMLImageElement | null = null;
    let disposed = false;

    const onRuntimeMessage = (message: { type?: string }) => {
      if (message.type === "DISABLE_PAGE_PICKER") dispose();
    };

    const MAX_SNAPSHOT_EDGE = 1536;
    const MAX_SNAPSHOT_BYTES = 1_500_000;

    const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> => (
      new Promise((resolve) => canvas.toBlob(resolve, type, quality))
    );

    const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("图片快照编码失败。"));
      reader.readAsDataURL(blob);
    });

    const canvasHasTransparency = (context: CanvasRenderingContext2D, width: number, height: number): boolean => {
      const pixels = context.getImageData(0, 0, width, height).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index]! < 255) return true;
      }
      return false;
    };

    const isFullyVisibleThroughClippingAncestors = (image: HTMLImageElement): boolean => {
      const rect = image.getBoundingClientRect();
      let visibleLeft = Math.max(0, rect.left);
      let visibleTop = Math.max(0, rect.top);
      let visibleRight = Math.min(innerWidth, rect.right);
      let visibleBottom = Math.min(innerHeight, rect.bottom);
      let ancestor = image.parentElement;
      while (ancestor && ancestor !== document.documentElement) {
        const style = getComputedStyle(ancestor);
        if ([style.overflowX, style.overflowY].some((value) => ["auto", "clip", "hidden", "scroll"].includes(value))) {
          const ancestorRect = ancestor.getBoundingClientRect();
          visibleLeft = Math.max(visibleLeft, ancestorRect.left);
          visibleTop = Math.max(visibleTop, ancestorRect.top);
          visibleRight = Math.min(visibleRight, ancestorRect.right);
          visibleBottom = Math.min(visibleBottom, ancestorRect.bottom);
        }
        ancestor = ancestor.parentElement;
      }
      const tolerance = 1;
      return visibleLeft <= rect.left + tolerance
        && visibleTop <= rect.top + tolerance
        && visibleRight >= rect.right - tolerance
        && visibleBottom >= rect.bottom - tolerance;
    };

    const createCompleteSnapshot = async (image: HTMLImageElement): Promise<string | undefined> => {
      if (!image.complete || !image.naturalWidth || !image.naturalHeight) return undefined;
      let scale = Math.min(1, MAX_SNAPSHOT_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      try {
        let output: Blob | null = null;
        let transparent = false;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return undefined;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          transparent = canvasHasTransparency(context, canvas.width, canvas.height);
          output = await canvasToBlob(canvas, transparent ? "image/png" : "image/jpeg", transparent ? undefined : 0.86);
          if (!output || output.size <= MAX_SNAPSHOT_BYTES) break;
          scale *= Math.sqrt(MAX_SNAPSHOT_BYTES / output.size) * 0.92;
        }
        if (!output || output.size > MAX_SNAPSHOT_BYTES) return undefined;
        return blobToDataUrl(output);
      } catch {
        // Cross-origin images may taint the canvas; the background fetch path remains available.
        return undefined;
      }
    };

    const updatePosition = () => {
      if (!activeImage || !document.contains(activeImage)) {
        hide();
        return;
      }
      const rect = activeImage.getBoundingClientRect();
      if (rect.width < 96 || rect.height < 96 || rect.bottom < 0 || rect.top > innerHeight) {
        hide();
        return;
      }
      trigger.style.display = "block";
      generateTrigger.style.display = "block";
      trigger.style.left = `${Math.max(8, rect.left + 8)}px`;
      generateTrigger.style.left = `${Math.max(48, rect.left + 46)}px`;
      trigger.style.top = `${Math.max(8, rect.top + 8)}px`;
      generateTrigger.style.top = `${Math.max(8, rect.top + 8)}px`;
    };

    const hide = () => {
      activeImage = null;
      trigger.style.display = "none";
      generateTrigger.style.display = "none";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.target === trigger || event.target === generateTrigger) return;
      const element = event.target instanceof Element ? event.target.closest("img") : null;
      if (!(element instanceof HTMLImageElement)) {
        if (!trigger.matches(":hover") && !generateTrigger.matches(":hover")) hide();
        return;
      }
      activeImage = element;
      updatePosition();
    };

    const selectImage = async (event: MouseEvent, intent: "analyze" | "analyze-generate") => {
      event.preventDefault();
      event.stopPropagation();
      if (!activeImage) return;
      const selectedImage = activeImage;
      const rect = selectedImage.getBoundingClientRect();
      const naturalRatio = selectedImage.naturalWidth / Math.max(1, selectedImage.naturalHeight);
      const renderedRatio = rect.width / Math.max(1, rect.height);
      const objectFit = getComputedStyle(selectedImage).objectFit;
      const activeTrigger = intent === "analyze-generate" ? generateTrigger : trigger;
      activeTrigger.textContent = "…";
      const completeSnapshot = await createCompleteSnapshot(selectedImage);
      const source: ImageSource = {
        id: crypto.randomUUID(),
        kind: "web",
        url: selectedImage.currentSrc || selectedImage.src,
        dataUrl: completeSnapshot,
        pageUrl: location.href,
        pageTitle: document.title,
        alt: selectedImage.alt,
        declaredWidth: selectedImage.naturalWidth,
        declaredHeight: selectedImage.naturalHeight,
        crop: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          devicePixelRatio: window.devicePixelRatio || 1,
          fullyVisible: isFullyVisibleThroughClippingAncestors(selectedImage),
          contentMayBeCropped: objectFit === "cover" && Math.abs(naturalRatio - renderedRatio) > 0.01
        }
      };
      activeTrigger.textContent = "✓";
      try {
        const response = (await browser.runtime.sendMessage({
          type: "SET_SELECTION",
          source,
          intent
        } satisfies RuntimeRequest)) as RuntimeResponse;
        if (disposed) return;
        activeTrigger.textContent = response.ok ? (intent === "analyze-generate" ? "V" : "P") : "!";
        activeTrigger.title = response.ok ? (intent === "analyze-generate" ? "反推提示词后进入生成" : "反推提示词") : response.error;
      } catch (error) {
        if (isExtensionContextInvalidatedError(error)) {
          dispose();
          return;
        }
        if (disposed) return;
        activeTrigger.textContent = "!";
        activeTrigger.title = formatRuntimeMessageError(error);
      }
    };
    const onAnalyzeClick = (event: MouseEvent) => { void selectImage(event, "analyze"); };
    const onGenerateClick = (event: MouseEvent) => { void selectImage(event, "analyze-generate"); };

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      activeImage = null;
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      trigger.removeEventListener("click", onAnalyzeClick);
      generateTrigger.removeEventListener("click", onGenerateClick);
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      trigger.remove();
      generateTrigger.remove();
      delete document.documentElement.dataset.lensflowPicker;
    };

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    trigger.addEventListener("click", onAnalyzeClick);
    generateTrigger.addEventListener("click", onGenerateClick);
    browser.runtime.onMessage.addListener(onRuntimeMessage);

  }
});
