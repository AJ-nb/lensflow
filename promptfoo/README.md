# 提示词评测基线

该基线用于检查 OpenAI 兼容视觉模型的最小完整 JSON 合同与端到端延迟，不替代应用内“快速概览 + 三路并行完整分析”的 Structured Outputs 测试。

在 PowerShell 中临时设置环境变量后运行：

```powershell
$env:VISUAL_LENS_API_KEY = "your-key"
$env:VISUAL_LENS_API_BASE_URL = "https://api.example.com/v1"
$env:VISUAL_LENS_ANALYSIS_MODEL = "your-vision-model"
$env:VISUAL_LENS_EVAL_IMAGE_DATA_URL = "data:image/jpeg;base64,..."
npm run prompt:eval
```

结果写入 `promptfoo-output/latest.json`，该目录已被 Git 忽略。密钥和测试图片不会由配置文件读取或持久化。
