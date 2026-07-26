// 统计概览 page — KPI summary, position usage, circuit breaker, recent trades, favorites, stage goals.

import { refreshIcons } from '../utils/icons.js'
import { showToast, escHtml } from '../utils/ui.js'
import { lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'

const STOCK_POOL = [
  { name: '中科创达', code: '300496', price: '68.30', change: '-0.58%', changeColor: 'var(--price-down)', holding: '0股' },
  { name: '宁德时代', code: '300750', price: '215.40', change: '+0.82%', changeColor: 'var(--price-up)', holding: '0股' },
  { name: '比亚迪', code: '002594', price: '286.50', change: '+1.05%', changeColor: 'var(--price-up)', holding: '0股' },
  { name: '中际旭创', code: '300308', price: '98.70', change: '-0.31%', changeColor: 'var(--price-down)', holding: '0股' }
]

const SAMPLE_GOAL = {
  id: 'sample-1',
  name: '降低兴森科技持仓成本',
  type: '降低成本',
  startValue: 48.50,
  targetValue: 43.00,
  currentValue: 47.20,
  deadline: '2026-08-31',
  note: '分批减仓降低平均成本',
  archived: false,
  createdAt: '2026-07-20'
}

const INITIAL_FAVORITES = [
  { name: '兴森科技', code: '002436', price: '47.09', change: '-1.23%', changeColor: 'var(--price-down)', holding: '3,600股' },
  { name: '立讯精密', code: '002475', price: '36.85', change: '+2.15%', changeColor: 'var(--price-up)', holding: '800股' }
]

export function createOverviewPage(root) {
  let state = {
    favorites: loadFavorites(),
    goals: ensureGoals(loadGoals())
  }

  function loadFavorites() {
    const saved = lsGetJSON(STORAGE_KEYS.favorites, null)
    if (saved && Array.isArray(saved)) return saved
    return [...INITIAL_FAVORITES]
  }
  function saveFavorites() {
    lsSetJSON(STORAGE_KEYS.favorites, state.favorites)
  }
  function loadGoals() {
    return lsGetJSON(STORAGE_KEYS.stageGoals, null)
  }
  function saveGoals() {
    lsSetJSON(STORAGE_KEYS.stageGoals, state.goals)
  }
  function ensureGoals(goals) {
    if (!goals || goals.length === 0) return [SAMPLE_GOAL]
    return goals
  }

  function calcProgress(g) {
    const s = g.startValue, t = g.targetValue, c = g.currentValue
    if (g.type === '降低成本' || g.type === '减持数量') {
      if (c <= t) return 100
      if (s === t) return 0
      return Math.max(0, Math.min(100, Math.round(((s - c) / (s - t)) * 1000) / 10))
    } else if (g.type === '达到目标价') {
      if (c >= t) return 100
      if (s === t) return 0
      return Math.max(0, Math.min(100, Math.round(((c - s) / (t - s)) * 1000) / 10))
    }
    return 0
  }
  function progressColor(p) {
    if (p <= 0) return 'var(--ink-3)'
    if (p < 50) return 'var(--state-warning)'
    if (p < 100) return 'var(--state-info)'
    return 'var(--state-success)'
  }

  function render() {
    root.innerHTML = `
      <!-- Filter Bar -->
      <div id="filter-bar" class="mb-6" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
        <div class="flex items-center gap-3 sm:gap-4 flex-wrap">
          <div class="flex items-center gap-2">
            <i data-lucide="calendar-range" style="width:16px; height:16px; color:var(--ink-3);"></i>
            <label class="filter-label" style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">时间段</label>
            <input type="date" id="filter-date-start" value="2026-07-01" class="filter-input">
            <span style="color:var(--ink-3);">—</span>
            <input type="date" id="filter-date-end" value="2026-07-21" class="filter-input">
          </div>
          <div class="hidden sm:block" style="width:1px; height:24px; background:var(--line);"></div>
          <div class="flex items-center gap-2">
            <i data-lucide="search" style="width:16px; height:16px; color:var(--ink-3);"></i>
            <label class="filter-label" style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">股票</label>
            <select id="filter-stock" class="filter-select">
              <option value="all">全部股票</option>
              <option value="002436">兴森科技</option>
              <option value="300496">中科创达</option>
              <option value="002475">立讯精密</option>
              <option value="300750">宁德时代</option>
            </select>
          </div>
          <div class="flex items-center gap-2 ml-auto">
            <button id="filter-reset" class="btn-secondary">重置</button>
            <button id="filter-apply" class="btn-primary">应用筛选</button>
          </div>
        </div>
      </div>

      <!-- KPI Summary -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">本月盈亏</span>
            <i data-lucide="trending-up" style="width:14px; height:14px; color:var(--state-success);"></i>
          </div>
          <div style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--price-up); white-space:nowrap; font-variant-numeric:tabular-nums;">+2,340元</div>
          <div class="mt-1" style="font-size:var(--text-caption); color:var(--ink-3);">较上月 +1.2%</div>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">规则合规率</span>
            <i data-lucide="check-circle" style="width:14px; height:14px; color:var(--state-success);"></i>
          </div>
          <div class="flex items-baseline gap-2">
            <span style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); white-space:nowrap; font-variant-numeric:tabular-nums;">87%</span>
          </div>
          <div class="mt-2" style="height:4px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
            <div style="width:87%; height:100%; border-radius:var(--r-pill); background:var(--state-success);"></div>
          </div>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">连续合规笔数</span>
            <i data-lucide="flame" style="width:14px; height:14px; color:var(--state-warning);"></i>
          </div>
          <div style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); white-space:nowrap; font-variant-numeric:tabular-nums;">5笔</div>
          <div class="mt-1" style="font-size:var(--text-caption); color:var(--ink-3);">目标 20笔</div>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">当前状态</span>
            <i data-lucide="shield" style="width:14px; height:14px; color:var(--state-success);"></i>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 whitespace-nowrap" style="font-size:var(--text-body); font-weight:var(--weight-medium); border-radius:var(--r-md); background:var(--state-success-bg); color:var(--state-success);">
            <span style="width:6px;height:6px;border-radius:50%;background:var(--state-success);display:inline-block;"></span>
            正常交易中
          </span>
        </div>
      </div>

      <!-- Position Usage -->
      <div class="mb-8">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">仓位使用率</h3>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
          <div class="flex items-center justify-between mb-2">
            <span class="flex items-center gap-2" style="font-size:var(--text-body); color:var(--ink-2);">
              <i data-lucide="pie-chart" style="width:14px; height:14px;"></i>
              总仓位
            </span>
            <span style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--state-success); font-variant-numeric:tabular-nums;">18%</span>
          </div>
          <div class="mb-1" style="height:10px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
            <div style="width:60%; height:100%; border-radius:var(--r-pill); background:var(--state-success); transition:width 300ms;"></div>
          </div>
          <div class="flex justify-between" style="font-size:var(--text-caption); color:var(--ink-3);">
            <span>当前 18%</span>
            <span>总仓位上限 30%</span>
          </div>
          <div class="my-4" style="border-top:1px solid var(--line);"></div>
          <div class="flex flex-col gap-3">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span style="font-size:var(--text-body); color:var(--ink-2);">兴森科技</span>
                <span style="font-size:var(--text-caption); font-weight:var(--weight-medium); color:var(--state-warning); font-variant-numeric:tabular-nums;">11.4%</span>
              </div>
              <div class="mb-1" style="height:6px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
                <div style="width:57%; height:100%; border-radius:var(--r-pill); background:var(--state-success);"></div>
              </div>
              <div class="flex justify-between" style="font-size:var(--text-caption); color:var(--ink-3);">
                <span>3,600股 / 112,000元</span>
                <span>个股上限 20%</span>
              </div>
            </div>
            <div class="flex items-center gap-2 py-2" style="font-size:var(--text-caption); color:var(--ink-3);">
              <i data-lucide="plus-circle" style="width:14px; height:14px;"></i>
              <span>暂无其他持仓</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Circuit Breaker -->
      <div class="mb-8">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">熔断状态</h3>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
          <div class="flex items-center gap-2 mb-4">
            <span style="width:28px;height:28px;border-radius:50%;background:var(--state-success-bg);display:inline-flex;align-items:center;justify-content:center;">
              <i data-lucide="check" style="width:16px; height:16px; color:var(--state-success);"></i>
            </span>
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--state-success);">全部正常</span>
            <span style="font-size:var(--text-caption); color:var(--ink-3); margin-left:auto;">6 项条件均未触发</span>
          </div>
          <div class="flex flex-wrap gap-2">
            ${['连续3笔止损','单月亏损3%','浮亏补仓','超个股20%','无计划买入','情绪化下单'].map(label => `
              <span class="inline-flex items-center gap-1.5 px-3 py-1 whitespace-nowrap" style="font-size:var(--text-caption); border-radius:var(--r-md); background:var(--state-success-bg); color:var(--state-success);">
                <span style="width:5px;height:5px;border-radius:50%;background:var(--state-success);display:inline-block;"></span>
                ${label}：未触发
              </span>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Recent Trades -->
      <div class="mb-8">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">近期交易纪律</h3>
        <div class="flex flex-col gap-3" id="recent-trades">
          ${recentTradeHTML({date:'07.18', name:'兴森科技', pnl:'+580元', pnlColor:'var(--price-up)', status:'合规', statusBg:'var(--state-success-bg)', statusColor:'var(--state-success)', icon:'check'})}
          ${recentTradeHTML({date:'07.15', name:'宁德时代', pnl:'-320元', pnlColor:'var(--price-down)', status:'合规', statusBg:'var(--state-success-bg)', statusColor:'var(--state-success)', icon:'check'})}
          ${recentTradeHTML({date:'07.11', name:'中际旭创', pnl:'+1,240元', pnlColor:'var(--price-up)', status:'合规', statusBg:'var(--state-success-bg)', statusColor:'var(--state-success)', icon:'check'})}
          ${recentTradeHTML({date:'07.08', name:'比亚迪', pnl:'-180元', pnlColor:'var(--price-down)', status:'违规', statusBg:'var(--state-error-bg)', statusColor:'var(--state-error)', icon:'x'})}
          ${recentTradeHTML({date:'07.03', name:'立讯精密', pnl:'+1,020元', pnlColor:'var(--price-up)', status:'合规', statusBg:'var(--state-success-bg)', statusColor:'var(--state-success)', icon:'check'})}
        </div>
      </div>

      <!-- Favorites -->
      <div id="favorites-section" class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <i data-lucide="star" style="width:18px; height:18px; color:var(--state-warning);"></i>
            <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">我的收藏</h3>
            <span id="fav-count" style="font-size:var(--text-caption); color:var(--ink-3); background:var(--surface); padding:2px 8px; border-radius:var(--r-pill);">${state.favorites.length}只</span>
          </div>
          <button id="add-favorite-btn" style="font-size:var(--text-caption); color:var(--brand); background:none; border:none; cursor:pointer; display:flex; align-items:center; gap:4px;">
            <i data-lucide="plus" style="width:14px; height:14px;"></i>
            添加收藏
          </button>
        </div>
        <div id="fav-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${state.favorites.map((s, idx) => favCardHTML(s, idx)).join('')}
        </div>
      </div>

      <!-- Stage Goals -->
      <div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <i data-lucide="flag" style="width:18px; height:18px; color:var(--brand);"></i>
              <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin:0;">本阶段目标操作</h3>
            </div>
            <button id="add-goal-btn" style="display:flex; align-items:center; gap:4px; background:none; border:none; cursor:pointer; font-size:var(--text-caption); font-weight:var(--weight-medium); color:var(--brand); font-family:var(--font-primary);">
              <i data-lucide="plus" style="width:14px; height:14px;"></i>
              添加目标
            </button>
          </div>
          <div id="active-goals-list" class="flex flex-col gap-3"></div>
          <div id="goals-empty-state" class="py-6 flex items-center justify-center" style="color:var(--ink-3); font-size:var(--text-body); display:none;">
            暂无目标，点击上方添加
          </div>
          <div id="archived-toggle-area" class="mt-3" style="display:none;">
            <div class="my-3" style="border-top:1px solid var(--line);"></div>
            <button id="archived-toggle-btn" style="background:none; border:none; cursor:pointer; font-size:var(--text-caption); color:var(--ink-3); font-family:var(--font-primary); padding:0;">
              查看已归档 (<span id="archived-count">0</span>)
            </button>
            <div id="archived-goals-list" class="flex flex-col gap-2 mt-2" style="display:none;"></div>
          </div>
          <div id="add-goal-form" style="max-height:0; overflow:hidden; transition:max-height 350ms cubic-bezier(0.4,0,0.2,1);">
            <div class="my-4" style="border-top:1px solid var(--line);"></div>
            <div class="flex flex-col gap-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">目标名称 *</label>
                  <input type="text" id="goal-name-input" placeholder="例如：降低兴森科技持仓成本" class="field-input" style="width:100%;">
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">目标类型 *</label>
                  <select id="goal-type-input" class="field-select" style="width:100%;">
                    <option value="降低成本">降低成本</option>
                    <option value="减持数量">减持数量</option>
                    <option value="达到目标价">达到目标价</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">起始值 *</label>
                  <input type="number" id="goal-start-input" placeholder="基准值" class="field-input" style="width:100%;">
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">目标值 *</label>
                  <input type="number" id="goal-target-input" placeholder="目标数值" class="field-input" style="width:100%;">
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">截止日期</label>
                  <input type="date" id="goal-deadline-input" class="field-input" style="width:100%;">
                </div>
              </div>
              <div>
                <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">备注</label>
                <textarea id="goal-note-input" rows="1" placeholder="可选备注" class="field-input" style="width:100%; resize:none;"></textarea>
              </div>
              <div class="flex items-center gap-2 justify-end pt-2">
                <button id="goal-cancel-btn" class="btn-secondary">取消</button>
                <button id="goal-confirm-btn" class="btn-primary">确认添加</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    refreshIcons()
    bindEvents()
    renderGoals()
  }

  function recentTradeHTML(t) {
    return `
      <div class="flex items-center justify-between px-4 sm:px-5 py-3" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md);">
        <div class="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <span class="shrink-0" style="font-size:var(--text-caption); color:var(--ink-3); font-variant-numeric:tabular-nums; width:48px;">${t.date}</span>
          <span class="truncate" style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink);">${t.name}</span>
        </div>
        <div class="flex items-center gap-3 sm:gap-6 shrink-0">
          <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:${t.pnlColor}; font-variant-numeric:tabular-nums;">${t.pnl}</span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 whitespace-nowrap" style="font-size:var(--text-caption); border-radius:var(--r-sm); background:${t.statusBg}; color:${t.statusColor};">
            <i data-lucide="${t.icon}" style="width:12px; height:12px;"></i>
            ${t.status}
          </span>
        </div>
      </div>
    `
  }

  function favCardHTML(s, idx) {
    return `
      <div class="fav-card" data-fav-idx="${idx}" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2 min-w-0">
            <i data-lucide="star" style="width:14px; height:14px; color:var(--state-warning); fill:var(--state-warning); flex-shrink:0;"></i>
            <span style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--ink);" class="truncate">${escHtml(s.name)}</span>
            <span style="font-size:var(--text-mono); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(s.code)}</span>
          </div>
          <button class="unfav-btn" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px; flex-shrink:0;">
            <i data-lucide="x" style="width:14px; height:14px;"></i>
          </button>
        </div>
        <div class="flex items-center justify-between gap-2">
          <div>
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:block;">最新价</span>
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink); font-variant-numeric:tabular-nums;">${escHtml(s.price)}</span>
          </div>
          <div style="text-align:right;">
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:block;">日涨跌</span>
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:${s.changeColor}; font-variant-numeric:tabular-nums;">${escHtml(s.change)}</span>
          </div>
          <div style="text-align:right;">
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:block;">持仓</span>
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink); font-variant-numeric:tabular-nums;">${escHtml(s.holding)}</span>
          </div>
        </div>
      </div>
    `
  }

  function renderFavorites() {
    const grid = root.querySelector('#fav-grid')
    const count = root.querySelector('#fav-count')
    if (!grid || !count) return
    grid.innerHTML = state.favorites.map((s, idx) => favCardHTML(s, idx)).join('')
    count.textContent = state.favorites.length + '只'
    refreshIcons()
  }

  function renderGoals() {
    const list = root.querySelector('#active-goals-list')
    const empty = root.querySelector('#goals-empty-state')
    const toggleArea = root.querySelector('#archived-toggle-area')
    const archivedList = root.querySelector('#archived-goals-list')
    const archivedCount = root.querySelector('#archived-count')
    if (!list) return
    const active = state.goals.filter((g) => !g.archived)
    const archived = state.goals.filter((g) => g.archived)

    if (active.length === 0) {
      list.innerHTML = ''
      empty.style.display = 'flex'
    } else {
      empty.style.display = 'none'
      list.innerHTML = active.map((g) => {
        const p = calcProgress(g)
        const pc = progressColor(p)
        const completed = p >= 100
        return `
          <div data-goal-id="${g.id}" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
            <div class="flex items-center justify-between mb-2 gap-2">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(g.name)}</span>
                <span class="inline-flex items-center px-2 py-0.5 whitespace-nowrap" style="font-size:11px; border-radius:var(--r-sm); background:var(--surface-2); color:var(--ink-3);">${escHtml(g.type)}</span>
              </div>
              ${completed
                ? '<span class="archive-trigger inline-flex items-center px-2 py-0.5 whitespace-nowrap cursor-pointer" data-goal-id="' + g.id + '" style="font-size:var(--text-caption); border-radius:var(--r-sm); background:var(--state-success-bg); color:var(--state-success); font-weight:var(--weight-medium);">完成，点击归档</span>'
                : '<button class="archive-btn" data-goal-id="' + g.id + '" style="background:none; border:none; cursor:pointer; font-size:var(--text-caption); color:var(--ink-3); font-family:var(--font-primary); padding:0;">归档</button>'}
            </div>
            <div class="flex items-center gap-4 sm:gap-6 mb-2 flex-wrap">
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block;">当前值</span>
                <input type="number" class="goal-current-input" value="${g.currentValue}" data-goal-id="${g.id}" style="width:80px; box-sizing:border-box; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm); padding:2px 6px; font-size:var(--text-caption); color:var(--ink); outline:none; font-family:var(--font-mono); font-variant-numeric:tabular-nums;">
              </div>
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block;">目标值</span>
                <span style="font-size:var(--text-caption); font-weight:var(--weight-medium); color:var(--ink); font-family:var(--font-mono); font-variant-numeric:tabular-nums;">${g.targetValue}</span>
              </div>
              ${g.deadline ? '<div><span style="font-size:var(--text-caption); color:var(--ink-3); display:block;">截止</span><span style="font-size:var(--text-caption); color:var(--ink-3); font-variant-numeric:tabular-nums;">' + escHtml(g.deadline) + '</span></div>' : ''}
            </div>
            ${g.note ? '<div class="mb-2" style="font-size:var(--text-caption); color:var(--ink-3);">' + escHtml(g.note) + '</div>' : ''}
            <div>
              <div class="flex justify-between mb-1" style="font-size:var(--text-caption); color:var(--ink-3);">
                <span>进度</span>
                <span style="font-variant-numeric:tabular-nums; color:${pc};">${p}%</span>
              </div>
              <div style="height:6px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
                <div style="width:${p}%; height:100%; border-radius:var(--r-pill); background:${pc}; transition:width 300ms;"></div>
              </div>
            </div>
          </div>
        `
      }).join('')
    }

    if (archived.length === 0) {
      toggleArea.style.display = 'none'
    } else {
      toggleArea.style.display = 'block'
      archivedCount.textContent = archived.length
      archivedList.innerHTML = archived.map((g) => `
        <div style="display:flex; align-items:center; padding:var(--s-2) var(--s-3); border-radius:var(--r-sm); opacity:0.5;">
          <span class="flex-1" style="font-size:var(--text-caption); color:var(--ink-3); text-decoration:line-through;">${escHtml(g.name)}</span>
          <span class="inline-flex items-center px-2 py-0.5 whitespace-nowrap ml-3" style="font-size:11px; border-radius:var(--r-sm); background:var(--surface-2); color:var(--ink-3);">已归档</span>
        </div>
      `).join('')
    }
    refreshIcons()
  }

  function bindEvents() {
    // Filter
    const applyBtn = root.querySelector('#filter-apply')
    if (applyBtn) applyBtn.addEventListener('click', () => showToast('已应用筛选条件'))
    const resetBtn = root.querySelector('#filter-reset')
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        root.querySelector('#filter-date-start').value = '2026-07-01'
        root.querySelector('#filter-date-end').value = '2026-07-21'
        root.querySelector('#filter-stock').value = 'all'
        showToast('筛选已重置')
      })
    }

    // Favorites: remove
    const favGrid = root.querySelector('#fav-grid')
    if (favGrid) {
      favGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.unfav-btn')
        if (!btn) return
        const card = btn.closest('.fav-card')
        if (!card) return
        const idx = parseInt(card.getAttribute('data-fav-idx'), 10)
        card.classList.add('removing')
        setTimeout(() => {
          state.favorites.splice(idx, 1)
          saveFavorites()
          renderFavorites()
        }, 250)
      })
    }

    // Favorites: add popover
    const addBtn = root.querySelector('#add-favorite-btn')
    if (addBtn) {
      addBtn.addEventListener('click', () => openFavPopover())
    }
  }

  let popoverEl = null
  let overlayEl = null
  function openFavPopover() {
    closeFavPopover()
    const addBtn = root.querySelector('#add-favorite-btn')
    if (!addBtn) return
    const rect = addBtn.getBoundingClientRect()

    overlayEl = document.createElement('div')
    overlayEl.style.cssText = 'position:fixed; inset:0; z-index:89;'
    overlayEl.addEventListener('click', closeFavPopover)
    document.body.appendChild(overlayEl)

    popoverEl = document.createElement('div')
    popoverEl.style.cssText = `display:block; position:fixed; z-index:90; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-float); padding:var(--s-5); width:min(320px, calc(100vw - 32px)); top:${rect.bottom + 8}px; left:${Math.max(16, Math.min(rect.left, window.innerWidth - 336))}px;`
    popoverEl.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <span style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--ink);">添加收藏</span>
        <button id="close-fav-popover" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
          <i data-lucide="x" style="width:14px; height:14px;"></i>
        </button>
      </div>
      <input type="text" id="fav-search-input" placeholder="输入股票名称或代码" class="field-input" style="width:100%;">
      <div id="fav-search-results" class="flex flex-col gap-1 mt-2" style="max-height:160px; overflow-y:auto;"></div>
      <div id="fav-empty-hint" class="py-4 flex flex-col items-center gap-2" style="color:var(--ink-3);">
        <i data-lucide="search" style="width:20px; height:20px;"></i>
        <span style="font-size:var(--text-caption);">搜索股票以添加收藏</span>
      </div>
    `
    document.body.appendChild(popoverEl)
    refreshIcons()

    popoverEl.querySelector('#close-fav-popover').addEventListener('click', closeFavPopover)
    const searchInput = popoverEl.querySelector('#fav-search-input')
    const results = popoverEl.querySelector('#fav-search-results')
    const emptyHint = popoverEl.querySelector('#fav-empty-hint')
    searchInput.focus()

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase()
      if (!q) {
        results.innerHTML = ''
        emptyHint.style.display = 'flex'
        return
      }
      emptyHint.style.display = 'none'
      const matches = STOCK_POOL.filter((s) => s.name.toLowerCase().includes(q) || s.code.includes(q))
      results.innerHTML = matches.map((s) => `
        <div class="fav-result-item" data-code="${s.code}">
          <div class="min-w-0">
            <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink);">${escHtml(s.name)}</span>
            <span style="font-size:var(--text-mono); color:var(--ink-3); font-family:var(--font-mono); margin-left:8px;">${escHtml(s.code)}</span>
          </div>
          <span style="font-size:var(--text-caption); color:var(--brand);">添加</span>
        </div>
      `).join('')
      results.querySelectorAll('.fav-result-item').forEach((item) => {
        item.addEventListener('click', () => {
          const code = item.getAttribute('data-code')
          const stock = STOCK_POOL.find((s) => s.code === code)
          if (stock && !state.favorites.some((f) => f.code === code)) {
            state.favorites.push({ ...stock })
            saveFavorites()
            renderFavorites()
            showToast('已添加 ' + stock.name)
          } else {
            showToast('已在收藏中')
          }
          closeFavPopover()
        })
      })
    })
  }
  function closeFavPopover() {
    if (popoverEl && popoverEl.parentNode) popoverEl.parentNode.removeChild(popoverEl)
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl)
    popoverEl = null
    overlayEl = null
  }

  // Goal form + interactions (delegated on root)
  function bindGoalEvents() {
    const addGoalBtn = root.querySelector('#add-goal-btn')
    const addGoalForm = root.querySelector('#add-goal-form')
    const goalCancelBtn = root.querySelector('#goal-cancel-btn')
    const goalConfirmBtn = root.querySelector('#goal-confirm-btn')

    if (addGoalBtn) {
      addGoalBtn.addEventListener('click', () => {
        addGoalForm.style.maxHeight = '500px'
        const nameInput = root.querySelector('#goal-name-input')
        if (nameInput) nameInput.focus()
      })
    }
    if (goalCancelBtn) {
      goalCancelBtn.addEventListener('click', () => {
        addGoalForm.style.maxHeight = '0'
        ;['#goal-name-input', '#goal-start-input', '#goal-target-input', '#goal-deadline-input', '#goal-note-input'].forEach((sel) => {
          const el = root.querySelector(sel)
          if (el) el.value = sel === '#goal-type-input' ? '降低成本' : ''
        })
        root.querySelector('#goal-type-input').value = '降低成本'
      })
    }
    if (goalConfirmBtn) {
      goalConfirmBtn.addEventListener('click', () => {
        const name = root.querySelector('#goal-name-input').value.trim()
        const type = root.querySelector('#goal-type-input').value
        const startVal = parseFloat(root.querySelector('#goal-start-input').value)
        const targetVal = parseFloat(root.querySelector('#goal-target-input').value)
        const deadline = root.querySelector('#goal-deadline-input').value
        const note = root.querySelector('#goal-note-input').value.trim()
        if (!name) { showToast('请填写目标名称'); return }
        if (!type) { showToast('请选择目标类型'); return }
        if (isNaN(startVal)) { showToast('请填写起始值'); return }
        if (isNaN(targetVal)) { showToast('请填写目标值'); return }
        state.goals.push({
          id: 'goal-' + Date.now(),
          name, type,
          startValue: startVal,
          targetValue: targetVal,
          currentValue: startVal,
          deadline: deadline || '',
          note,
          archived: false,
          createdAt: new Date().toISOString().slice(0, 10)
        })
        saveGoals()
        addGoalForm.style.maxHeight = '0'
        root.querySelector('#goal-name-input').value = ''
        root.querySelector('#goal-start-input').value = ''
        root.querySelector('#goal-target-input').value = ''
        root.querySelector('#goal-deadline-input').value = ''
        root.querySelector('#goal-note-input').value = ''
        renderGoals()
        showToast('目标已添加')
      })
    }

    // Archive (delegated)
    const activeList = root.querySelector('#active-goals-list')
    if (activeList) {
      activeList.addEventListener('click', (e) => {
        const archiveBtn = e.target.closest('.archive-btn')
        const archiveTrigger = e.target.closest('.archive-trigger')
        const target = archiveBtn || archiveTrigger
        if (!target) return
        const gid = target.getAttribute('data-goal-id')
        const goal = state.goals.find((g) => g.id === gid)
        if (goal) {
          goal.archived = true
          saveGoals()
          renderGoals()
          showToast('目标已归档')
        }
      })
      activeList.addEventListener('input', (e) => {
        if (!e.target.classList.contains('goal-current-input')) return
        const gid = e.target.getAttribute('data-goal-id')
        const newVal = parseFloat(e.target.value)
        if (isNaN(newVal)) return
        const goal = state.goals.find((g) => g.id === gid)
        if (goal) {
          goal.currentValue = newVal
          saveGoals()
          // Re-render only progress for this card to avoid input losing focus
          // But for simplicity, re-render fully (input blur is acceptable)
          renderGoals()
        }
      })
    }

    const archivedToggleBtn = root.querySelector('#archived-toggle-btn')
    const archivedListEl = root.querySelector('#archived-goals-list')
    if (archivedToggleBtn && archivedListEl) {
      archivedToggleBtn.addEventListener('click', () => {
        const visible = archivedListEl.style.display === 'none' || archivedListEl.style.display === ''
        archivedListEl.style.display = visible ? 'flex' : 'none'
        const archivedCount = state.goals.filter((g) => g.archived).length
        archivedToggleBtn.innerHTML = visible
          ? '收起已归档'
          : '查看已归档 (<span id="archived-count">' + archivedCount + '</span>)'
        refreshIcons()
      })
    }
  }

  return {
    mount() {
      render()
      bindGoalEvents()
    },
    unmount() {
      closeFavPopover()
    }
  }
}
