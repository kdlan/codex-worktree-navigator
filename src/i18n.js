export const messages = {
  "cleanup": {"en": "Clean up", "zh-CN": "清理"},
  "cleanupTitle": {"en": "Clean up worktree", "zh-CN": "清理工作树"},
  "cleanupConfirm": {"en": "Remove this worktree directory? Close all tasks using it first. Branches and Codex session records will be kept. Local files (including ignored files), locks, and loaded sessions prevent removal.", "zh-CN": "确定删除此工作树目录？请先停止所有使用此目录的任务。分支和 Codex 会话记录会保留；存在本地文件（含忽略文件）、锁定或已加载会话时阻止清理。"},
  "cleanupSubmit": {"en": "Remove worktree", "zh-CN": "确认清理"},
  "cleaning": {"en": "Cleaning up…", "zh-CN": "正在清理…"},
  "cleanupCheck": {"en": "Close and refresh to check the result", "zh-CN": "请关闭并刷新确认结果"},
  "cleanupInvalid": {"en": "Confirm a valid worktree before cleanup", "zh-CN": "请确认需要清理的有效工作树"},
  "cleanupUnknown": {"en": "This repository is not a saved Codex project", "zh-CN": "此仓库不属于已保存的 Codex 项目"},
  "cleanupProtected": {"en": "Only existing, unlocked linked worktrees can be removed. Main checkouts are protected.", "zh-CN": "仅允许清理已登记且未锁定的额外工作树，主工作目录受保护。"},
  "cleanupDirty": {"en": "Local changes, untracked files, or ignored files exist. Save or remove them yourself before cleanup.", "zh-CN": "存在本地修改、未跟踪文件或忽略文件，请先自行保存或处理后再清理。"},
  "cleanupDetached": {"en": "This detached HEAD has no containing local branch. Create a branch before cleanup.", "zh-CN": "此 detached HEAD 提交没有本地分支保留，请先创建分支再清理。"},
  "cleanupLoaded": {"en": "A session is loaded in this worktree. Close it before cleanup.", "zh-CN": "此工作树仍有已加载会话，请先关闭会话后再清理。"},
  "cleanupSessionsUnknown": {"en": "Could not verify loaded sessions. Cleanup stopped.", "zh-CN": "无法核实已加载会话，已停止清理。"},
  "cleanupDone": {"en": "Worktree removed. Branches and session records were kept.", "zh-CN": "工作树已清理，分支和会话记录已保留。"},
  "cleanupDescription": {"en": "Remove one confirmed clean linked worktree. Preserve branches and session records; never force removal.", "zh-CN": "清理一个已确认且干净的额外工作树，保留分支和会话记录，不强制删除。"},
  "cleanupLimit": {"en": "Cleanup history is full. Restart the extension MCP process.", "zh-CN": "清理操作记录已达上限，请重启扩展 MCP 进程。"},
  "missingId": {"en": "Missing thread ID", "zh-CN": "缺少会话 ID"},
  "invalidThreads": {"en": "Invalid thread/list response", "zh-CN": "会话列表响应无效"},
  "invalidThread": {"en": "Invalid thread/list item", "zh-CN": "会话列表条目无效"},
  "threadCursor": {"en": "App Server repeated a pagination cursor", "zh-CN": "App Server 分页游标重复"},
  "unknown": {"en": "unknown", "zh-CN": "未知"},
  "saveFailed": {
    "en": "Expansion state could not be saved",
    "zh-CN": "展开状态暂时无法保存"
  },
  "navigationFailed": {
    "en": "Navigation failed: {detail}",
    "zh-CN": "导航失败：{detail}"
  },
  "newSession": {
    "en": "New session",
    "zh-CN": "新建会话"
  },
  "originalProject": {
    "en": "Original project",
    "zh-CN": "原项目"
  },
  "firstMessagePlaceholder": {
    "en": "Enter the first message, or leave blank for an empty session",
    "zh-CN": "输入首条聊天内容；留空则创建空会话"
  },
  "firstMessage": {
    "en": "First message (optional)",
    "zh-CN": "首条聊天内容（可选）"
  },
  "readOnlyHint": {
    "en": "New sessions start read-only. You can change permissions in Codex.",
    "zh-CN": "新会话使用只读权限，可在 Codex 会话中调整。"
  },
  "cancel": {
    "en": "Cancel",
    "zh-CN": "取消"
  },
  "createSession": {
    "en": "Create session",
    "zh-CN": "创建会话"
  },
  "noProject": {
    "en": "No original project found. Open the main checkout in Codex first.",
    "zh-CN": "未找到对应原项目，请先在 Codex 中打开主工作目录。"
  },
  "opening": {
    "en": "Opening…",
    "zh-CN": "正在打开…"
  },
  "creating": {
    "en": "Creating…",
    "zh-CN": "正在创建…"
  },
  "openCreated": {
    "en": "Open created session",
    "zh-CN": "打开已创建会话"
  },
  "checkSessions": {
    "en": "Close and check the session list",
    "zh-CN": "请关闭后检查会话列表"
  },
  "sessionCount": {
    "en": "{count} sessions",
    "zh-CN": "{count} 会话"
  },
  "sessionCountOne": {
    "en": "{count} session",
    "zh-CN": "{count} 会话"
  },
  "worktreeCount": {
    "en": "{count} worktrees",
    "zh-CN": "{count} Worktrees"
  },
  "worktreeCountOne": {
    "en": "{count} worktree",
    "zh-CN": "{count} Worktree"
  },
  "gitStatus": {
    "en": "Staged {staged} · Unstaged {unstaged}",
    "zh-CN": "已暂存 {staged} · 未暂存 {unstaged}"
  },
  "newInPath": {
    "en": "New session in {path}",
    "zh-CN": "在 {path} 新建会话"
  },
  "newButton": {
    "en": "+ New session",
    "zh-CN": "+ 新建会话"
  },
  "untitled": {
    "en": "Untitled session",
    "zh-CN": "未命名会话"
  },
  "archived": {
    "en": "Archived",
    "zh-CN": "已归档"
  },
  "unknownTime": {
    "en": "Unknown time",
    "zh-CN": "时间未知"
  },
  "openSession": {
    "en": "Open session: {name}",
    "zh-CN": "打开会话：{name}"
  },
  "open": {
    "en": "Open ↗",
    "zh-CN": "打开 ↗"
  },
  "noSessions": {
    "en": "No associated sessions. Create one in this worktree.",
    "zh-CN": "暂无关联会话，可以在此 Worktree 新建。"
  },
  "partialPaths": {
    "en": "Some path queries failed. Results may be incomplete.",
    "zh-CN": "部分路径查询失败，结果可能不完整。"
  },
  "refreshing": {
    "en": "Refreshing Worktrees",
    "zh-CN": "正在刷新 Worktrees"
  },
  "refreshLabel": {
    "en": "Refresh Worktrees",
    "zh-CN": "刷新 Worktrees"
  },
  "subtitle": {
    "en": "Browse existing linked worktrees and their Codex sessions",
    "zh-CN": "浏览当前存在的额外 Worktree 及关联的 Codex 会话"
  },
  "refresh": {
    "en": "Refresh",
    "zh-CN": "刷新"
  },
  "collapseAll": {
    "en": "Collapse all",
    "zh-CN": "全部折叠"
  },
  "pathsUnavailable": {
    "en": "Some directories could not be verified. Try refreshing.",
    "zh-CN": "部分目录暂时无法校验，请重试刷新。"
  },
  "noWorktrees": {
    "en": "No valid linked worktrees in saved projects.",
    "zh-CN": "当前已知项目中没有有效的额外 Worktree。"
  },
  "loadFailed": {
    "en": "Loading failed: {detail}. Select Refresh to retry.",
    "zh-CN": "加载失败：{detail}。点击刷新重试。"
  },
  "initFailed": {
    "en": "Page initialization failed: {detail}. Reopen using Codex’s refresh action.",
    "zh-CN": "原生页面初始化失败：{detail}。请使用 Codex 的刷新操作重新打开。"
  },
  "stopped": {
    "en": "Navigator stopped",
    "zh-CN": "导航器已停止"
  },
  "aborted": {
    "en": "Aborted",
    "zh-CN": "操作已取消"
  },
  "requestTimeout": {
    "en": "{method} request timed out",
    "zh-CN": "{method} 请求超时"
  },
  "notInitialized": {
    "en": "The native page has not initialized yet",
    "zh-CN": "原生页面尚未完成初始化"
  },
  "readFailed": {
    "en": "Could not read data",
    "zh-CN": "数据读取失败"
  },
  "createFailed": {
    "en": "Could not create session",
    "zh-CN": "创建失败"
  },
  "noThreadId": {
    "en": "No session ID returned. Refresh and check before creating another session.",
    "zh-CN": "未返回会话 ID，请刷新后检查，勿重复创建"
  },
  "invalidResponse": {
    "en": "Invalid Navigator response",
    "zh-CN": "导航器响应无效"
  },
  "unsupportedNavigation": {
    "en": "Unsupported navigation target",
    "zh-CN": "不支持的导航目标"
  },
  "invalidProjects": {
    "en": "Invalid project/list response",
    "zh-CN": "项目列表响应无效"
  },
  "invalidProject": {
    "en": "Invalid native project",
    "zh-CN": "原生项目数据无效"
  },
  "projectCursor": {
    "en": "Repeated project cursor",
    "zh-CN": "项目分页游标重复"
  },
  "unknownTrust": {
    "en": "Could not verify existing Codex directory trust",
    "zh-CN": "无法核实 Codex 已有的目录信任状态"
  },
  "untrusted": {
    "en": "Codex marks this worktree or repository as untrusted. Confirm directory trust in Codex first.",
    "zh-CN": "此 Worktree 或原仓库被 Codex 标为不信任，请先在 Codex 中确认目录信任。"
  },
  "noTrust": {
    "en": "The original repository has no confirmed trust status. Confirm directory trust in Codex first.",
    "zh-CN": "原仓库尚无已确认的信任状态，请先在 Codex 中确认目录信任。"
  },
  "invalidSelection": {
    "en": "Select the original project and a valid worktree",
    "zh-CN": "请选择原项目和有效的 Worktree"
  },
  "invalidWorktree": {
    "en": "The selected directory is not a valid worktree root. Refresh the list.",
    "zh-CN": "所选目录不是有效的 Worktree 根目录，请刷新列表"
  },
  "worktreeRemoved": {
    "en": "The selected worktree was deleted or is no longer registered. Refresh the list.",
    "zh-CN": "所选 Worktree 已删除或不再登记，请刷新列表"
  },
  "projectRemoved": {
    "en": "The original project no longer exists. Refresh the list.",
    "zh-CN": "原项目已不存在，请刷新列表"
  },
  "wrongProject": {
    "en": "The selected project does not own this worktree’s repository. Refresh the list.",
    "zh-CN": "所选项目不属于此 Worktree 的原仓库，请刷新列表"
  },
  "missingThread": {
    "en": "Codex did not return a session ID",
    "zh-CN": "Codex 未返回会话 ID"
  },
  "wrongThread": {
    "en": "Session project or directory does not match",
    "zh-CN": "会话项目或目录不一致"
  },
  "restoreMismatch": {
    "en": "Restored project or directory does not match",
    "zh-CN": "恢复后的项目或目录不一致"
  },
  "writerNotReleased": {
    "en": "The creating connection has not released the session",
    "zh-CN": "创建端尚未释放会话"
  },
  "defaultSessionName": {
    "en": "New session",
    "zh-CN": "新会话"
  },
  "partialCreation": {
    "en": "Session {threadId} creation is incomplete: {detail}. Check native or archived sessions before creating another one.",
    "zh-CN": "会话 {threadId} 创建未完成：{detail}。请在原生会话或归档列表中检查，避免重复创建。"
  },
  "invalidCreation": {
    "en": "Invalid session creation arguments",
    "zh-CN": "无效的新建会话参数"
  },
  "reusedRequest": {
    "en": "Do not reuse a request ID for different content",
    "zh-CN": "请勿复用不同内容的提交标识"
  },
  "creationLimit": {
    "en": "Creation history is full. Restart the extension’s MCP process.",
    "zh-CN": "新建操作记录已达上限，请重启扩展的 MCP 进程"
  },
  "projectReadFailed": {
    "en": "Could not read original project identity: {detail}",
    "zh-CN": "原项目身份读取失败：{detail}"
  },
  "invalidGit": {
    "en": "Invalid Git metadata",
    "zh-CN": "Git 元数据无效"
  },
  "invalidWorktreeResponse": {
    "en": "Invalid worktree response",
    "zh-CN": "Worktree 响应无效"
  },
  "gitFailed": {
    "en": "Git query failed ({code})",
    "zh-CN": "Git 查询失败 ({code})"
  },
  "unsupportedOperation": {
    "en": "Unsupported App Server operation",
    "zh-CN": "不支持的 App Server 操作"
  },
  "connectionFailed": {
    "en": "Cannot connect to the existing Codex App Server: {detail}. Check that the local App Server is running.",
    "zh-CN": "无法连接现有 Codex App Server：{detail}。请检查本地 App Server 是否运行。"
  },
  "connectionClosed": {
    "en": "Codex App Server connection closed",
    "zh-CN": "Codex App Server 连接已关闭"
  },
  "invalidHandshake": {
    "en": "Invalid WebSocket handshake",
    "zh-CN": "WebSocket 握手无效"
  },
  "invalidUpgrade": {
    "en": "Invalid App Server WebSocket upgrade",
    "zh-CN": "App Server WebSocket 升级响应无效"
  },
  "responseTooLarge": {
    "en": "App Server response too large",
    "zh-CN": "App Server 响应过大"
  },
  "unsupportedFrame": {
    "en": "Unsupported WebSocket frame",
    "zh-CN": "不支持的 WebSocket 帧"
  },
  "handshakeTimeout": {
    "en": "Codex App Server handshake timed out",
    "zh-CN": "Codex App Server 握手超时"
  },
  "connectionFinished": {
    "en": "Navigator connection finished",
    "zh-CN": "导航器连接已结束"
  },
  "unknownResource": {
    "en": "Unknown resource",
    "zh-CN": "未知资源"
  },
  "invalidSessionArgs": {
    "en": "Invalid session arguments",
    "zh-CN": "会话参数无效"
  },
  "unknownTool": {
    "en": "Unknown tool",
    "zh-CN": "未知工具"
  },
  "invalidNavigatorArgs": {
    "en": "Invalid Navigator arguments",
    "zh-CN": "导航器参数无效"
  },
  "methodNotFound": {
    "en": "Method not found",
    "zh-CN": "未找到方法"
  },
  "parseError": {
    "en": "Parse error",
    "zh-CN": "解析错误"
  },
  "invalidRequest": {
    "en": "Invalid request",
    "zh-CN": "请求无效"
  },
  "navigatorError": {
    "en": "Navigator error",
    "zh-CN": "导航器错误"
  },
  "browseDescription": {
    "en": "Browse existing linked Git worktrees and their Codex sessions.",
    "zh-CN": "浏览真实存在的额外 Git Worktree 和相关 Codex 会话。"
  },
  "createTitle": {
    "en": "Create a session in a worktree",
    "zh-CN": "在 Worktree 新建会话"
  },
  "createDescription": {
    "en": "Create a worktree session in its original project, with an optional first message.",
    "zh-CN": "在原项目下创建指定 Worktree 会话，可选首条消息。"
  },
  "sessionCreated": {
    "en": "Session created.",
    "zh-CN": "会话已创建。"
  },
  "repositoriesRead": {
    "en": "Read {count} repositories with linked worktrees.",
    "zh-CN": "已读取 {count} 个包含额外 Worktree 的仓库。"
  },
  "ready": {
    "en": "Worktrees is ready.",
    "zh-CN": "Worktrees 已就绪。"
  },
  "unknownOption": {
    "en": "Unknown option: {flag}",
    "zh-CN": "未知选项：{flag}"
  },
  "duplicateOption": {
    "en": "Duplicate option: {flag}",
    "zh-CN": "重复选项：{flag}"
  },
  "missingOption": {
    "en": "Missing {flag} value",
    "zh-CN": "缺少 {flag} 的值"
  },
  "usage": {
    "en": "Usage: node scripts/install.mjs [--app APP_PATH] [--codex-home DIRECTORY] [--node NODE_PATH] [--uninstall]",
    "zh-CN": "用法：node scripts/install.mjs [--app APP_PATH] [--codex-home DIRECTORY] [--node NODE_PATH] [--uninstall]"
  },
  "foreignInstall": {
    "en": "The installation directory does not belong to this extension",
    "zh-CN": "安装目录不属于此扩展"
  },
  "unmarkedInstall": {
    "en": "The installation directory exists without an ownership marker. Stopping to avoid overwriting it.",
    "zh-CN": "安装目录已存在且没有归属标记，停止以避免覆盖"
  },
  "foreignMcp": {
    "en": "MCP {name} already exists and belongs to another installation. Stopping to avoid overwriting it.",
    "zh-CN": "MCP {name} 已存在且不属于此安装，停止以避免覆盖。"
  },
  "uninstalled": {
    "en": "Worktree Navigator uninstalled. Restart Codex to apply.",
    "zh-CN": "Worktree Navigator 已卸载。重启 Codex 后生效。"
  },
  "installed": {
    "en": "Worktree Navigator installed. Restart Codex, then pin Worktrees from Explore.",
    "zh-CN": "Worktree Navigator 已安装。重启 Codex 后自动加载，在“探索”中固定 Worktrees 到一级导航。"
  },
  "backup": {
    "en": "Configuration backup: {path}",
    "zh-CN": "配置备份：{path}"
  },
  "configCreated": {
    "en": "Created the extension’s MCP configuration.",
    "zh-CN": "已创建此扩展的 MCP 配置。"
  },
  "built": {
    "en": "Built Worktree Navigator (no runtime dependencies)",
    "zh-CN": "已构建 Worktree Navigator（无运行时依赖）"
  }
};

export function normalizeLocale(value) {
  return typeof value === 'string' && /^zh(?:[-_.@]|$)/i.test(value) ? 'zh-CN' : 'en';
}

export function systemLocale(env = {}) {
  return normalizeLocale(env.LC_ALL || env.LC_MESSAGES || env.LANG);
}

export function createI18n(initialLocale = 'en') {
  let locale = normalizeLocale(initialLocale);
  return {
    get locale() { return locale; },
    setLocale(value) { locale = normalizeLocale(value); },
    t(key, values = {}) {
      const entry = messages[key];
      if (!entry) throw Error(`Unknown translation key: ${key}`);
      return (entry[locale] || entry.en).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
    },
  };
}

export function createLocaleController(win) {
  const i18n = createI18n(win.openai?.locale);
  return {
    i18n,
    setHostLocale(value) {
      if (typeof value !== 'string' || !value.trim()) return;
      i18n.setLocale(value);
    },
  };
}
