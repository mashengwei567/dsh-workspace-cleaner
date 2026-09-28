/**
 * 工作区清理（浏览器半边）。
 *
 * 贡献两个座位（slot）：
 *   1. `sidebar.panellist` —— 侧边栏「新会话」按钮正下方的「清理工作区」入口行；
 *   2. `main`（key = 'workspace-cleaner'）—— 点击入口后中央区域展示的分析面板：
 *      逐个工作区给出统计与清理建议，确认后归档清空其会话并关闭该工作区。
 *
 * 文件格式为客户端模块表的 factory 形态（window.__ModuleLoader__.load），
 * 运行期 require 只允许平台种子词（react / ui-primitives 等），
 * 其余能力一律通过 ctx 上的服务获取。
 */
window.__ModuleLoader__.load({
  id: 'dsh-workspace-cleaner',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    let react = require('react');
    let primitives = require('@deepseek-ai/dsh-client-ui-primitives');

    const h = react.createElement;
    const { useEffect, useState } = react;
    const {
      Button,
      Tag,
      Tooltip,
      IconTrashOutlineRegular,
      IconChevronLeftOutlineRegular,
      IconRefreshOutlineRegular,
      IconClockOutlineRegular,
      IconArchiveOutlineRegular,
      IconPinOutlineRegular,
      IconPlayOutlineRegular,
      IconInfoOutlineRegular,
      IconFolderOpenOutlineRegular,
    } = primitives;

    // ------------------------------------------------------------------
    // i18n（跟随 ctx.locale 的 active 语言，zh / en 双语）
    // ------------------------------------------------------------------

    const DICTS = {
      zh: {
        'nav.label': '清理工作区',
        'panel.title': '工作区清理',
        'panel.subtitle': '{workspaces} 个工作区 · {sessions} 个会话 · {archived} 个已归档',
        'panel.back': '返回会话',
        'panel.refresh': '刷新统计',
        'panel.loading': '正在加载工作区…',
        'panel.empty': '还没有任何工作区。',
        'note.disclaimer': '“清理”会把该工作区的全部会话归档清空（从会话列表移除，并停止正在运行的任务），然后关闭（移除）这个工作区本身。会话日志与磁盘文件都会保留，可随时从会话搜索中找回。',
        'card.path': '路径',
        'card.sessions': '会话 {total} 个（活跃 {active} · 归档 {archived}）',
        'card.pinned': '置顶 {n}',
        'card.running': '运行中 {n}',
        'card.lastActivity': '最近活动 {time}',
        'card.createdAt': '创建于 {time}',
        'advice.clean': '建议清理',
        'advice.keep': '建议保留',
        'reason.empty': '没有任何会话，属于空工作区。',
        'reason.allArchived': '全部会话都已归档，列表里已经不再显示。',
        'reason.stale': '超过 {days} 天没有新活动。',
        'reason.active': '仍有近期活跃的会话。',
        'reason.running': '其中 {n} 个会话正在运行，清理时会先停止它们。',
        'reason.pinned': '其中 {n} 个会话被置顶，清理后置顶会被移除。',
        'action.clean': '清理该工作区',
        'action.confirm': '确认清理？',
        'action.cancel': '取消',
        'action.busy': '清理中…',
        'action.cleanAll': '清理全部建议项（{n}）',
        'action.confirmAll': '确认清理 {n} 个工作区？',
        'notice.done': '清理完成。',
        'notice.noSuggested': '当前没有建议清理的工作区。',
        'error.clean': '清理失败：{message}',
        'time.justNow': '刚刚',
        'time.minutes': '{n} 分钟前',
        'time.hours': '{n} 小时前',
        'time.days': '{n} 天前',
        'time.never': '无记录',
      },
      en: {
        'nav.label': 'Clean workspaces',
        'panel.title': 'Workspace cleanup',
        'panel.subtitle': '{workspaces} workspaces · {sessions} sessions · {archived} archived',
        'panel.back': 'Back to chat',
        'panel.refresh': 'Refresh stats',
        'panel.loading': 'Loading workspaces…',
        'panel.empty': 'No workspaces yet.',
        'note.disclaimer': '“Clean” archives every session of the workspace (removing it from the session list and stopping any running work), then closes (removes) the workspace itself. Session logs and on-disk files are kept and can be found again through session search.',
        'card.path': 'Path',
        'card.sessions': '{total} sessions ({active} active · {archived} archived)',
        'card.pinned': '{n} pinned',
        'card.running': '{n} running',
        'card.lastActivity': 'Last activity {time}',
        'card.createdAt': 'Created {time}',
        'advice.clean': 'Cleanup suggested',
        'advice.keep': 'Keep',
        'reason.empty': 'No sessions at all — an empty workspace.',
        'reason.allArchived': 'Every session is already archived and hidden.',
        'reason.stale': 'No activity for more than {days} days.',
        'reason.active': 'Still has recently active sessions.',
        'reason.running': '{n} session(s) are running; cleaning stops them first.',
        'reason.pinned': '{n} session(s) are pinned; cleaning removes the pins.',
        'action.clean': 'Clean this workspace',
        'action.confirm': 'Confirm cleanup?',
        'action.cancel': 'Cancel',
        'action.busy': 'Cleaning…',
        'action.cleanAll': 'Clean all suggested ({n})',
        'action.confirmAll': 'Clean {n} workspace(s)?',
        'notice.done': 'Cleanup finished.',
        'notice.noSuggested': 'Nothing is suggested for cleanup right now.',
        'error.clean': 'Cleanup failed: {message}',
        'time.justNow': 'just now',
        'time.minutes': '{n} min ago',
        'time.hours': '{n} h ago',
        'time.days': '{n} d ago',
        'time.never': 'no record',
      },
    };

    /** 面板底部展示的构建版本：用于一眼确认页面运行的是不是新代码。 */
    const VERSION = 'v0.3';

    /** 构造翻译器：每次调用都读取当前 active 语言，保证切换语言即刻生效。 */
    function translator(locale) {
      return (key, params) => {
        const active = String(locale.getSnapshot().active || 'en').split('-')[0];
        const dict = DICTS[active] || DICTS.en;
        let text = dict[key];
        if (text === undefined) text = DICTS.en[key] !== undefined ? DICTS.en[key] : key;
        if (params !== undefined) {
          for (const name of Object.keys(params)) {
            text = text.split('{' + name + '}').join(String(params[name]));
          }
        }
        return text;
      };
    }

    // ------------------------------------------------------------------
    // 样式（使用主题 token，自动适配浅色/深色）
    // ------------------------------------------------------------------

    const STYLE_ID = 'dsh-workspace-cleaner-style';
    const CSS = [
      /* 根节点定高 = 视口高度 − 窗口标题栏高度（不依赖父级布局形态）；
         卡片滚动区 .dsh-wsc-scroll 用 flex 占满剩余高度，滚动条只在这一层。
         按钮/徽章直接用 ui-primitives 的 Button / Tag（自带主题 token），
         这里只保留布局与少量强调色覆盖。 */
      '.dsh-wsc-root{height:calc(100vh - var(--dsh-windows-titlebar-height, 0px));',
      ' display:flex;flex-direction:column;overflow:hidden;',
      ' max-width:920px;margin:0 auto;box-sizing:border-box;',
      ' padding:calc(24px + var(--dsh-frame-top-clearance, 0px)) 28px 20px;',
      ' color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6;}',
      '.dsh-wsc-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;}',
      '.dsh-wsc-root button{font:inherit;}',
      '.dsh-wsc-header{display:flex;align-items:center;gap:10px;',
      ' padding-bottom:14px;border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.dsh-wsc-headtext{flex:1;min-width:0;}',
      '.dsh-wsc-title{margin:0;font-size:18px;font-weight:600;}',
      '.dsh-wsc-sub{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:1px;}',
      '.dsh-wsc-note{display:flex;gap:8px;align-items:flex-start;margin:14px 0 12px;',
      ' padding:9px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);',
      ' border:1px solid var(--dsw-alias-border-l1);',
      ' color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7;}',
      '.dsh-wsc-noteicon{flex:none;margin-top:3px;opacity:.75;}',
      '.dsh-wsc-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);',
      ' border-radius:12px;padding:14px 16px;margin-bottom:10px;transition:border-color .15s ease;}',
      '.dsh-wsc-card:hover{border-color:var(--dsw-alias-border-l2);}',
      '.dsh-wsc-wstitle{font-size:14px;font-weight:600;line-height:1.5;word-break:break-word;}',
      '.dsh-wsc-path{display:flex;align-items:center;gap:5px;margin-top:2px;',
      ' color:var(--dsw-alias-label-secondary);font-size:11.5px;}',
      '.dsh-wsc-pathicon{flex:none;opacity:.7;}',
      '.dsh-wsc-path span{word-break:break-all;}',
      '.dsh-wsc-stats{display:flex;flex-wrap:wrap;gap:4px 16px;margin:10px 0 0;',
      ' color:var(--dsw-alias-label-secondary);font-size:12px;align-items:center;}',
      '.dsh-wsc-stat{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;}',
      '.dsh-wsc-staticon{opacity:.75;}',
      '.dsh-wsc-reasons{margin:8px 0 0;padding-left:16px;',
      ' color:var(--dsw-alias-label-secondary);font-size:12px;}',
      '.dsh-wsc-reasons li{margin:1px 0;}',
      '.dsh-wsc-actions{margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
      /* Button 只有 primary/ghost/outline/toolbar 四族，危险动作用强调色覆盖。 */
      '.dsh-wsc-danger{color:var(--dsw-alias-state-error-primary) !important;}',
      '.dsh-wsc-danger-solid{color:var(--dsw-alias-state-error-primary) !important;',
      ' background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent) !important;}',
      '.dsh-wsc-danger-solid:hover{',
      ' background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 20%, transparent) !important;}',
      '.dsh-wsc-error{color:var(--dsw-alias-state-error-primary);font-size:12px;}',
      '.dsh-wsc-notice{margin:0 0 12px;padding:9px 12px;border-radius:10px;font-size:12px;',
      ' background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);',
      ' color:var(--dsw-alias-state-success-primary);}',
      '.dsh-wsc-empty,.dsh-wsc-loading{padding:56px 0;text-align:center;',
      ' color:var(--dsw-alias-label-secondary);}',
      '.dsh-wsc-footer{margin-top:14px;padding:14px 2px 4px;display:flex;gap:8px;',
      ' align-items:center;flex-wrap:wrap;}',
      '.dsh-wsc-version{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:11px;opacity:.6;}',
    ].join('');

    /**
     * 注入样式表（随插件生命周期移除）。
     * 同 id 已存在时原地更新内容：热替换/重复激活下旧样式不能赖着不走，
     * 否则模块代码更新了而样式还是第一版。
     */
    function installStyles() {
      let element = document.getElementById(STYLE_ID);
      if (element === null) {
        element = document.createElement('style');
        element.id = STYLE_ID;
        document.head.appendChild(element);
      }
      element.textContent = CSS;
      return () => { element.remove(); };
    }

    // ------------------------------------------------------------------
    // 数据读取与分析
    // ------------------------------------------------------------------

    /** 订阅一个 ObservableSnapshot（getSnapshot/subscribe）作为 React 状态源。 */
    function useSnapshot(source) {
      const [snapshot, setSnapshot] = useState(() => source.getSnapshot());
      useEffect(() => {
        setSnapshot(source.getSnapshot());
        return source.subscribe(() => { setSnapshot(source.getSnapshot()); });
      }, [source]);
      return snapshot;
    }

    /** 语言切换触发重渲染。 */
    function useLocaleTick(ctx) {
      const [, setTick] = useState(0);
      useEffect(() => ctx.locale.subscribe(() => { setTick(value => value + 1); }), [ctx]);
    }

    /** 判定为“建议清理”的闲置天数阈值。 */
    const STALE_DAYS = 30;

    /** 相对时间展示。 */
    function formatTime(timestamp, t, now) {
      if (!timestamp) return t('time.never');
      const diff = now - timestamp;
      if (diff < 60000) return t('time.justNow');
      if (diff < 3600000) return t('time.minutes', { n: Math.floor(diff / 60000) });
      if (diff < 86400000) return t('time.hours', { n: Math.floor(diff / 3600000) });
      if (diff < STALE_DAYS * 86400000) return t('time.days', { n: Math.floor(diff / 86400000) });
      return new Date(timestamp).toLocaleDateString();
    }

    /** 一个工作区的统计与清理建议。 */
    function analyzeWorkspace(workspace, sessions, archivedSet, pinnedSet, t, now) {
      const ids = workspace.sessionIds;
      let archived = 0;
      let pinned = 0;
      let running = 0;
      let lastActivity = 0;
      for (const id of ids) {
        if (archivedSet.has(id)) archived += 1;
        if (pinnedSet.has(id)) pinned += 1;
        const row = sessions.byId[id];
        if (row === undefined) continue;
        if (row.running) running += 1;
        if (row.updatedAt > lastActivity) lastActivity = row.updatedAt;
      }
      const active = ids.length - archived;
      const reasons = [];
      let advice = 'keep';
      if (ids.length === 0) {
        advice = 'clean';
        reasons.push(t('reason.empty'));
      } else if (active === 0) {
        advice = 'clean';
        reasons.push(t('reason.allArchived'));
      } else if (lastActivity > 0 && now - lastActivity > STALE_DAYS * 86400000) {
        advice = 'clean';
        reasons.push(t('reason.stale', { days: STALE_DAYS }));
      } else {
        reasons.push(t('reason.active'));
      }
      if (running > 0) reasons.push(t('reason.running', { n: running }));
      if (pinned > 0) reasons.push(t('reason.pinned', { n: pinned }));
      return {
        workspace,
        total: ids.length,
        active,
        archived,
        pinned,
        running,
        lastActivity,
        advice,
        reasons,
      };
    }

    /** 错误文本提取（Remote 失败、普通 Error、未知值都覆盖）。 */
    function errorText(error) {
      if (error === undefined || error === null) return 'unknown error';
      if (typeof error === 'string') return error;
      if (error.message !== undefined && error.message !== '') {
        return error.rpcError !== undefined && error.rpcError.code !== undefined
          ? error.rpcError.code + ': ' + error.message
          : String(error.message);
      }
      return String(error);
    }

    /**
     * 清理一个工作区：
     *   1. 归档其全部会话（stopActivity：先停止正在运行的任务再归档）；
     *   2. 删除（关闭）工作区注册本身。
     * 会话日志与磁盘文件按 DSH 的设计全部保留。
     */
    async function cleanupWorkspace(ctx, report) {
      const failures = [];
      for (const sessionId of [...report.workspace.sessionIds]) {
        try {
          await ctx.workspaces.archiveSession(sessionId, { stopActivity: true });
        } catch (error) {
          failures.push({ subject: String(sessionId), message: errorText(error) });
        }
      }
      try {
        await ctx.workspaces.delete(report.workspace.workspaceId);
      } catch (error) {
        failures.push({ subject: report.workspace.title, message: errorText(error) });
      }
      return failures;
    }

    // ------------------------------------------------------------------
    // 组件
    // ------------------------------------------------------------------

    /** 侧边栏入口行的图标（按钮、文字、选中态由 sidebar 外壳负责）。 */
    function CleanerIcon(props) {
      return h(IconTrashOutlineRegular, { size: props && props.size ? props.size : 16 });
    }

    /** 一行统计：图标 + 文案。 */
    function Stat(props) {
      return h('span', { className: 'dsh-wsc-stat' },
        props.icon,
        h('span', null, props.text));
    }

    /** 单个工作区卡片。 */
    function WorkspaceCard(props) {
      const { report, t, now, job, onArm, onConfirm, onCancel } = props;
      const workspace = report.workspace;
      const busy = job !== undefined && job.phase === 'busy';
      const armed = job !== undefined && job.phase === 'armed';
      const failed = job !== undefined && job.phase === 'error';
      return h('div', { className: 'dsh-wsc-card' },
        h('div', { className: 'dsh-wsc-cardhead' },
          h('div', { style: { flex: '1', minWidth: '0' } },
            h('div', { className: 'dsh-wsc-wstitle' }, workspace.title),
            h('div', { className: 'dsh-wsc-path' },
              h(IconFolderOpenOutlineRegular, { size: 12, className: 'dsh-wsc-pathicon' }),
              h('span', null, workspace.path))),
          h(Tag, { tone: report.advice === 'clean' ? 'warning' : 'success' },
            report.advice === 'clean' ? t('advice.clean') : t('advice.keep'))),
        h('div', { className: 'dsh-wsc-stats' },
          h(Stat, {
            icon: h(IconArchiveOutlineRegular, { size: 14, className: 'dsh-wsc-staticon' }),
            text: t('card.sessions', { total: report.total, active: report.active, archived: report.archived }),
          }),
          report.pinned > 0 && h(Stat, {
            icon: h(IconPinOutlineRegular, { size: 14, className: 'dsh-wsc-staticon' }),
            text: t('card.pinned', { n: report.pinned }),
          }),
          report.running > 0 && h(Stat, {
            icon: h(IconPlayOutlineRegular, { size: 14, className: 'dsh-wsc-staticon' }),
            text: t('card.running', { n: report.running }),
          }),
          h(Stat, {
            icon: h(IconClockOutlineRegular, { size: 14, className: 'dsh-wsc-staticon' }),
            text: t('card.lastActivity', { time: formatTime(report.lastActivity, t, now) }),
          })),
        h('ul', { className: 'dsh-wsc-reasons' },
          report.reasons.map(reason => h('li', { key: reason }, reason))),
        h('div', { className: 'dsh-wsc-actions' },
          busy
            ? h('span', { className: 'dsh-wsc-sub' }, t('action.busy'))
            : (armed
              ? [
                  h(Button, {
                    key: 'confirm', size: 'sm', variant: 'outline',
                    className: 'dsh-wsc-danger-solid',
                    onClick: () => { onConfirm(report); },
                  }, t('action.confirm')),
                  h(Button, {
                    key: 'cancel', size: 'sm', variant: 'ghost',
                    onClick: () => { onCancel(report); },
                  }, t('action.cancel')),
                ]
              : h(Button, {
                size: 'sm', variant: 'outline', className: 'dsh-wsc-danger',
                onClick: () => { onArm(report); },
              }, t('action.clean'))),
          failed && h('span', { className: 'dsh-wsc-error' }, t('error.clean', { message: job.error }))));
    }

    /** 构造中央面板组件（闭包捕获 ctx）。 */
    function makeCleanerPanel(ctx) {
      return function CleanerPanel() {
        const t = translator(ctx.locale);
        useLocaleTick(ctx);
        const workspaces = useSnapshot(ctx.workspaces.list);
        const sessions = useSnapshot(ctx.sessions.list);
        const [jobs, setJobs] = useState({});
        const [bulkArmed, setBulkArmed] = useState(false);
        const [notice, setNotice] = useState(null);
        const now = Date.now();

        const archivedSet = new Set(workspaces.archivedSessionIds);
        const pinnedSet = new Set(workspaces.pinnedSessionIds);
        const reports = workspaces.items.map(
          workspace => analyzeWorkspace(workspace, sessions, archivedSet, pinnedSet, t, now));
        const suggested = reports.filter(report => report.advice === 'clean');
        const totalSessions = reports.reduce((sum, report) => sum + report.total, 0);
        const totalArchived = reports.reduce((sum, report) => sum + report.archived, 0);

        const setJob = (workspaceId, job) => {
          setJobs(current => ({ ...current, [workspaceId]: job }));
        };

        const runCleanup = async (targets) => {
          setNotice(null);
          for (const report of targets) {
            const workspaceId = report.workspace.workspaceId;
            setJob(workspaceId, { phase: 'busy' });
            const failures = await cleanupWorkspace(ctx, report);
            if (failures.length === 0) {
              setJob(workspaceId, { phase: 'idle' });
            } else {
              setJob(workspaceId, {
                phase: 'error',
                error: failures.map(failure => failure.subject + ': ' + failure.message).join('; '),
              });
            }
          }
          setBulkArmed(false);
          setNotice(t('notice.done'));
        };

        return h('div', { className: 'dsh-wsc-root' },
          h('div', { className: 'dsh-wsc-header' },
            h(Tooltip, { label: t('panel.back'), delayMs: 400, side: 'bottom' },
              h(Button, {
                variant: 'ghost', size: 'sm', 'aria-label': t('panel.back'),
                icon: h(IconChevronLeftOutlineRegular, { size: 16 }),
                onClick: () => { ctx.layout.selectPanel(null); },
              })),
            h('div', { className: 'dsh-wsc-headtext' },
              h('h1', { className: 'dsh-wsc-title' }, t('panel.title')),
              h('div', { className: 'dsh-wsc-sub' }, t('panel.subtitle', {
                workspaces: reports.length,
                sessions: totalSessions,
                archived: totalArchived,
              }) + '  ·  ' + VERSION)),
            h(Tooltip, { label: t('panel.refresh'), delayMs: 400, side: 'bottom' },
              h(Button, {
                variant: 'ghost', size: 'sm', 'aria-label': t('panel.refresh'),
                icon: h(IconRefreshOutlineRegular, { size: 16 }),
                onClick: () => {
                  setNotice(null);
                  void Promise.resolve(ctx.sessions.refresh()).catch(() => {});
                },
              }))),

          /* 卡片滚动区：高度 = 界面高度 − 顶部区域（由根节点定高 + flex 推导），
             滚动条只出现在这一层。 */
          h('div', { className: 'dsh-wsc-scroll' },
          h('div', { className: 'dsh-wsc-note' },
            h(IconInfoOutlineRegular, { size: 14, className: 'dsh-wsc-noteicon' }),
            h('span', null, t('note.disclaimer'))),

          notice !== null && h('div', { className: 'dsh-wsc-notice' }, notice),

          workspaces.phase === 'pending' && reports.length === 0
            ? h('div', { className: 'dsh-wsc-loading' }, t('panel.loading'))
            : (reports.length === 0
              ? h('div', { className: 'dsh-wsc-empty' }, t('panel.empty'))
              : reports.map(report => h(WorkspaceCard, {
                key: report.workspace.workspaceId,
                report, t, now,
                job: jobs[report.workspace.workspaceId],
                onArm: target => {
                  setNotice(null);
                  setJob(target.workspace.workspaceId, { phase: 'armed' });
                },
                onCancel: target => { setJob(target.workspace.workspaceId, { phase: 'idle' }); },
                onConfirm: target => { void runCleanup([target]); },
              }))),

          reports.length > 0 && h('div', { className: 'dsh-wsc-footer' },
            bulkArmed
              ? [
                  h(Button, {
                    key: 'confirm-all', size: 'sm', variant: 'outline',
                    className: 'dsh-wsc-danger-solid',
                    disabled: suggested.length === 0,
                    onClick: () => { void runCleanup(suggested); },
                  }, t('action.confirmAll', { n: suggested.length })),
                  h(Button, {
                    key: 'cancel-all', size: 'sm', variant: 'ghost',
                    onClick: () => { setBulkArmed(false); },
                  }, t('action.cancel')),
                ]
              : h(Button, {
                variant: 'primary', size: 'sm',
                disabled: suggested.length === 0,
                onClick: () => { setBulkArmed(true); },
              }, t('action.cleanAll', { n: suggested.length })),
            h('span', { className: 'dsh-wsc-version' }, VERSION))));
      };
    }

    // ------------------------------------------------------------------
    // 注册：侧边栏入口行 + 中央面板
    // ------------------------------------------------------------------

    const inject = ['slots', 'layout', 'workspaces', 'sessions', 'locale'];

    /**
     * 激活工作区清理贡献。
     * @param ctx - 客户端根 Context。
     */
    function apply(ctx) {
      const t = translator(ctx.locale);
      ctx.effect(() => installStyles(), 'workspace-cleaner: styles');

      // 「新会话」按钮正下方的入口行（sidebar 外壳自带按钮与文字渲染）。
      ctx.slots.inject('sidebar.panellist', function* () {
        yield ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'workspace-cleaner',
          order: 100,
          label: () => t('nav.label'),
        }, CleanerIcon);
      });

      // 点击入口行后中央区域展示的分析面板。
      const CleanerPanel = makeCleanerPanel(ctx);
      ctx.slots.inject('main', function* () {
        yield ctx.slots.register({ name: 'main', key: 'workspace-cleaner' }, CleanerPanel);
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
