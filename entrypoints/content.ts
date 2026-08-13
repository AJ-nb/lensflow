import { defineContentScript } from "wxt/utils/define-content-script";
import {
  formatRuntimeMessageError,
  isExtensionContextInvalidatedError
} from "../shared/runtime-messaging";
import type { ImageSource, RuntimeRequest, RuntimeResponse } from "../shared/types";

export default defineContentScript({
  registration: "runtime",
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main(ctx) {
    if (document.documentElement.dataset.yantaiPicker === "active") return;
    document.documentElement.dataset.yantaiPicker = "active";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = "砚台分析";
    trigger.title = "分析这张图片";
    trigger.setAttribute("aria-label", "分析这张图片");
    Object.assign(trigger.style, {
      position: "fixed",
      display: "none",
      zIndex: "2147483647",
      height: "32px",
      padding: "0 12px",
      border: "1px solid rgba(255,255,255,.68)",
      borderRadius: "6px",
      background: "rgba(17,24,39,.92)",
      color: "#ffffff",
      font: "600 12px/1 system-ui, sans-serif",
      letterSpacing: "0",
      boxShadow: "0 4px 12px rgba(0,0,0,.22)",
      cursor: "pointer"
    });
    document.body.append(trigger);

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
      trigger.style.left = `${Math.max(8, rect.left + 8)}px`;
      trigger.style.top = `${Math.max(8, rect.top + 8)}px`;
    };

    const hide = () => {
      activeImage = null;
      trigger.style.display = "none";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.target === trigger) return;
      const element = event.target instanceof Element ? event.target.closest("img") : null;
      if (!(element instanceof HTMLImageElement)) {
        if (!trigger.matches(":hover")) hide();
        return;
      }
      activeImage = element;
      updatePosition();
    };

    const onClick = async (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!activeImage) return;
      const selectedImage = activeImage;
      const rect = selectedImage.getBoundingClientRect();
      const naturalRatio = selectedImage.naturalWidth / Math.max(1, selectedImage.naturalHeight);
      const renderedRatio = rect.width / Math.max(1, rect.height);
      const objectFit = getComputedStyle(selectedImage).objectFit;
      trigger.textContent = "正在读取";
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
      trigger.textContent = "已选择";
      try {
        const response = (await browser.runtime.sendMessage({
          type: "SET_SELECTION",
          source
        } satisfies RuntimeRequest)) as RuntimeResponse;
        if (disposed) return;
        trigger.textContent = response.ok ? "砚台分析" : "选择失败";
        trigger.title = response.ok ? "分析这张图片" : response.error;
      } catch (error) {
        if (isExtensionContextInvalidatedError(error)) {
          dispose();
          return;
        }
        if (disposed) return;
        trigger.textContent = "操作失败";
        trigger.title = formatRuntimeMessageError(error);
      }
    };

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      activeImage = null;
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      trigger.removeEventListener("click", onClick);
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      trigger.remove();
      delete document.documentElement.dataset.yantaiPicker;
    };

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    trigger.addEventListener("click", onClick);
    browser.runtime.onMessage.addListener(onRuntimeMessage);

    ctx.onInvalidated(dispose);
  }
});
