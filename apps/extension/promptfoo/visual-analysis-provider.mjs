function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function responseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text) return payload.output_text;
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("评测端点没有返回文本内容");
}

export default class VisualLensAnalysisProvider {
  id() {
    return "lensflow:openai-compatible-responses";
  }

  async callApi(prompt) {
    try {
      const apiKey = requiredEnvironment("VISUAL_LENS_API_KEY");
      const apiBaseUrl = requiredEnvironment("VISUAL_LENS_API_BASE_URL").replace(/\/+$/, "");
      const model = requiredEnvironment("VISUAL_LENS_ANALYSIS_MODEL");
      const imageDataUrl = requiredEnvironment("VISUAL_LENS_EVAL_IMAGE_DATA_URL");
      const startedAt = performance.now();
      const response = await fetch(`${apiBaseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          instructions: prompt,
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: "完成快速模式设计分析。数组只保留最关键的三项。" },
              { type: "input_image", image_url: imageDataUrl, detail: "low" }
            ]
          }],
          max_output_tokens: 2500
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
      return {
        output: responseText(payload),
        metadata: {
          latencyMs: Math.round(performance.now() - startedAt),
          model,
          endpoint: apiBaseUrl
        },
        tokenUsage: payload.usage ? {
          prompt: payload.usage.input_tokens,
          completion: payload.usage.output_tokens,
          total: payload.usage.total_tokens
        } : undefined
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
