# Lensflow 设计学习升级路线

更新时间：2026-08-12

## 产品原则

Lensflow 的核心流程是：先判断一张图是否值得学习，再提炼可迁移的设计机制，理解决策与代价，转化为原创练习，最后收集验证证据。完整 JSON、Eagle 导入和生成式功能都由用户按需触发，不阻塞第一阶段概览。

单张图片只能证明可见像素、相对位置、轮廓、遮挡、颜色样本与可见连接。真实材料、工艺、功能、人因、成本、安全、生产可行性、设计师和设计来源均须标记为推断、估计或未知。

## 已完成

- 完整图片查看：导入图使用固定预览盒与 `object-fit: contain`，避免 Grid 固有最小尺寸导致竖图被截断。
- 原始像素查看：提供“完整 / 1:1”切换，1:1 只在图片区域内滚动，控件固定在右上角。
- 网页图片完整性：优先读取完整加载像素；拒绝把视口外、祖先容器裁切或 CSS `cover` 裁切的截图当作原图。
- 有界网页快照：最长边 1536 px；普通照片使用 JPEG，透明图保留 PNG；编码结果限制为 1.5 MB，避免拖慢消息与会话存储。
- 渐进分析：先生成概览，再由用户决定是否生成完整 JSON。
- 设计学习概览：学习价值、设计 DNA、可探索变量、推荐专题与最大信息缺口。
- 设计学习简报：识别机制、保留项、可变变量、禁止照搬项、决策权衡、原创练习和验证证据。
- 证据边界：完整分析和设计判断分别展示可见、推断和未知项。
- 已有本地能力：EXIF/XMP、色彩测量、OCR、点击式主体分区、dHash 相似图、档案、SVG 和 Eagle 导入桥。

## 下一步候选

| 优先级 | 能力 | 候选项目 | 采用条件 | 主要风险 |
| --- | --- | --- | --- | --- |
| P1 | 高分图缩放与平移 | [OpenSeadragon](https://github.com/openseadragon/openseadragon) | 当前完整/1:1 模式无法满足局部细节研究时 | 包体与手势复杂度 |
| P1 | 图片来源与编辑历史 | [C2PA JS](https://github.com/contentauth/c2pa-js) | 先定义“已验证 / 未发现凭据 / 验证失败”三态 | WASM 体积；无凭据不等于伪造 |
| P1 | 语义相似图 | [Transformers.js](https://github.com/huggingface/transformers.js) | 建立按需模型缓存、进度、取消和低配回退 | 首次下载、内存与 WebGPU 兼容性 |
| P1 | 本地混合搜索 | [Orama](https://github.com/oramasearch/orama) | 统一 OCR、标签、JSON、颜色和向量索引迁移 | 浏览器存储配额和索引版本 |
| P1 | 精细区域证据锚点 | [Annotorious](https://github.com/annotorious/annotorious) | 验证 React 19、触屏和缩放坐标同步 | 与现有材料标注功能重叠 |
| P1 | 历史差异热图 | [Pixelmatch](https://github.com/mapbox/pixelmatch) | 仅比较已配准、同构视角图片 | 未对齐会制造假差异 |
| P1 | 网页来源上下文 | [Mozilla Readability](https://github.com/mozilla/readability) | 只作为页面上下文，不作为版权证明 | 动态页和电商页抽取不稳定 |
| P2 | 更高质量轮廓矢量化 | [VTracer](https://github.com/visioncortex/vtracer) | 浏览器 WASM 体积与速度验证通过 | 不是直接可用的 React 组件 |
| P2 | 设计关系图 | [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) | 至少形成部件、材料、来源三类稳定关系 | 窄侧栏不适合复杂图谱编辑 |
| P3 | 参数化 CAD 出口 | [CadQuery](https://github.com/CadQuery/cadquery) / [FreeCAD](https://github.com/FreeCAD/FreeCAD) | 仅导出经设计师确认的约束与尺寸 | 单图不能生成可制造 CAD |

## Eagle 路线

继续以 [Eagle 官方 Web API](https://api.eagle.cool/) 为主，不让 Chrome 扩展依赖任意脚本执行。后续增加 SHA-256 去重、增量读取、标签映射版本、冲突预览、批次暂停/恢复、失败重试、写入后回读验证。删除操作永不自动同步。

可研究但不直接复制的项目：

- [eagle-mcp-server](https://github.com/tuki0918/eagle-mcp-server)：参考图库、文件夹、缩略图和批处理覆盖。
- [Obsidian-EagleBridge](https://github.com/zyjGraphein/Obsidian-EagleBridge)：参考标签同步与缓存策略；GPL-3.0 限制直接并入。
- [pnginfo-for-eagle-cool](https://github.com/Lektro9/pnginfo-for-eagle-cool)：参考生成参数映射；维护活跃度较低。

## 开发 Skills 与插件

开发流程优先使用已有 `apple-design`、`emil-design-eng`、`web-design-guidelines`、`product-design:audit`、`playwright`、`product-engineer-agent`、GitHub `yeet`。进一步可用的 Skills 包括品牌研究、评价分析、数据质量验证、可视化、Figma 设计系统和 OpenAI 文档核验。

建议连接器优先级：

1. Codex Security：审查 API Key、扩展权限、CSP、远程 URL 与 Eagle 本地桥。
2. Sentry：仅收集脱敏错误阶段和错误码，不上传图片、API Key 或完整提示词。
3. PostHog：仅 opt-in 统计耗时、失败阶段和功能使用，不采集图片内容。
4. Google Drive：备份用户明确选择的 JSON、SVG 和报告。
5. Supabase：只有明确需要跨设备同步时采用，本地模式必须保持完整可用。

不建议直接并入：已归档的 `react-image-annotation` 和 `ssim`；AGPL-3.0 且已取消产品需求的 `background-removal-js`；GPL-3.0 的 `Search by Image`；架构远超扩展需要的 Immich、PhotoPrism 和 WebLLM。

## 分析专题

后续完整分析拆成独立、可缓存、可取消的专题：

- 造型 DNA：轮廓、体块层级、比例、对称、圆角、负空间、分割线与视觉重心。
- 功能与人因：目标用户、任务、握持/穿戴、触达、状态、反馈和误操作风险假设。
- 结构与制造：部件树、连接、运动、装配顺序、失效模式、维修性和待实测问题。
- CMF 与耐久：实测颜色与模型推断分离，材料/表面候选、磨损、清洁和回收假设。
- 竞品与谱系：相似机制、关键差异、替代解释、反抄袭规则和核验查询。
- 摄影与复现：构图、镜头、光线、色偏、遮挡、提示词与复现误差。
- 多图联合分析：2 至 6 图共同模式、独特变量、视角一致性和配准后的差异。

每个专题输出都应沿用 `observed / measured / inferred / estimate / external / user / unknown` 证据类型。未运行的专题使用 `not_requested`，不能用空数组伪装成已完成分析。
