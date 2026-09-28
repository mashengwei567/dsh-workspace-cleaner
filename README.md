# dsh-workspace-cleaner — 工作区清理插件

在 DeepSeek Harness（DSH）左侧边栏**「新会话」按钮正下方**加入一个**「清理工作区」**入口：
点击后在中央区域展示分析面板，逐个工作区给出情况统计与**是否建议清理**的结论；
点击「清理」并确认后，**清空（归档）该工作区的全部会话并关闭这个工作区**。

## 效果

- 侧边栏：`新会话` 按钮下方一行 `清理工作区`（与新会话按钮同款式按钮行，收起为 56px 导航栏时显示图标）。
- 点击进入「工作区清理」面板（占据中央区域，左上角「← 返回会话」随时回到对话）：
  - 顶部汇总：`N 个工作区 · M 个会话 · K 个已归档`；
  - 每个工作区一张卡片：标题、路径、会话数（活跃/归档/置顶/运行中）、最近活动时间；
  - 每张卡片给出结论徽章与理由：
    - **建议清理**：空工作区 / 会话已全部归档 / 超过 30 天无活动；
    - **建议保留**：仍有近期活跃会话（如有会话正在运行、被置顶会话会额外提示）；
  - 卡片内「清理该工作区」→ 二次确认「确认清理？」后执行；
  - 底部「清理全部建议项（N）」一键处理所有建议清理的工作区（同样需要二次确认）。

## 清理到底做了什么

一次清理按顺序执行两步（全部走 DSH 官方工作区/会话 API）：

1. **清空会话**：对该工作区账本上的每个会话调用
   `ctx.workspaces.archiveSession(sessionId, { stopActivity: true })`
   —— 先停止该会话正在运行的任务（回合、子代理、后台任务、定时任务），再归档；
   归档后的会话从工作区分组与会话列表中移除（相当于“清空”），置顶自动取消。
2. **关闭工作区**：`ctx.workspaces.delete(workspaceId)`
   —— 从工作区列表移除该工作区注册；目录文件不动。

> 说明：DSH 的会话是**只增不删**的日志实体（官方工作区删除文案即写明 “folder and session logs will be kept”），
> 没有删除会话日志的公共 API。因此“清空会话”采用官方语义 = 停止运行 + 归档隐藏。
> 会话日志仍保存在 `~/.dsh/sessions`，可随时用会话搜索找回或在归档列表中恢复；
> 如确需彻底删除日志文件，可在此基础上扩展宿主半边（需要自行处理投影/索引一致性，不建议）。

## 安装

### 方式一：从 GitHub 安装

```sh
dsh plugin --profile desktop add github:mashengwei567/dsh-workspace-cleaner
```

本包**无需构建**（`lib/` 即发布入口），也没有 `prepare`/安装脚本；也可以在
DSH 设置 → 插件 → 安装（“包名或地址”）里填同样的地址。

### 方式二：本地目录 / tarball

```sh
dsh plugin --profile desktop add ./dsh-workspace-cleaner
# 或先打包：pnpm pack，然后 dsh plugin add ./dsh-workspace-cleaner-0.1.1.tgz
```

也可以在 GUI 插件页填 `file:<path-to>/dsh-workspace-cleaner`。

安装会把本包写入 profile 的 `package.json` 依赖与 `dsh.profile.bundles` 列表。
启动中的 profile 即刻生效；若界面未出现入口，刷新一次 Web 页面（或重启 DSH）。

> **开发调试建议**：把 profile 里的依赖写成 `link:<本仓库目录>`（实时引用）而不是
> `file:`（安装时复制快照）。否则改完源码运行时拿的还是旧快照，改多少次都不生效。
> 用 `link:` 时改完代码刷新页面（或重启）即可看到效果。

### 方式三：手动挂到 profile

1. 在 `$DSH_HOME/profiles/<name>/package.json` 的 `dsh.profile.bundles` 末尾追加 `"dsh-workspace-cleaner"`；
2. 在该 profile 目录下 `pnpm add link:<本仓库目录>`；
3. 重启 DSH。

### 卸载

```sh
dsh plugin --profile desktop remove dsh-workspace-cleaner
```

或在 GUI 插件页卸载。

## 包结构

```
dsh-workspace-cleaner/
├── package.json        # dsh.bundle（组合层）+ dsh.client（浏览器半边）声明
├── cordis.patch.yml    # 组合层：插入一行 Loader 插件（本包）
└── lib/
    ├── index.js        # 宿主标记（无宿主行为）
    └── client.js       # 浏览器半边：侧边栏入口 + 分析面板（无需构建，手写模块表 factory）
```

- **宿主侧**：仅 Loader 标记插件，无服务/工具注册。
- **浏览器侧**：`lib/client.js` 采用 DSH 客户端模块表的 factory 形态
  （`window.__ModuleLoader__.load({ id, factory })`），`require` 仅使用平台种子词
  （`react`、`@deepseek-ai/dsh-client-ui-primitives`），其余能力全部来自 `ctx` 上的客户端服务：
  `ctx.slots`（座位注册）、`ctx.layout`（面板切换）、`ctx.workspaces`（工作区快照与命令）、
  `ctx.sessions`（会话快照）、`ctx.locale`（界面语言 zh/en）。
- **座位选择**：`sidebar.panellist` 正好渲染在「新会话」按钮正下方（插槽树里唯一落在该位置的扩展位），
  选中后由 `main`（key = `workspace-cleaner`）承载分析面板；点击任意会话或左上角返回即可回到对话。
- 样式使用主题 token（`--dsw-alias-*`），自动适配浅色/深色主题。

## 自定义

- **闲置阈值**：`lib/client.js` 中 `STALE_DAYS = 30`（超过 N 天无活动即建议清理）。
- **建议规则**：`analyzeWorkspace()` 内的 `advice` 判定，可按需增删。
- **文案**：`DICTS.zh` / `DICTS.en`。
