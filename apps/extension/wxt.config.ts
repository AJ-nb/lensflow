import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  webExt: {
    disabled: true
  },
  manifest: {
    name: "镜序 Lensflow",
    description: "从网页灵感到可复用创作资产的本地 AI 工作台。",
    version: "0.3.3",
    minimum_chrome_version: "122",
    permissions: ["activeTab", "alarms", "downloads", "storage", "contextMenus", "sidePanel", "scripting"],
    host_permissions: ["https://aj-nb.github.io/lensflow/*"],
    optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
    action: {
      default_title: "打开镜序 Lensflow"
    },
    side_panel: {
      default_path: "sidepanel.html"
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' http: https: ws: wss:"
    }
  }
});
