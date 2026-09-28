/* 冒烟测试：模拟浏览器模块表与 ctx，验证 lib/client.js 的注册与渲染路径。 */
const path = require('path')

global.window = { __ModuleLoader__: { load: (m) => { global.__mod = m } } }
global.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '', remove: () => {} }),
  head: { appendChild: () => {} },
}
require(path.join(__dirname, 'lib', 'client.js'))

const fakeRequire = (spec) => {
  if (spec === 'react') {
    return {
      createElement: (type, props, ...children) => {
        const merged = { ...(props || {}) }
        if (children.length === 1) merged.children = children[0]
        else if (children.length > 1) merged.children = children
        return { type, props: merged, children }
      },
      useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
      useEffect: () => {},
    }
  }
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') {
    return new Proxy({}, {
      get: (_t, name) => (props) => ({
        type: String(name),
        props: props || {},
        children: props && props.children !== undefined ? [].concat(props.children) : [],
      }),
    })
  }
  throw new Error('unexpected require: ' + spec)
}

const mod = global.__mod
if (!mod || mod.id !== 'dsh-workspace-cleaner') throw new Error('module id mismatch')
const m = mod.factory(fakeRequire)
if (typeof m.apply !== 'function') throw new Error('missing apply')
if (!Array.isArray(m.inject) || m.inject.length === 0) throw new Error('missing inject')

const registrations = []
const panels = {}
const fakeCtx = {
  effect: (fn) => fn(),
  locale: {
    getSnapshot: () => ({ active: 'zh' }),
    subscribe: () => () => {},
  },
  slots: {
    inject: (key, callback) => {
      for (const _disposer of callback()) { /* generator yields disposers */ }
    },
    register: (options, component) => {
      registrations.push({ key: options.name, options, component })
      return () => {}
    },
  },
  layout: { selectPanel: () => {} },
  workspaces: {
    list: {
      getSnapshot: () => ({
        items: [
          { workspaceId: 'w1', title: '山东小学试卷调研', path: 'C:\\demo\\shandong', sessionIds: ['s1', 's2'], createdAt: Date.now() - 86400000, updatedAt: Date.now() - 86400000 },
          { workspaceId: 'w2', title: 'empty', path: 'C:\\demo\\empty', sessionIds: [], createdAt: Date.now(), updatedAt: Date.now() },
        ],
        archivedSessionIds: ['s2'],
        pinnedSessionIds: [],
        phase: 'ready',
        state: 'idle',
      }),
      subscribe: () => () => {},
    },
    archiveSession: async () => {},
    delete: async () => {},
  },
  sessions: {
    list: {
      getSnapshot: () => ({
        ids: ['s1', 's2'],
        byId: {
          s1: { id: 's1', displayTitle: '会话甲', updatedAt: Date.now() - 3600000, running: true, blank: false },
          s2: { id: 's2', displayTitle: '会话乙', updatedAt: Date.now() - 40 * 86400000, running: false, blank: false },
        },
        phase: 'ready',
      }),
      subscribe: () => () => {},
    },
    refresh: async () => {},
  },
}

m.apply(fakeCtx)
console.log('registrations:', registrations.map(r => `${r.key}:${r.options.id || r.options.key || ''}`).join(', '))

const CleanerPanel = registrations.find(r => r.key === 'main' && r.component).component
const tree = CleanerPanel()
if (!tree || tree.type !== 'div' || tree.props.className !== 'dsh-wsc-root') throw new Error('panel tree mismatch')

function flatten(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const child of node) flatten(child, out); return out }
  if (typeof node === 'object') {
    if (typeof node.type === 'function') {
      flatten(node.type(node.props || {}), out)
      return out
    }
    out.push(node)
    flatten(node.children, out)
  }
  return out
}
const nodes = flatten(tree)
const texts = nodes
  .map(n => (n.children || []).filter(c => typeof c === 'string').join(''))
  .filter(t => t !== '')
console.log('rendered text sample:', texts.slice(0, 14).join(' | '))
const hasAdvice = texts.includes('建议清理') && texts.includes('建议保留')
const hasSummary = texts.some(t => t.includes('个工作区'))
if (!hasAdvice || !hasSummary) throw new Error('analysis text missing: ' + JSON.stringify(texts))

// 模拟点击「清理」→ 确认，验证清理调用顺序：归档全部会话 → 删除工作区。
const calls = []
fakeCtx.workspaces.archiveSession = async (id, options) => { calls.push(['archive', id, options]) }
fakeCtx.workspaces.delete = async (id) => { calls.push(['delete', id]) }

function findAction(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const child of node) findAction(child, out); return out }
  if (typeof node === 'object') {
    if (typeof node.type === 'function') {
      if (node.props && typeof node.props.onConfirm === 'function') out.push(node.props)
      return out
    }
    findAction(node.children, out)
  }
  return out
}
const actions = findAction(tree)
if (actions.length !== 2) throw new Error('expected 2 workspace cards, got ' + actions.length)
actions[0].onConfirm(actions[0].report)

setTimeout(() => {
  const signature = calls.map(c => c[0] + ':' + c[1]).join(',')
  if (signature !== 'archive:s1,archive:s2,delete:w1') throw new Error('cleanup sequence mismatch: ' + signature)
  if (calls[0][2].stopActivity !== true) throw new Error('archive must stop running activity')
  console.log('cleanup sequence:', signature)
  console.log('SMOKE OK')
}, 20)
