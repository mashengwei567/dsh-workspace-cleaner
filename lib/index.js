/**
 * 工作区清理插件的宿主标记：本插件只贡献浏览器 UI（`./client` 半边），
 * 宿主侧不注册任何服务、工具或事件。
 */

/** 插件名（Loader 行的稳定标识）。 */
export const name = 'workspace-cleaner'

/** 空实现：浏览器行为全部在 lib/client.js 中。 */
export function apply() {}
