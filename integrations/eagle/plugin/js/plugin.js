(function () {
  "use strict";

  var state = {
    items: [],
    folders: new Map(),
    statusFilter: "all",
    query: "",
    running: false,
    paused: false,
    baseline: null,
    startedAt: null,
    finishedAt: null
  };

  var el = {};

  eagle.onPluginCreate(function () {
    bindElements();
    bindEvents();
    scanLibrary();
  });

  eagle.onPluginRun(function () {
    if (!state.items.length) scanLibrary();
  });

  eagle.onPluginShow(function () {
    if (!state.running) updateSummary();
  });

  eagle.onPluginBeforeExit(function (event) {
    if (state.running && !state.paused) {
      state.paused = true;
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      setStatus("队列已暂停", "再次关闭可退出；重新打开后可重新扫描未写入项", "warning");
    }
  });

  function bindElements() {
    ["libraryLine", "totalCount", "pendingCount", "successCount", "failureCount", "progressText", "progressBar",
      "statusDot", "statusTitle", "statusDetail", "exportBaseline", "exportReport", "refresh", "retry", "pause", "start",
      "batchSize", "search", "selectVisible", "filterAll", "filterPending", "filterSuccess", "filterFailed", "filterSkipped",
      "visibleCount", "queueBody", "emptyState"].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function bindEvents() {
    el.refresh.addEventListener("click", scanLibrary);
    el.start.addEventListener("click", startQueue);
    el.pause.addEventListener("click", togglePause);
    el.retry.addEventListener("click", retryFailed);
    el.exportBaseline.addEventListener("click", function () { exportJson(state.baseline, "lensflow-eagle-baseline.json"); });
    el.exportReport.addEventListener("click", exportReport);
    el.search.addEventListener("input", function (event) { state.query = event.target.value.trim().toLocaleLowerCase(); renderQueue(); });
    document.querySelectorAll(".filter").forEach(function (button) {
      button.addEventListener("click", function () {
        state.statusFilter = button.dataset.status;
        document.querySelectorAll(".filter").forEach(function (candidate) { candidate.classList.toggle("active", candidate === button); });
        renderQueue();
      });
    });
    el.selectVisible.addEventListener("change", function () {
      visibleItems().forEach(function (item) { if (item.status !== "success") item.selected = el.selectVisible.checked; });
      renderQueue();
    });
    el.queueBody.addEventListener("change", function (event) {
      var checkbox = event.target.closest("input[data-id]");
      if (!checkbox) return;
      var entry = state.items.find(function (item) { return item.id === checkbox.dataset.id; });
      if (entry) entry.selected = checkbox.checked;
      updateSummary();
    });
  }

  async function scanLibrary() {
    if (state.running) return;
    setStatus("正在扫描图库", "读取条目、文件夹和已有标签", "busy");
    el.refresh.disabled = true;
    try {
      var results = await Promise.all([eagle.item.get(), eagle.folder.get({ getAllHierarchy: true })]);
      state.folders = flattenFolders(results[1]);
      state.items = results[0].filter(function (item) { return !item.isDeleted; }).map(function (item) {
        var folderNames = (item.folders || []).map(function (id) { return state.folders.get(id) || id; });
        var proposedTags = window.VisualLensMapping.mapItem(item, folderNames);
        var existingTags = Array.isArray(item.tags) ? item.tags.slice() : [];
        var newTags = proposedTags.filter(function (tag) { return !existingTags.includes(tag); });
        return {
          id: item.id,
          name: item.name || "未命名条目",
          ext: item.ext || "",
          folderNames: folderNames,
          existingTags: existingTags,
          proposedTags: proposedTags,
          newTags: newTags,
          selected: newTags.length > 0,
          status: newTags.length ? "pending" : "skipped",
          error: "",
          verified: false
        };
      });
      var library = eagle.library && eagle.library.info ? await eagle.library.info() : null;
      el.libraryLine.textContent = library && library.name ? library.name + " · " + state.items.length + " 项" : "当前图库 · " + state.items.length + " 项";
      state.baseline = createBaseline();
      state.startedAt = null;
      state.finishedAt = null;
      el.exportBaseline.disabled = false;
      el.exportReport.disabled = true;
      setStatus("扫描完成", "写入前基线已生成；确认预览后开始队列", "ready");
      renderQueue();
    } catch (error) {
      setStatus("扫描失败", errorMessage(error), "error");
    } finally {
      el.refresh.disabled = false;
    }
  }

  function createBaseline() {
    return {
      schemaVersion: "1.0",
      createdAt: new Date().toISOString(),
      totalItems: state.items.length,
      untaggedItems: state.items.filter(function (item) { return !item.existingTags.length; }).length,
      queuedItems: state.items.filter(function (item) { return item.newTags.length; }).length,
      evidencePolicy: "folder-and-extension-only",
      items: state.items.map(function (item) {
        return { id: item.id, name: item.name, ext: item.ext, folders: item.folderNames, tagsBefore: item.existingTags, proposedTags: item.newTags };
      })
    };
  }

  async function startQueue() {
    if (state.running) return;
    var queue = state.items.filter(function (item) { return item.selected && item.status === "pending"; });
    if (!queue.length) return setStatus("没有待处理条目", "勾选至少一个待处理条目", "warning");
    state.running = true;
    state.paused = false;
    state.startedAt = state.startedAt || new Date().toISOString();
    lockControls(true);
    setStatus("正在写入队列", "逐项追加标签并回读验证", "busy");
    var batchSize = Math.max(1, Number(el.batchSize.value) || 25);
    for (var index = 0; index < queue.length; index += batchSize) {
      if (state.paused) break;
      var batch = queue.slice(index, index + batchSize);
      for (var offset = 0; offset < batch.length; offset += 1) {
        if (state.paused) break;
        await processItem(batch[offset]);
        renderQueue(false);
      }
      await nextFrame();
    }
    state.running = false;
    lockControls(false);
    if (state.paused) {
      setStatus("队列已暂停", "点击继续处理剩余项目", "warning");
      el.start.textContent = "继续批处理";
    } else {
      state.finishedAt = new Date().toISOString();
      el.start.textContent = "开始批处理";
      el.exportReport.disabled = false;
      setStatus("批处理完成", summaryLine(), state.items.some(function (item) { return item.status === "failed"; }) ? "warning" : "ready");
    }
    renderQueue();
  }

  async function processItem(entry) {
    entry.status = "running";
    entry.error = "";
    try {
      var item = await eagle.item.getById(entry.id);
      if (!item) throw new Error("条目不存在");
      item.tags = window.VisualLensMapping.unique((item.tags || []).concat(entry.newTags));
      await item.save();
      var verified = await eagle.item.getById(entry.id);
      if (!verified || !entry.newTags.every(function (tag) { return (verified.tags || []).includes(tag); })) throw new Error("写入后回读不一致");
      entry.status = "success";
      entry.verified = true;
      entry.tagsAfter = (verified.tags || []).slice();
    } catch (error) {
      entry.status = "failed";
      entry.error = errorMessage(error);
    }
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = true;
    el.pause.disabled = true;
    setStatus("正在暂停", "等待当前条目完成", "warning");
  }

  function retryFailed() {
    state.items.forEach(function (item) {
      if (item.status === "failed") { item.status = "pending"; item.selected = true; item.error = ""; }
    });
    renderQueue();
    startQueue();
  }

  function lockControls(running) {
    el.start.disabled = running;
    el.pause.disabled = !running;
    el.refresh.disabled = running;
    el.batchSize.disabled = running;
  }

  function renderQueue(updateOnly) {
    var visible = visibleItems();
    if (!updateOnly) {
      el.queueBody.innerHTML = visible.map(renderRow).join("");
      el.emptyState.hidden = visible.length > 0;
      el.visibleCount.textContent = visible.length + " 项";
    }
    var selectable = visible.filter(function (item) { return item.status !== "success"; });
    el.selectVisible.checked = selectable.length > 0 && selectable.every(function (item) { return item.selected; });
    el.selectVisible.indeterminate = selectable.some(function (item) { return item.selected; }) && !el.selectVisible.checked;
    updateSummary();
  }

  function renderRow(item) {
    var folders = item.folderNames.length ? escapeHtml(item.folderNames.join(" / ")) : "未归类";
    var tags = item.newTags.length ? item.newTags.map(function (tag) { return "<span>" + escapeHtml(tag) + "</span>"; }).join("") : "<em>无需新增</em>";
    return "<tr>" +
      "<td class=\"check-cell\"><input type=\"checkbox\" data-id=\"" + escapeHtml(item.id) + "\" " + (item.selected ? "checked" : "") + " " + (item.status === "success" ? "disabled" : "") + "></td>" +
      "<td><div class=\"item-name\"><i>" + escapeHtml(String(item.ext || "?").toUpperCase()) + "</i><span><strong>" + escapeHtml(item.name) + "</strong><small>" + escapeHtml(item.id) + "</small></span></div></td>" +
      "<td><div class=\"evidence-source\"><strong>" + folders + "</strong><small>" + escapeHtml(String(item.ext || "未知格式").toUpperCase()) + "</small></div></td>" +
      "<td><div class=\"tag-list\">" + tags + "</div></td>" +
      "<td>" + statusBadge(item) + "</td></tr>";
  }

  function statusBadge(item) {
    var labels = { pending: "待处理", running: "写入中", success: "已验证", failed: "失败", skipped: "已跳过" };
    var title = item.error ? " title=\"" + escapeHtml(item.error) + "\"" : "";
    return "<span class=\"queue-status " + item.status + "\"" + title + ">" + labels[item.status] + "</span>";
  }

  function visibleItems() {
    return state.items.filter(function (item) {
      var matchesStatus = state.statusFilter === "all" || item.status === state.statusFilter;
      var haystack = [item.name, item.ext].concat(item.folderNames, item.existingTags, item.newTags).join(" ").toLocaleLowerCase();
      return matchesStatus && (!state.query || haystack.includes(state.query));
    });
  }

  function updateSummary() {
    var total = state.items.length;
    var pending = state.items.filter(function (item) { return item.status === "pending" || item.status === "running"; }).length;
    var success = state.items.filter(function (item) { return item.status === "success"; }).length;
    var failed = state.items.filter(function (item) { return item.status === "failed"; }).length;
    var skipped = state.items.filter(function (item) { return item.status === "skipped"; }).length;
    var processable = Math.max(1, total - skipped);
    var percent = Math.min(100, Math.round((success + failed) / processable * 100));
    el.totalCount.textContent = total;
    el.pendingCount.textContent = pending;
    el.successCount.textContent = success;
    el.failureCount.textContent = failed;
    el.progressText.textContent = percent + "%";
    el.progressBar.style.width = percent + "%";
    el.filterAll.textContent = total;
    el.filterPending.textContent = pending;
    el.filterSuccess.textContent = success;
    el.filterFailed.textContent = failed;
    el.filterSkipped.textContent = skipped;
    el.start.disabled = state.running || !state.items.some(function (item) { return item.selected && item.status === "pending"; });
    el.retry.disabled = state.running || failed === 0;
  }

  function setStatus(title, detail, tone) {
    el.statusTitle.textContent = title;
    el.statusDetail.textContent = detail;
    el.statusDot.className = "status-dot " + tone;
  }

  function exportReport() {
    var report = {
      schemaVersion: "1.0",
      baselineCreatedAt: state.baseline && state.baseline.createdAt,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      summary: {
        total: state.items.length,
        success: state.items.filter(function (item) { return item.status === "success"; }).length,
        failed: state.items.filter(function (item) { return item.status === "failed"; }).length,
        skipped: state.items.filter(function (item) { return item.status === "skipped"; }).length
      },
      items: state.items.map(function (item) {
        return { id: item.id, name: item.name, status: item.status, tagsAdded: item.newTags, tagsAfter: item.tagsAfter || null, verified: item.verified, error: item.error || null };
      })
    };
    exportJson(report, "lensflow-eagle-result.json");
  }

  function exportJson(value, fileName) {
    if (!value) return;
    var url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function flattenFolders(folders, map) {
    map = map || new Map();
    (folders || []).forEach(function (folder) {
      map.set(folder.id, folder.name);
      flattenFolders(folder.children || [], map);
    });
    return map;
  }

  function summaryLine() {
    var success = state.items.filter(function (item) { return item.status === "success"; }).length;
    var failed = state.items.filter(function (item) { return item.status === "failed"; }).length;
    return "已验证 " + success + " 项 · 失败 " + failed + " 项";
  }

  function nextFrame() { return new Promise(function (resolve) { requestAnimationFrame(resolve); }); }
  function errorMessage(error) { return error && error.message ? error.message : String(error || "未知错误"); }
  function escapeHtml(value) { return String(value).replace(/[&<>\"]/g, function (char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char]; }); }
})();
