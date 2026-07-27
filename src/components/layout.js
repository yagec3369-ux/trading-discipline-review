// Shared app shell: header (logo + save status + theme toggle) + tab bar + content mount.

import { refreshIcons, bindFocusStyles } from '../utils/icons.js'
import { lsGet, lsSet, STORAGE_KEYS } from '../utils/storage.js'

export const TABS = [
  { id: 'overview', label: '统计概览', icon: 'bar-chart-3' },
  { id: 'position', label: '持仓检查', icon: 'clipboard-check' },
  { id: 'logic', label: '逻辑库', icon: 'brain' },
  { id: 'plan', label: '下单计划', icon: 'target' },
  { id: 'execution', label: '执行情况', icon: 'list-checks' },
  { id: 'records', label: '交易记录', icon: 'book-open' },
  { id: 'risk', label: '账户风控', icon: 'activity' }
]

let currentTab = 'overview'
let pageRenderers = {} // id -> { mount(root), unmount() }
let contentRoot = null
let activeModule = null

export function registerPage(id, factory) {
  pageRenderers[id] = factory
}

export function getCurrentTab() {
  return currentTab
}

export function navigateTo(tabId, opts = {}) {
  if (!TABS.some((t) => t.id === tabId)) tabId = 'overview'
  if (tabId === currentTab && !opts.force) return
  currentTab = tabId

  // Update URL hash
  if (location.hash !== '#' + tabId) {
    history.replaceState(null, '', '#' + tabId)
  }

  // Update tab visual state
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId)
  })

  renderContent()
}

function renderContent() {
  if (!contentRoot) return
  // Unmount previous
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
  // scroll content to top on tab change
  const scroll = document.querySelector('[data-scroll-region]')
  if (scroll) scroll.scrollTop = 0
}

function applyTheme(theme) {
  const html = document.documentElement
  html.classList.remove('light', 'dark')
  html.classList.add(theme)
  html.setAttribute('data-theme', theme)
  lsSet(STORAGE_KEYS.theme, theme)
  // update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#171717' : '#FFFFFF')
  // swap toggle icon: show "sun" in dark mode (click to go light), "moon" in light mode
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
    <div class="h-screen overflow-hidden flex flex-col" style="background:var(--bg); color:var(--ink); font-family:var(--font-primary);">
      <!-- Top bar -->
      <header class="shrink-0 flex items-center justify-between px-4 sm:px-6 md:px-8 h-14 sm:h-16 safe-top" style="border-bottom:1px solid var(--line);">
        <div class="flex items-center gap-2 sm:gap-3 min-w-0">
          <i data-lucide="shield-check" style="color:var(--brand); width:20px; height:20px; flex-shrink:0;"></i>
          <h1 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); letter-spacing:-0.015em; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">交易纪律复盘</h1>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 whitespace-nowrap" style="font-size:var(--text-caption); color:var(--ink-3); border-radius:var(--r-md); background:var(--surface);">
            <span style="width:6px;height:6px;border-radius:50%;background:var(--state-success);display:inline-block;"></span>
            <span id="auto-save-status">已保存</span>
          </span>
          <button id="theme-toggle" aria-label="切换主题" class="inline-flex items-center justify-center" style="width:32px; height:32px; border-radius:var(--r-md); background:var(--surface); border:1px solid var(--line); color:var(--ink-2); cursor:pointer;">
            <i data-lucide="sun-moon" style="width:16px; height:16px;"></i>
          </button>
        </div>
      </header>

      <!-- Tab bar -->
      <nav class="shrink-0 flex items-center gap-1 px-3 sm:px-6 md:px-8 h-12 overflow-x-auto no-scrollbar flex-nowrap" style="border-bottom:1px solid var(--line); background:var(--bg);">
        ${TABS.map((t) => `
          <button class="tab-btn shrink-0 px-3 sm:px-4 h-8 flex items-center gap-2 whitespace-nowrap" data-tab="${t.id}">
            <i data-lucide="${t.icon}" style="width:16px; height:16px;"></i>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </nav>

      <!-- Scrollable content region -->
      <div data-scroll-region="primary" class="flex-1 min-h-0 overflow-y-auto safe-bottom">
        <div id="content-root" class="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8"></div>
      </div>
    </div>
  `

  contentRoot = document.getElementById('content-root')

  // Tab clicks
  root.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-tab')))
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

  // Listen to system theme changes if user hasn't set a preference
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
  const initialTab = TABS.some((t) => t.id === hash) ? hash : 'overview'
  currentTab = initialTab
  root.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === initialTab)
  })
  renderContent()

  // Hash change navigation (back/forward)
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '')
    if (TABS.some((t) => t.id === h) && h !== currentTab) {
      navigateTo(h)
    }
  })
}
