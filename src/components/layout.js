// Shared app shell: header (logo + save status + theme toggle) + tab bar + content mount.

import { refreshIcons, bindFocusStyles } from '../utils/icons.js'
import { lsGet, lsSet, STORAGE_KEYS } from '../utils/storage.js'

// Top-level menu groups — each group contains sub-tabs
export const TAB_GROUPS = [
  {
    id: 'overview',
    label: '总览',
    icon: 'bar-chart-3',
    tabs: [
      { id: 'overview', label: '统计概览', icon: 'bar-chart-3' },
      { id: 'risk', label: '账户风控', icon: 'activity' },
      { id: 'data', label: '数据管理', icon: 'database' }
    ]
  },
  {
    id: 'operation',
    label: '实际操作',
    icon: 'clipboard-check',
    tabs: [
      { id: 'position', label: '持仓检查', icon: 'clipboard-check' },
      { id: 'plan', label: '下单计划', icon: 'target' },
      { id: 'execution', label: '执行情况', icon: 'list-checks' },
      { id: 'records', label: '交易记录', icon: 'book-open' }
    ]
  },
  {
    id: 'logic',
    label: '逻辑库',
    icon: 'brain',
    tabs: [
      { id: 'logic', label: '逻辑库', icon: 'brain' }
    ]
  },
  {
    id: 'market',
    label: '大盘热点',
    icon: 'flame',
    tabs: [
      { id: 'market', label: '大盘热点', icon: 'flame' }
    ]
  }
]

// Flatten all sub-tabs for lookup
export const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs)

let currentTab = 'overview'
let pageRenderers = {} // id -> { mount(root), unmount() }
let contentRoot = null
let subTabBarEl = null
let activeModule = null

export function registerPage(id, factory) {
  pageRenderers[id] = factory
}

export function getCurrentTab() {
  return currentTab
}

// Find which group a sub-tab belongs to
function findGroupByTab(tabId) {
  return TAB_GROUPS.find((g) => g.tabs.some((t) => t.id === tabId))
}

export function navigateTo(tabId, opts = {}) {
  if (!ALL_TABS.some((t) => t.id === tabId)) tabId = 'overview'
  if (tabId === currentTab && !opts.force) return
  currentTab = tabId

  if (location.hash !== '#' + tabId) {
    history.replaceState(null, '', '#' + tabId)
  }

  updateTabVisuals()
  renderContent()
}

function updateTabVisuals() {
  // Update top-level group buttons
  const activeGroup = findGroupByTab(currentTab)
  document.querySelectorAll('.group-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-group') === (activeGroup ? activeGroup.id : ''))
  })

  // Update / render sub-tab bar
  if (subTabBarEl && activeGroup) {
    subTabBarEl.innerHTML = activeGroup.tabs.map((t) => `
      <button class="subtab-btn shrink-0 px-3 sm:px-4 h-8 flex items-center gap-2 whitespace-nowrap ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">
        <i data-lucide="${t.icon}" style="width:14px; height:14px;"></i>
        <span style="font-size:var(--text-body);">${t.label}</span>
      </button>
    `).join('')
    subTabBarEl.querySelectorAll('.subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-tab')))
    })
    subTabBarEl.style.display = activeGroup.tabs.length > 1 ? 'flex' : 'none'
    refreshIcons()
  }
}

function renderContent() {
  if (!contentRoot) return
  if (activeModule && typeof activeModule.unmount === 'function') {
    activeModule.unmount()
  }
  contentRoot.innerHTML = ''
  const page = document.createElement('div')
  page.className = 'page-enter'
  contentRoot.appendChild(page)

  const factory = pageRenderers[currentTab]
  if (!factory) {
    page.innerHTML = '<div class="p-8 text-center" style="color:var(--ink-3);">页面未实现</div>'
    return
  }
  activeModule = factory(page)
  if (activeModule && typeof activeModule.mount === 'function') {
    activeModule.mount()
  }
  refreshIcons()
  const scroll = document.querySelector('[data-scroll-region]')
  if (scroll) scroll.scrollTop = 0
}

function applyTheme(theme) {
  const html = document.documentElement
  html.classList.remove('light', 'dark')
  html.classList.add(theme)
  html.setAttribute('data-theme', theme)
  lsSet(STORAGE_KEYS.theme, theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#171717' : '#FFFFFF')
  const toggleBtn = document.getElementById('theme-toggle')
  if (toggleBtn) {
    const icon = toggleBtn.querySelector('[data-lucide]')
    if (icon) {
      const newName = theme === 'dark' ? 'sun' : 'moon'
      icon.setAttribute('data-lucide', newName)
      refreshIcons()
    }
  }
}

function toggleTheme() {
  const html = document.documentElement
  const next = html.classList.contains('dark') ? 'light' : 'dark'
  applyTheme(next)
}

export function renderShell(root) {
  root.innerHTML = `
    <div class="h-screen overflow-hidden flex" style="background:var(--bg); color:var(--ink); font-family:var(--font-primary);">
      <!-- Mobile overlay -->
      <div id="sidebar-overlay" class="fixed inset-0 z-40 hidden" style="background:rgba(0,0,0,0.4);"></div>

      <!-- Left sidebar -->
      <aside id="sidebar" class="shrink-0 flex flex-col z-50 safe-top safe-bottom" style="width:220px; background:var(--surface); border-right:1px solid var(--line); transition:transform 0.2s ease;">
        <!-- Logo -->
        <div class="flex items-center gap-2 px-5 h-14 sm:h-16 shrink-0" style="border-bottom:1px solid var(--line);">
          <i data-lucide="shield-check" style="color:var(--brand); width:20px; height:20px; flex-shrink:0;"></i>
          <h1 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); letter-spacing:-0.015em; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">交易纪律复盘</h1>
        </div>

        <!-- Menu groups -->
        <nav class="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-1">
          ${TAB_GROUPS.map((g) => `
            <button class="group-btn flex items-center gap-3 px-3 py-2.5 rounded-md w-full text-left" data-group="${g.id}">
              <i data-lucide="${g.icon}" style="width:18px; height:18px; flex-shrink:0;"></i>
              <span>${g.label}</span>
            </button>
          `).join('')}
        </nav>

        <!-- Bottom controls -->
        <div class="shrink-0 flex items-center justify-between px-4 py-3" style="border-top:1px solid var(--line);">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 whitespace-nowrap" style="font-size:var(--text-caption); color:var(--ink-3); border-radius:var(--r-md); background:var(--bg);">
            <span style="width:6px;height:6px;border-radius:50%;background:var(--state-success);display:inline-block;"></span>
            <span id="auto-save-status">已保存</span>
          </span>
          <button id="theme-toggle" aria-label="切换主题" class="inline-flex items-center justify-center" style="width:32px; height:32px; border-radius:var(--r-md); background:var(--bg); border:1px solid var(--line); color:var(--ink-2); cursor:pointer;">
            <i data-lucide="sun-moon" style="width:16px; height:16px;"></i>
          </button>
        </div>
      </aside>

      <!-- Main area -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Mobile top bar with menu toggle -->
        <header class="shrink-0 flex items-center gap-3 px-4 h-14 md:hidden safe-top" style="border-bottom:1px solid var(--line);">
          <button id="menu-toggle" aria-label="菜单" class="inline-flex items-center justify-center" style="width:32px; height:32px; border-radius:var(--r-md); background:var(--surface); border:1px solid var(--line); color:var(--ink-2); cursor:pointer;">
            <i data-lucide="menu" style="width:18px; height:18px;"></i>
          </button>
          <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);">交易纪律复盘</span>
        </header>

        <!-- Sub-tab bar (hidden for single-tab groups) -->
        <nav id="subtab-bar" class="shrink-0 flex items-center gap-1 px-4 sm:px-6 md:px-8 h-11 overflow-x-auto no-scrollbar flex-nowrap" style="border-bottom:1px solid var(--line); background:var(--bg);"></nav>

        <!-- Scrollable content region -->
        <div data-scroll-region="primary" class="flex-1 min-h-0 overflow-y-auto safe-bottom">
          <div id="content-root" class="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8"></div>
        </div>
      </div>
    </div>
  `

  contentRoot = document.getElementById('content-root')
  subTabBarEl = document.getElementById('subtab-bar')

  const sidebar = document.getElementById('sidebar')
  const overlay = document.getElementById('sidebar-overlay')
  const menuToggle = document.getElementById('menu-toggle')

  function openSidebar() {
    sidebar.classList.add('sidebar-open')
    overlay.classList.remove('hidden')
  }
  function closeSidebar() {
    sidebar.classList.remove('sidebar-open')
    overlay.classList.add('hidden')
  }

  // Mobile menu toggle
  if (menuToggle) menuToggle.addEventListener('click', openSidebar)
  if (overlay) overlay.addEventListener('click', closeSidebar)

  // Top-level group clicks
  root.querySelectorAll('.group-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const groupId = btn.getAttribute('data-group')
      const group = TAB_GROUPS.find((g) => g.id === groupId)
      if (group && group.tabs.length > 0) {
        const currentGroup = findGroupByTab(currentTab)
        if (currentGroup && currentGroup.id === groupId) return
        navigateTo(group.tabs[0].id)
        closeSidebar()
      }
    })
  })

  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle')
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme)

  // Restore theme
  const savedTheme = lsGet(STORAGE_KEYS.theme, null)
  if (savedTheme === 'light' || savedTheme === 'dark') {
    applyTheme(savedTheme)
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark')
  } else {
    applyTheme('light')
  }

  // Listen to system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const userPref = lsGet(STORAGE_KEYS.theme, null)
      if (!userPref) applyTheme(e.matches ? 'dark' : 'light')
    })
  }

  bindFocusStyles()
  refreshIcons()

  // Initial route from hash
  const hash = location.hash.replace('#', '')
  const initialTab = ALL_TABS.some((t) => t.id === hash) ? hash : 'overview'
  currentTab = initialTab
  updateTabVisuals()
  renderContent()

  // Hash change navigation
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '')
    if (ALL_TABS.some((t) => t.id === h) && h !== currentTab) {
      navigateTo(h)
    }
  })
}