// 统计概览 page — 关键指标、持仓明细、资金转入转出、本阶段目标操作

import { refreshIcons } from '../utils/icons.js'
import { showToast, showSaveStatus, escHtml } from '../utils/ui.js'
import { lsGet, lsSet, lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'
import { on, emit, DATA_EVENTS } from '../utils/events.js'
import { fetchStockQuotes } from '../utils/stock-quote.js'

const PREFIX = STORAGE_KEYS.riskCtrl
const K_DEPOSIT = PREFIX + 'total_deposit'    // 累计转入
const K_WITHDRAW = PREFIX + 'total_withdraw'  // 累计转出
const K_COMPLIANT = PREFIX + 'compliant_count'

function loadNum(key, fallback = 0) {
  const v = parseFloat(lsGet(key, String(fallback)))
  return isNaN(v) ? fallback : v
}

// ── 日期工具 ──────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10) }

function dateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// 上月最后一天
function lastMonthEndStr() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10)
}

// ── 资产快照 ──────────────────────────────────────
// { '2026-07-28': 200000, '2026-07-29': 201500 }
function loadSnapshots() {
  return lsGetJSON(STORAGE_KEYS.assetSnapshots, {}) || {}
}
function saveSnapshot(date, totalAsset) {
  const snaps = loadSnapshots()
  snaps[date] = totalAsset
  lsSetJSON(STORAGE_KEYS.assetSnapshots, snaps)
}
function getSnapshot(date) {
  const snaps = loadSnapshots()
  return snaps[date] !== undefined ? snaps[date] : null
}

// ── 资金流水 ──────────────────────────────────────
// [{ date:'2026-07-29', type:'in'|'out', amount:5000, ts:1234567890 }, ...]
function loadFlows() {
  return lsGetJSON(STORAGE_KEYS.fundFlows, []) || []
}
function addFlow(type, amount) {
  const flows = loadFlows()
  flows.push({ date: todayStr(), type, amount, ts: Date.now() })
  lsSetJSON(STORAGE_KEYS.fundFlows, flows)
}
// 今日净入金 = 今日转入 - 今日转出
function todayNetFlow() {
  const t = todayStr()
  return loadFlows()
    .filter((f) => f.date === t)
    .reduce((s, f) => s + (f.type === 'in' ? f.amount : -f.amount), 0)
}
// 本月累计净入金
function monthNetFlow() {
  const ym = todayStr().slice(0, 7)  // '2026-07'
  return loadFlows()
    .filter((f) => f.date.slice(0, 7) === ym)
    .reduce((s, f) => s + (f.type === 'in' ? f.amount : -f.amount), 0)
}

export function createOverviewPage(root) {
  let state = {
    totalDeposit: loadNum(K_DEPOSIT, 200000),
    totalWithdraw: loadNum(K_WITHDRAW, 0),
    goals: loadGoals()
  }

  function loadGoals() {
    return lsGetJSON(STORAGE_KEYS.stageGoals, []) || []
  }
  function saveGoals() {
    lsSetJSON(STORAGE_KEYS.stageGoals, state.goals)
  }

  // 本金 = 累计转入 - 累计转出
  function getPrincipal() {
    return state.totalDeposit - state.totalWithdraw
  }

  function saveDeposit(v) {
    state.totalDeposit = v
    lsSet(K_DEPOSIT, String(v))
    emit(DATA_EVENTS.RISK_CTRL_CHANGED)
  }
  function saveWithdraw(v) {
    state.totalWithdraw = v
    lsSet(K_WITHDRAW, String(v))
    emit(DATA_EVENTS.RISK_CTRL_CHANGED)
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

  // ── 数据计算 ──────────────────────────────────────

  function computeMetrics() {
    let holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
    const principal = getPrincipal()  // 本金 = 累计转入 - 累计转出

    // 自动维护昨日收盘价
    const today = todayStr()
    let changed = false
    holdings = holdings.map((h) => {
      if (!h.yesterdayClosePrice || h.yesterdayCloseDate !== today) {
        changed = true
        return {
          ...h,
          yesterdayClosePrice: h.yesterdayClosePrice || h.currentPrice,
          yesterdayCloseDate: today
        }
      }
      return h
    })
    if (changed) {
      lsSetJSON(STORAGE_KEYS.holdings, holdings)
      emit(DATA_EVENTS.HOLDINGS_CHANGED)
    }

    const activeHoldings = holdings.filter((h) => parseFloat(h.quantity) > 0)

    // 股票市值 = Σ(持仓数 × 现价)
    const stockValue = activeHoldings.reduce((s, h) => s + (parseFloat(h.quantity) || 0) * (parseFloat(h.currentPrice) || 0), 0)
    // 总持仓成本 = Σ(持仓数 × 成本价)
    const totalHoldingCost = activeHoldings.reduce((s, h) => s + (parseFloat(h.buyPrice) || 0) * (parseFloat(h.quantity) || 0), 0)
    // 账户总现金 = 本金 - 总持仓成本
    const totalCash = principal - totalHoldingCost
    // 剩余可用金额 = 账户总现金
    const available = totalCash
    // 总资产 = 股票市值 + 剩余可用金额
    const totalAsset = stockValue + available
    // 累计营收 = 总资产 - 本金
    const totalPnl = totalAsset - principal
    // 盈亏占比 = 累计营收 / 本金
    const pnlPct = principal > 0 ? (totalPnl / principal * 100) : 0

    // ── 当日营收 = 今日总资产 - 昨日总资产 - 今日净入金 ──
    const yesterdayAsset = getSnapshot(dateOffset(-1))
    const tNetFlow = todayNetFlow()
    // 今日净入金在转入/转出时已记录，但 totalAsset 是操作后的值
    // 昨日快照不存在时，用 principal 近似（首次使用）
    const yesterdayTotal = yesterdayAsset !== null ? yesterdayAsset : principal
    const todayPnl = totalAsset - yesterdayTotal - tNetFlow

    // ── 本月营收 = 今日总资产 - 上月末总资产 - 本月累计净入金 ──
    const lastMonthEndAsset = getSnapshot(lastMonthEndStr())
    const mNetFlow = monthNetFlow()
    // 上月末快照不存在时，用 principal 近似
    const lastMonthEndTotal = lastMonthEndAsset !== null ? lastMonthEndAsset : principal
    const monthlyPnl = totalAsset - lastMonthEndTotal - mNetFlow

    // 保存今日快照（每次渲染都更新，确保最新）
    saveSnapshot(today, totalAsset)

    // 总仓位占比 = 股票市值 / 总资产
    const positionPct = totalAsset > 0 ? (stockValue / totalAsset * 100) : 0

    return {
      principal, totalDeposit: state.totalDeposit, totalWithdraw: state.totalWithdraw,
      totalCash, stockValue, available,
      totalAsset, totalPnl, pnlPct,
      monthlyPnl, todayPnl, positionPct, activeHoldings
    }
  }

  function render() {
    const m = computeMetrics()
    const fmt = (v) => (isNaN(v) || v === null || v === undefined ? '--' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 }))
    const fmtSigned = (v) => {
      if (isNaN(v) || v === null || v === undefined) return '--'
      const n = Number(v)
      return (n >= 0 ? '+' : '') + n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
    }
    const pnlColor = (v) => (v > 0 ? 'var(--price-up)' : v < 0 ? 'var(--price-down)' : 'var(--ink)')
    const hasData = m.principal > 0 || m.stockValue > 0

    root.innerHTML = `
      <!-- 1. 关键指标 -->
      <section class="mb-8">
        <div class="flex items-center gap-2 mb-4">
          <i data-lucide="bar-chart-3" style="width:18px; height:18px; color:var(--brand);"></i>
          <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin:0;">关键指标</h3>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          ${kpiCard('本金', 'landmark', fmt(m.principal) + '元', 'var(--ink)', false, '初始20万 + Σ转入 - Σ转出')}
          ${kpiCard('当前总资产', 'coins', hasData ? fmt(m.totalAsset) + '元' : '--', 'var(--ink)', false, '市值 + 剩余可用')}
          ${kpiCard('股票市值', 'trending-up', hasData ? fmt(m.stockValue) + '元' : '--', 'var(--ink)', false, 'Σ持仓数×现价')}
          ${kpiCard('剩余可用金额', 'wallet', hasData ? fmt(m.available) + '元' : '--', 'var(--ink)', false, '本金 - 持仓成本')}
          ${kpiCard('累计营收', 'trending-up', hasData ? fmtSigned(m.totalPnl) + '元' : '--', pnlColor(m.totalPnl), false, '总资产 - 本金')}
          ${kpiCard('本月营收', 'arrow-down-up', hasData ? fmtSigned(m.monthlyPnl) + '元' : '--', pnlColor(m.monthlyPnl), false, '今日总资产 - 上月末 - 本月净入金')}
          ${kpiCard('当日营收', 'zap', hasData ? fmtSigned(m.todayPnl) + '元' : '--', pnlColor(m.todayPnl), false, '今日总资产 - 昨日 - 今日净入金')}
          ${kpiCard('盈亏占比', 'percent', hasData ? fmtSigned(m.pnlPct) + '%' : '--', pnlColor(m.pnlPct), false, '累计营收/本金')}
          ${positionPctCard(m.positionPct)}
        </div>
      </section>

      <!-- 2. 持仓明细 -->
      <section class="mb-8">
        <div class="flex items-center gap-2 mb-4">
          <i data-lucide="list-ordered" style="width:18px; height:18px; color:var(--brand);"></i>
          <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin:0;">持仓明细</h3>
          <span class="ml-2" style="font-size:var(--text-caption); color:var(--ink-3);">共 ${m.activeHoldings.length} 只</span>
        </div>
        ${renderHoldingsTable(m.activeHoldings, m.totalAsset)}
      </section>

      <!-- 3. 资金转入转出 -->
      <section class="mb-8">
        <div class="flex items-center gap-2 mb-4">
          <i data-lucide="arrow-left-right" style="width:18px; height:18px; color:var(--brand);"></i>
          <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin:0;">资金转入转出</h3>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5);">
          <!-- 统计汇总 -->
          <div class="grid grid-cols-3 gap-3 sm:gap-4 mb-4 pb-4" style="border-bottom:1px dashed var(--line);">
            <div>
              <div style="font-size:var(--text-caption); color:var(--ink-3);">累计转入</div>
              <div style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--price-up); font-variant-numeric:tabular-nums;">${fmt(m.totalDeposit)}元</div>
            </div>
            <div>
              <div style="font-size:var(--text-caption); color:var(--ink-3);">累计转出</div>
              <div style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--price-down); font-variant-numeric:tabular-nums;">${fmt(m.totalWithdraw)}元</div>
            </div>
            <div>
              <div style="font-size:var(--text-caption); color:var(--ink-3);">本金</div>
              <div style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); font-variant-numeric:tabular-nums;">${fmt(m.principal)}元</div>
            </div>
          </div>

          <!-- 操作区 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">转入金额（元）</label>
              <div class="flex items-center gap-2">
                <input type="number" id="ov-transfer-in" class="field-input" placeholder="0" min="0" step="0.01" style="flex:1;">
                <button id="btn-transfer-in" class="btn-primary">转入</button>
              </div>
            </div>
            <div>
              <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">转出金额（元）</label>
              <div class="flex items-center gap-2">
                <input type="number" id="ov-transfer-out" class="field-input" placeholder="0" min="0" step="0.01" style="flex:1;">
                <button id="btn-transfer-out" class="btn-secondary">转出</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 4. 本阶段目标操作 -->
      <section>
        <div class="flex items-center gap-2 mb-4">
          <i data-lucide="flag" style="width:18px; height:18px; color:var(--brand);"></i>
          <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin:0;">本阶段目标操作</h3>
          <button id="add-goal-btn" class="ml-auto inline-flex items-center gap-1" style="background:none; border:none; cursor:pointer; font-size:var(--text-caption); font-weight:var(--weight-medium); color:var(--brand); font-family:var(--font-primary); padding:0;">
            <i data-lucide="plus" style="width:14px; height:14px;"></i>
            添加目标
          </button>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
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
                  <input type="text" id="goal-name-input" placeholder="例如：降低某股票持仓成本" class="field-input" style="width:100%;">
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">关联股票</label>
                  <select id="goal-stock-input" class="field-select" style="width:100%;">
                    <option value="">不关联</option>
                    ${m.activeHoldings.map((h) => `<option value="${escHtml(h.code)}">${escHtml(h.name)} (${escHtml(h.code)})</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">目标类型 *</label>
                  <select id="goal-type-input" class="field-select" style="width:100%;">
                    <option value="降低成本">降低成本</option>
                    <option value="减持数量">减持数量</option>
                    <option value="达到目标价">达到目标价</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">截止日期</label>
                  <input type="date" id="goal-deadline-input" class="field-input" style="width:100%;">
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
      </section>
    `

    refreshIcons()
    bindTransferEvents()
    bindGoalEvents()
    renderGoals()
  }

  // ── KPI 卡片 ──────────────────────────────────────
  function kpiCard(label, icon, valueText, valueColor, editable, subtitle) {
    const editInput = editable
      ? `<input type="number" id="kpi-edit-principal" class="kpi-edit-input" value="" style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); white-space:nowrap; font-variant-numeric:tabular-nums; background:transparent; border:none; outline:none; padding:0; margin:0; width:100%; font-family:inherit;">`
      : `<div style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:${valueColor}; white-space:nowrap; font-variant-numeric:tabular-nums; overflow:hidden; text-overflow:ellipsis;">${valueText}</div>`
    return `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
        <div class="flex items-center justify-between mb-2">
          <span style="font-size:var(--text-caption); color:var(--ink-3);">${label}</span>
          <i data-lucide="${icon}" style="width:14px; height:14px; color:var(--brand);"></i>
        </div>
        ${editInput}
        <div class="mt-1 truncate" style="font-size:var(--text-caption); color:var(--ink-3);">${subtitle || ''}</div>
      </div>
    `
  }

  function positionPctCard(pct) {
    const color = pct > 30 ? 'var(--state-error)' : pct > 20 ? 'var(--state-warning)' : 'var(--state-success)'
    const barW = Math.min(pct, 100)
    return `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
        <div class="flex items-center justify-between mb-2">
          <span style="font-size:var(--text-caption); color:var(--ink-3);">总仓位占比</span>
          <i data-lucide="pie-chart" style="width:14px; height:14px; color:${color};"></i>
        </div>
        <div style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:${color}; white-space:nowrap; font-variant-numeric:tabular-nums;">${isNaN(pct) ? '--' : pct.toFixed(1) + '%'}</div>
        <div class="mt-2" style="height:6px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
          <div style="width:${barW}%; height:100%; border-radius:var(--r-pill); background:${color}; transition:width 300ms;"></div>
        </div>
      </div>
    `
  }

  // ── 持仓明细表 ────────────────────────────────────
  function renderHoldingsTable(activeHoldings, totalAsset) {
    if (activeHoldings.length === 0) {
      return `
        <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
          <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
          <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无持仓</p>
          <p style="font-size:var(--text-caption); color:var(--ink-3);">可在「持仓检查」页面录入</p>
        </div>
      `
    }
    const fmt = (v) => Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
    const fmtSigned = (v) => (v >= 0 ? '+' : '') + Number(v).toFixed(2)
    const rows = activeHoldings.map((h) => {
      const qty = parseFloat(h.quantity) || 0
      const buy = parseFloat(h.buyPrice) || 0
      const cur = parseFloat(h.currentPrice) || 0
      const marketVal = qty * cur
      const pnl = (cur - buy) * qty
      const pnlPct = buy > 0 ? ((cur - buy) / buy * 100) : 0
      const posPct = totalAsset > 0 ? (marketVal / totalAsset * 100) : 0
      const pnlColor = pnl >= 0 ? 'var(--price-up)' : 'var(--price-down)'
      const alertColor = posPct > 20 ? 'var(--state-error)' : posPct > 15 ? 'var(--state-warning)' : 'var(--ink-3)'
      return `
        <tr style="border-bottom:1px solid var(--line);">
          <td style="padding:10px 8px; font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium);">${escHtml(h.name)}</td>
          <td style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(h.code)}</td>
          <td style="padding:10px 8px; font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono); text-align:right;">${buy > 0 ? fmt(buy) : '--'}</td>
          <td style="padding:10px 8px; font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono); text-align:right;">${cur > 0 ? fmt(cur) : '--'}</td>
          <td style="padding:10px 8px; font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono); text-align:right;">${qty.toLocaleString('zh-CN')}</td>
          <td style="padding:10px 8px; font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono); text-align:right;">${fmt(marketVal)}</td>
          <td style="padding:10px 8px; font-size:var(--text-body); color:${alertColor}; font-weight:var(--weight-medium); text-align:right;">${posPct.toFixed(1)}%</td>
          <td style="padding:10px 8px; font-size:var(--text-body); color:${pnlColor}; font-family:var(--font-mono); text-align:right;">${fmtSigned(pnl)}</td>
          <td style="padding:10px 8px; font-size:var(--text-caption); color:${pnlColor}; text-align:right;">${fmtSigned(pnlPct)}%</td>
        </tr>
      `
    }).join('')

    return `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); overflow:hidden;">
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; min-width:780px;">
            <thead>
              <tr style="background:var(--surface-2);">
                <th style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); text-align:left; font-weight:var(--weight-medium);">名称</th>
                <th style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); text-align:left; font-weight:var(--weight-medium);">代码</th>
                <th style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); text-align:right; font-weight:var(--weight-medium);">成本价</th>
                <th style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); text-align:right; font-weight:var(--weight-medium);">现价</th>
                <th style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); text-align:right; font-weight:var(--weight-medium);">持仓数</th>
                <th style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); text-align:right; font-weight:var(--weight-medium);">市值</th>
                <th style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); text-align:right; font-weight:var(--weight-medium);">仓位占比</th>
                <th style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); text-align:right; font-weight:var(--weight-medium);">盈亏</th>
                <th style="padding:10px 8px; font-size:var(--text-caption); color:var(--ink-3); text-align:right; font-weight:var(--weight-medium);">盈亏%</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `
  }

  // ── 资金转入转出 ──────────────────────────────────
  function bindTransferEvents() {
    root.querySelector('#btn-transfer-in')?.addEventListener('click', () => {
      const input = root.querySelector('#ov-transfer-in')
      const amount = parseFloat(input.value) || 0
      if (amount <= 0) { showToast('请输入有效金额'); return }
      saveDeposit(state.totalDeposit + amount)
      addFlow('in', amount)   // 记录资金流水
      input.value = ''
      showSaveStatus('转入成功，本金已更新')
      render()
    })
    root.querySelector('#btn-transfer-out')?.addEventListener('click', () => {
      const input = root.querySelector('#ov-transfer-out')
      const amount = parseFloat(input.value) || 0
      if (amount <= 0) { showToast('请输入有效金额'); return }
      if (amount > getPrincipal()) { showToast('转出金额不能超过本金'); return }
      saveWithdraw(state.totalWithdraw + amount)
      addFlow('out', amount)  // 记录资金流水
      input.value = ''
      showSaveStatus('转出成功，本金已更新')
      render()
    })
  }

  // ── 目标 ─────────────────────────────────────────
  function renderGoals(goalsList) {
    const list = root.querySelector('#active-goals-list')
    const empty = root.querySelector('#goals-empty-state')
    const toggleArea = root.querySelector('#archived-toggle-area')
    const archivedList = root.querySelector('#archived-goals-list')
    const archivedCount = root.querySelector('#archived-count')
    if (!list) return
    const goals = goalsList || state.goals
    const active = goals.filter((g) => !g.archived)
    const archived = goals.filter((g) => g.archived)

    if (active.length === 0) {
      list.innerHTML = ''
      empty.style.display = 'flex'
      empty.textContent = goalsList ? '无匹配目标' : '暂无目标，点击上方添加'
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
                ${g.stockCode ? '<span class="inline-flex items-center px-2 py-0.5 whitespace-nowrap" style="font-size:11px; border-radius:var(--r-sm); background:var(--brand-bg); color:var(--brand); font-family:var(--font-mono);">' + escHtml(g.stockCode) + '</span>' : ''}
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
          if (el) el.value = ''
        })
        root.querySelector('#goal-type-input').value = '降低成本'
        root.querySelector('#goal-stock-input').value = ''
      })
    }
    if (goalConfirmBtn) {
      goalConfirmBtn.addEventListener('click', () => {
        const name = root.querySelector('#goal-name-input').value.trim()
        const type = root.querySelector('#goal-type-input').value
        const stockCode = root.querySelector('#goal-stock-input').value
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
          name, type, stockCode,
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
        root.querySelector('#goal-stock-input').value = ''
        root.querySelector('#goal-start-input').value = ''
        root.querySelector('#goal-target-input').value = ''
        root.querySelector('#goal-deadline-input').value = ''
        root.querySelector('#goal-note-input').value = ''
        renderGoals()
        showToast('目标已添加')
      })
    }

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

    on(DATA_EVENTS.HOLDINGS_CHANGED, () => render())
    on(DATA_EVENTS.TRADE_RECORDS_CHANGED, () => render())
    on(DATA_EVENTS.RISK_CTRL_CHANGED, () => {
      state.totalDeposit = loadNum(K_DEPOSIT, state.totalDeposit)
      state.totalWithdraw = loadNum(K_WITHDRAW, state.totalWithdraw)
      render()
    })
  }

  // ── 实时行情刷新 ──────────────────────────────
  let _quoteRefreshTimer = null
  let _quoteRefreshing = false

  async function refreshHoldingsQuotes() {
    if (_quoteRefreshing) return
    _quoteRefreshing = true
    try {
      const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
      const codes = holdings.filter((h) => h.code).map((h) => h.code)
      if (codes.length === 0) return

      const quotes = await fetchStockQuotes(codes)
      let updated = 0
      const now = Date.now()
      for (const h of holdings) {
        if (h.code && quotes[h.code]) {
          h.currentPrice = quotes[h.code].price
          h.priceChangePct = quotes[h.code].changePct
          h.priceUpdatedAt = now
          updated++
        }
      }
      if (updated > 0) {
        lsSetJSON(STORAGE_KEYS.holdings, holdings)
        emit(DATA_EVENTS.HOLDINGS_CHANGED)
      }
    } catch (e) {
      console.warn('[overview] 行情刷新失败:', e.message)
    } finally {
      _quoteRefreshing = false
    }
  }

  return {
    mount() {
      render()
      refreshHoldingsQuotes()
      _quoteRefreshTimer = setInterval(refreshHoldingsQuotes, 30000)
    },
    unmount() {
      if (_quoteRefreshTimer) {
        clearInterval(_quoteRefreshTimer)
        _quoteRefreshTimer = null
      }
    }
  }
}
