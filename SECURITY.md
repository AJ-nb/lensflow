# Lensflow 安全政策

## 报告漏洞

请使用 GitHub Security Advisories 私下报告漏洞。不要在公开 Issue 中提交 API Key、访问令牌、个人图片、完整备份或可利用细节。

## 支持范围

仅维护最新发布版本。安全相关修改必须覆盖 Origin、协议版本、nonce、请求重放、负载上限、未知方法和敏感字段泄漏。

## 密钥边界

- 密钥由 `ProviderSecretStore` 按 Provider ID 管理，默认仅保存在 `chrome.storage.session`。
- 网页、IndexedDB、日志、备份和诊断包不得读取或写入密钥。
- 浏览器扩展中的持久化密钥无法提供服务器级隔离。多人共用设备时不要开启长期保存。
- 密钥疑似泄露时应立即在 Provider 后台撤销并重新生成。

## 真实 API 测试

真实请求默认关闭。`LENSFLOW_REAL_API=1` 只允许非付费连接与能力检查；付费烟测还需 `LENSFLOW_BILLABLE_SMOKE=1`，每个测试最多发送一次且不得自动重试。
