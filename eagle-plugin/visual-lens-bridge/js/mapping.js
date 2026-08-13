(function (global) {
  "use strict";

  var stageRules = [
    { pattern: /参考|灵感|moodboard|reference|inspiration/i, tags: ["阶段/参考"] },
    { pattern: /草图|概念|设计稿|sketch|concept|draft/i, tags: ["阶段/设计"] },
    { pattern: /成品|定稿|交付|final|release|delivery/i, tags: ["阶段/成品"] }
  ];

  function mapItem(item, folderNames) {
    var tags = ["同步/砚台"];
    folderNames.forEach(function (name) {
      var folderTag = tagSegment(name);
      if (folderTag) tags.push("图库/" + folderTag);
      stageRules.forEach(function (rule) {
        if (rule.pattern.test(name)) tags = tags.concat(rule.tags);
      });
    });
    var extension = String(item.ext || "").trim().toUpperCase();
    if (extension) tags.push("文件/" + (extension === "JPEG" ? "JPG" : extension));
    return unique(tags);
  }

  function unique(values) {
    var seen = Object.create(null);
    return values.filter(function (value) {
      var key = String(value).toLocaleLowerCase();
      if (!value || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function tagSegment(value) {
    return String(value || "").replace(/[\r\n/\\]+/g, "-").replace(/\s+/g, " ").trim();
  }

  global.VisualLensMapping = { mapItem: mapItem, unique: unique };
})(window);
