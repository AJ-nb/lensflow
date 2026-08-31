# 镜序 Lensflow

从网页灵感到可复用创作资产的本地 AI 工作台。Lensflow 是一个 MIT 许可的 Chrome 扩展与产品网站 monorepo，不包含账号、积分、收费、云数据库或跨设备同步。

## 工作流

1. 从网页图片、本地图片或划词开始，完成本地尺寸、比例、哈希和色卡测量。
2. 使用用户选择的 Provider 生成结构化解构、自然语言提示词和可编辑变体。
3. 通过风格、主体、构图、色彩、动态五轴及参考关系完成组合和提交预检。
4. 以 1-10 张持久化批次生成；成功项不会因部分失败丢失，失败位置只能由用户手动补全。
5. 在扇形卡池中揭示、下载、收入作品集或主动导出到 Eagle。

Lensflow 不内置演示素材、模板、关键词或模型目录。模型始终来自认证后的 `${baseUrl}/models`。

## Monorepo

- `apps/extension`: WXT + React Chrome 扩展、后台任务与网页桥接
- `apps/site`: Astro + Starlight 产品网站、Studio 与文档
- `packages/contracts`: Zod 数据、Provider、桥接与发布合同
- `packages/core`: Dexie 数据库、Provider 适配器和领域逻辑
- `packages/ui`: 网站和插件共享的生产工作台 UI
- `integrations/eagle`: Eagle 批处理插件

## Provider

内置彼源预设 `https://api.biyuan.ai/v1`，并支持自定义 OpenAI-compatible 地址与 ComfyUI API-workflow JSON。Base URL 被视为完整前缀，不会自动追加 `/v1`。

API Key 默认保存在 `chrome.storage.session`。只有用户明确选择“在本机记住”后才写入 `chrome.storage.local`；网页、IndexedDB、日志、诊断包和备份均不能读取密钥。

## 本地开发

项目固定使用 Node.js `24.14.1` 与 npm `11.11.0`。版本文件与 `packageManager` 字段用于让本地和 CI 使用同一工具链。

```bash
npm ci
npm run typecheck
npm test
npm run build
```

扩展构建目录为 `.output/chrome-mv3`。在 `chrome://extensions` 开启开发者模式后，使用“加载已解压的扩展程序”选择该目录。

```bash
npm run dev:site
npm run dev:extension
npm run zip
```

真实 API 测试默认关闭。只有显式设置 `LENSFLOW_REAL_API=1` 才可读取本机测试密钥；付费烟测还必须设置 `LENSFLOW_BILLABLE_SMOKE=1`，每项最多一次且不自动重试。

## 数据与权限

Dexie 数据库包含 `captures`、`analyses`、`prompts`、`references`、`generationJobs`、`assets`、`collections`、`historyEvents` 和 `settingsMeta`。旧扩展数据通过导出/导入迁移，导入时无条件丢弃 API Key。

扩展只要求 `activeTab`、`scripting` 等功能权限以及 Lensflow 正式站点桥接地址。Provider 和 Eagle 地址使用按需可选权限；网页桥接禁止读取密钥、浏览历史、任意文件和任意 URL。

更多信息见 [隐私说明](PRIVACY.md)、[安全政策](SECURITY.md)、[贡献指南](CONTRIBUTING.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 许可与边界

项目采用 [MIT License](LICENSE)。Lensflow 只实现公开可验证的创作工作流，不复制 Viko 或其他产品的品牌、媒体、逐字文案、私有代码、登录后数据或服务端接口。
