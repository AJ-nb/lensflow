import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://aj-nb.github.io",
  base: "/lensflow",
  output: "static",
  devToolbar: { enabled: false },
  integrations: [
    react(),
    sitemap(),
    starlight({
      title: "镜序 Lensflow 文档",
      description: "Lensflow 本地 AI 创作工作台文档",
      favicon: "/favicon.png",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/AJ-nb/lensflow" }],
      sidebar: [
        { label: "开始使用", items: [{ label: "概览", slug: "docs" }, { label: "安装", slug: "docs/install" }, { label: "Provider", slug: "docs/provider" }] },
        { label: "创作工作流", items: [{ label: "捕捉入口", slug: "docs/capture" }, { label: "产品分析与提示词", slug: "docs/analysis" }, { label: "组合与生成", slug: "docs/studio" }, { label: "隐私与备份", slug: "docs/privacy" }] }
      ],
      customCss: ["./src/styles/starlight.css"]
    })
  ],
  vite: {
    server: { host: "0.0.0.0", allowedHosts: ["localhost", "127.0.0.1"] }
  }
});
