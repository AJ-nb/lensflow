# 砚台

砚台是一款面向设计师的开源 Chrome Manifest V3 扩展。它从网页或本地图片中提取设计语言、设计手法、造型结构、完整 CMF、提示词和结构化 JSON，并提供本地 OCR、相似图、主体分区、SVG、Eagle 与 img2threejs 交接能力。

当前版本：`0.6.1`。公开仓库：`AJ-nb/luck-power`。

![砚台 Logo](public/brand/yantai-logo.png)

## 核心能力

- 网页主动选图、本地上传、粘贴与图片 URL 导入
- 概览优先或直接完整分析，选择后再生成
- 设计语言、手法、造型来源假设、相似策略与原创迁移建议
- 完整 CMF：颜色角色、材料区域、表面处理、连接、磨损与风险
- HEX、RGB、CMYK、OKLCH 与 Pantone 视觉近似候选
- 严格 JSON、正向/负向提示词与提示词版本管理
- 非破坏性裁切、多材料区域、历史对比与颜色校正
- 本地 OCR、64 位差异哈希相似图、MediaPipe 主体分区与分层 SVG
- Eagle 标签映射、注释、来源网站、单项导入与独立批处理插件
- 带证据边界、缺失视图与确定性种子的 img2threejs 交接包
- 版本化数据备份，支持合并或替换恢复

## 安全与隐私

砚台不内置 API Base URL，也不代理或出售 API 服务。用户必须自行填写 OpenAI API 兼容的 HTTPS 端点与 API Key。

- API Key 默认只保存在浏览器会话存储中，关闭浏览器后清除。
- 只有用户开启“在此设备长期保存”后，密钥才写入扩展本地存储。
- 默认备份不包含 API Key；包含密钥必须单独勾选并会显示明文警告。
- AI 分析和图片编辑会把所选图片、提示词和请求发送到用户配置的 API 服务商。
- OCR、相似图搜索、调色与主体分区在本地运行，不向配置的 API 发送图片。
- 扩展不在所有网页常驻注入脚本。用户点击“从当前网页选择”后，只在当前标签页临时启用选图层。
- API、图片 URL 和 Eagle 访问均在用户操作时按具体域名申请权限。
- 远程 API 必须使用 HTTPS；HTTP 只允许 `localhost`、`127.0.0.1` 与 `::1`。
- URL 不允许嵌入用户名或密码。

完整说明见 [PRIVACY.md](PRIVACY.md) 与 [SECURITY.md](SECURITY.md)。

## 安装

### 从源码构建

需要 Node.js 20 或更高版本。

```bash
npm ci
npm run typecheck
npm test
npm run build
```

在 Chrome 打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，加载：

```text
.output/chrome-mv3
```

生成分发 ZIP：

```bash
npm run zip
```

### 正式升级与数据保留

Chrome 的设置和 IndexedDB 数据绑定扩展 ID。正式多人分发应使用同一个 Chrome Web Store 条目；同一扩展 ID 的正常升级会自动保留设置、档案和提示词版本。

第一次从旧的解压版或不同扩展 ID 迁移时：

1. 在旧版“设置 -> 数据管理”导出完整备份。
2. 安装新的固定 ID 版本。
3. 在新版选择“合并现有数据”并导入备份。
4. 后续只更新同一商店条目，不让用户删除重装。

## API 设置

1. 打开“设置”。
2. 填写 API Key 和完整 API Base URL，例如 `https://api.example.com/v1`。
3. 选择密钥仅本次使用或在此设备长期保存。
4. 点击“连接并读取模型”，确认域名权限。
5. 从端点返回的目录中选择通用分析模型与图片编辑模型并保存。

模型分类只依据模型 ID。`/models` 通常不声明完整能力，最终以端点实际响应为准。

## Eagle 集成

Chrome 扩展按需访问本地 Eagle API `http://localhost:41595`，用于读取图库、文件夹并完成写入回读。独立 Eagle 插件位于：

```text
eagle-plugin/visual-lens-bridge
```

批处理必须先用 `--limit=1` 验证单项写入，再执行全库：

```bash
node eagle-plugin/visual-lens-bridge/tools/batch-process.mjs --apply --limit=1
node eagle-plugin/visual-lens-bridge/tools/batch-process.mjs --apply
```

## 开发验证

```bash
npm run typecheck
npm test
npm run build
npm run zip
```

提示词合同与延迟冒烟评测：

```bash
npm run prompt:eval
```

评测使用环境变量读取密钥，不将密钥写入仓库。示例见 `promptfoo/README.md`。

## 证据边界

- 单张图片不能确认真实材料牌号、配方、涂镀层、耐刮、耐候或量产工艺。
- CMYK 是由图像 RGB 换算的参考值，不是印刷打样结果。
- Pantone 是视觉近似候选，不是分光测色或实体色卡匹配。
- 造型来源、设计师、设计语言与相似策略均是需要核验的分析候选。
- 三视图和主体分区属于模型估计，不能替代真实视角、尺寸、隐藏结构或 CAD。
- 分析结果不能证明专利清白、原创性、材料性能或制造可行性。

## 开源许可

砚台源码使用 [MIT License](LICENSE)。第三方模型与本地运行时保留各自许可，见 `public/vendor/THIRD_PARTY_NOTICES.txt`。
