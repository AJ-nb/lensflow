import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EAGLE_API = "http://localhost:41595";
const MCP_API = "http://127.0.0.1:41596";
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 1) : Infinity;
const outputArg = process.argv.find((value) => value.startsWith("--output="));
const outputDir = path.resolve(outputArg ? outputArg.slice("--output=".length) : "output/eagle-phase4a");

const stageRules = [
  [/参考|灵感|moodboard|reference|inspiration/i, ["阶段/参考"]],
  [/草图|概念|设计稿|sketch|concept|draft/i, ["阶段/设计"]],
  [/成品|定稿|交付|final|release|delivery/i, ["阶段/成品"]]
];

await fs.mkdir(outputDir, { recursive: true });
const startedAt = new Date().toISOString();
const [itemsResponse, foldersResponse, libraryResponse, healthResponse] = await Promise.all([
  eagleGet("/api/item/list?limit=1000"),
  eagleGet("/api/folder/list"),
  eagleGet("/api/library/info"),
  fetch(`${MCP_API}/health`)
]);
if (!healthResponse.ok) throw new Error(`Eagle MCP Server 不可用：HTTP ${healthResponse.status}`);

const folderMap = flattenFolders(foldersResponse.data || []);
const allItems = (itemsResponse.data || []).filter((item) => !item.isDeleted);
const entries = allItems.map((item) => {
  const folderNames = (item.folders || []).map((id) => folderMap.get(id) || id);
  const proposedTags = mapTags(item, folderNames);
  const tagsBefore = Array.isArray(item.tags) ? item.tags : [];
  const tagsToAdd = proposedTags.filter((tag) => !tagsBefore.includes(tag));
  return {
    id: item.id,
    name: item.name || "未命名条目",
    ext: item.ext || "",
    folders: folderNames,
    tagsBefore,
    proposedTags,
    tagsToAdd
  };
});

const library = libraryResponse.data?.library || libraryResponse.data || {};
const baseline = {
  schemaVersion: "1.0",
  mode: apply ? "apply" : "preview",
  createdAt: startedAt,
  library: { name: library.name || "未知", path: library.path || "未知" },
  policy: {
    writeMode: "append-only",
    automaticEvidence: ["现有文件夹名称", "文件扩展名", "本次同步事实"],
    excluded: ["材料", "工艺", "结构零件", "AI 来源", "产品同款", "真实来源"]
  },
  summary: {
    totalItems: entries.length,
    untaggedBefore: entries.filter((entry) => entry.tagsBefore.length === 0).length,
    queuedItems: entries.filter((entry) => entry.tagsToAdd.length > 0).length,
    unchangedItems: entries.filter((entry) => entry.tagsToAdd.length === 0).length
  },
  items: entries
};
await writeBaselineOnce(baseline);
const originalBaseline = JSON.parse(await fs.readFile(path.join(outputDir, "baseline.json"), "utf8"));

if (!apply) {
  console.log(JSON.stringify({ outputDir, ...baseline.summary }, null, 2));
}

if (apply) {
  const queue = entries.filter((entry) => entry.tagsToAdd.length > 0).slice(0, limit);
  const results = [];
  for (let index = 0; index < queue.length; index += 25) {
    const batch = queue.slice(index, index + 25);
    for (const entry of batch) {
      try {
        const tagsAfter = unique(entry.tagsBefore.concat(entry.tagsToAdd));
        const updated = await callTool("item_update", { items: [{ id: entry.id, tags: tagsAfter }] });
        const updateResult = updated.data?.[0];
        if (!updateResult?.success) throw new Error(updateResult?.error || "写入失败");
        const verified = await callTool("item_get", { ids: [entry.id], fullDetails: true, limit: 1 });
        const saved = verified.data?.find((item) => item.id === entry.id);
        if (!saved || !entry.tagsToAdd.every((tag) => (saved.tags || []).includes(tag))) throw new Error("写入后回读不一致");
        results.push({ id: entry.id, name: entry.name, status: "success", tagsAdded: entry.tagsToAdd, tagsAfter: saved.tags, verified: true });
      } catch (error) {
        results.push({ id: entry.id, name: entry.name, status: "failed", tagsAdded: entry.tagsToAdd, verified: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    console.log(`已处理 ${Math.min(index + batch.length, queue.length)}/${queue.length}`);
  }

  const result = {
    schemaVersion: "1.0",
    startedAt,
    finishedAt: new Date().toISOString(),
    library: baseline.library,
    requestedLimit: Number.isFinite(limit) ? limit : null,
    summary: {
      totalLibraryItems: entries.length,
      attempted: results.length,
      success: results.filter((entry) => entry.status === "success").length,
      failed: results.filter((entry) => entry.status === "failed").length
    },
    results
  };
  await writeJson(Number.isFinite(limit) ? `result-limit-${limit}.json` : "result.json", result);
  console.log(JSON.stringify({ outputDir, ...result.summary }, null, 2));
}

const verification = await verifyLibrary(originalBaseline);
await writeJson("verification.json", verification);
if (apply) console.log(JSON.stringify({ verification: verification.summary }, null, 2));

function mapTags(item, folderNames) {
  let tags = ["同步/Lensflow"];
  for (const name of folderNames) {
    const folderTag = tagSegment(name);
    if (folderTag) tags.push(`图库/${folderTag}`);
    for (const [pattern, values] of stageRules) if (pattern.test(name)) tags.push(...values);
  }
  const extension = String(item.ext || "").trim().toUpperCase();
  if (extension) tags.push(`文件/${extension === "JPEG" ? "JPG" : extension}`);
  return unique(tags);
}

function tagSegment(value) {
  return String(value || "").replace(/[\r\n/\\]+/g, "-").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function flattenFolders(folders, output = new Map()) {
  for (const folder of folders) {
    output.set(folder.id, folder.name);
    flattenFolders(folder.children || [], output);
  }
  return output;
}

async function eagleGet(route) {
  const response = await fetch(`${EAGLE_API}${route}`);
  const body = await response.json();
  if (!response.ok || body.status !== "success") throw new Error(body.error || `Eagle HTTP ${response.status}`);
  return body;
}

async function callTool(tool, params) {
  const response = await fetch(`${MCP_API}/api/tools/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, params })
  });
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(body.error || `Eagle MCP HTTP ${response.status}`);
  return body;
}

async function writeJson(fileName, value) {
  await fs.writeFile(path.join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBaselineOnce(value) {
  const baselinePath = path.join(outputDir, "baseline.json");
  try {
    await fs.access(baselinePath);
  } catch {
    await writeJson("baseline.json", value);
  }
}

async function verifyLibrary(originalBaseline) {
  const response = await eagleGet("/api/item/list?limit=1000");
  const currentItems = (response.data || []).filter((item) => !item.isDeleted);
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const failures = [];
  for (const before of originalBaseline.items) {
    const current = currentById.get(before.id);
    if (!current) {
      failures.push({ id: before.id, name: before.name, issue: "item-missing" });
      continue;
    }
    const currentTags = Array.isArray(current.tags) ? current.tags : [];
    const lostTags = before.tagsBefore.filter((tag) => !currentTags.includes(tag));
    const missingTags = before.proposedTags.filter((tag) => !currentTags.includes(tag));
    if (lostTags.length || missingTags.length) {
      failures.push({ id: before.id, name: before.name, issue: "tag-mismatch", lostTags, missingTags });
    }
  }
  const tagCounts = {};
  for (const item of currentItems) {
    for (const tag of item.tags || []) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  const summary = {
    baselineItems: originalBaseline.items.length,
    currentItems: currentItems.length,
    syncedItems: currentItems.filter((item) => (item.tags || []).includes("同步/Lensflow")).length,
    untaggedItems: currentItems.filter((item) => !(item.tags || []).length).length,
    failures: failures.length,
    passed: currentItems.length === originalBaseline.items.length && failures.length === 0
  };
  return {
    schemaVersion: "1.0",
    verifiedAt: new Date().toISOString(),
    library: originalBaseline.library,
    summary,
    tagCounts: Object.fromEntries(Object.entries(tagCounts).sort((left, right) => right[1] - left[1])),
    failures
  };
}
