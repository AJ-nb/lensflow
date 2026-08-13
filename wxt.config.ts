import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      delete manifest.host_permissions;
    }
  },
  webExt: {
    disabled: true
  },
  manifest: {
    name: "砚台",
    description: "从网页图片提取主体结构、完整 CMF、相关参考与重建参数，并提供图片编辑。",
    version: "0.6.1",
    minimum_chrome_version: "122",
    permissions: ["storage", "contextMenus", "sidePanel", "activeTab", "scripting"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    action: {
      default_title: "打开砚台"
    },
    side_panel: {
      default_path: "sidepanel.html"
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' http: https: ws: wss:"
    }
  }
});
