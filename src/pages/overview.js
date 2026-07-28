// 统计概览 page — KPI summary, position usage, circuit breaker, recent trades, favorites, stage goals.

import { refreshIcons } from '../utils/icons.js'
import { showToast, escHtml } from '../utils/ui.js'
import { lsGet, lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'
import { on, DATA_EVENTS } from '../utils/events.js'

const SAMPLE_GOAL = null

export function createOverviewPage(root) {
  let state = {
    goals: ensureGoals(loadGoals())
  }

  function loadGoals() {
    return lsGetJSON(STORAGE_KEYS.stageGoals, null)
  }
  function saveGoals() {
    lsSetJSON(STORAGE_KEYS.stageGoals, state.goals)
  }
  function ensureGoals(goals) {
    if (!goals || goals.length === 0) return []
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
    // 动态计算所有数据
    const trades = lsGetJSON(STORAGE_KEYS.tradeRecords, []) || []
    const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
    const riskData = lsGet(STORAGE_KEYS.riskCtrl + 'total_fund', '200000')
    const totalFund = parseFloat(riskData) || 0
    const stockValue = holdings.reduce((sum, h) => sum + (parseFloat(h.quantity) || 0) * (parseFloat(h.currentPrice) || 0), 0)
    // 盈亏（持仓总浮动盈亏）= Σ(现价 - 成本价) × 持仓数
    const floatPnl = holdings.reduce((sum, h) => {
      const qty = parseFloat(h.quantity) || 0
      if (qty <= 0) return sum
      const buyPrice = parseFloat(h.buyPrice) || 0
      const curPrice = parseFloat(h.currentPrice) || 0
      return sum + (curPrice - buyPrice) * qty
    }, 0)
    // 可用资金 = 账户总金额 - Σ(成本价 × 持仓数量)
    // 公式推导：账户总金额 - 股票市值(现价) - 浮亏 + 浮盈 = 账户总金额 - Σ(成本价×数量)
    const totalHoldingCost = holdings.reduce((s, h) => s + (parseFloat(h.buyPrice) || 0) * (parseFloat(h.quantity) || 0), 0)
    const available = totalFund - totalHoldingCost
    // 当前总资产 = 股票市值 + 可用资金
    const totalAsset = stockValue + available
    // 累计盈亏 = 当前总资产 - 账户总金额
    const totalPnl = totalAsset - totalFund
    // 本日盈亏 = 今日卖出金额 - 今日买入金额
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayBuy = trades.filter(t => t.type === 'buy' && t.date === todayStr).reduce((s, t) => s + (parseFloat(t.actualAmount) || 0), 0)
    const todaySell = trades.filter(t => t.type === 'sell' && t.date === todayStr).reduce((s, t) => s + (parseFloat(t.actualAmount) || 0), 0)
    const todayPnl = todaySell - todayBuy
    // 本月累计盈亏 = 持仓浮动盈亏
    const monthlyPnl = floatPnl
    const positionPct = totalAsset > 0 ? (stockValue / totalAsset * 100) : 0

    // 本月买入股数：累加交易记录里的 actualPnl（已改为买入股数）
    const now = new Date()
    const monthPrefix = now.toISOString().slice(0, 7)
    let monthlyShares = 0
    trades.forEach((t) => {
      if (t.date && t.date.startsWith(monthPrefix) && t.actualPnl) {
        const num = parseFloat(String(t.actualPnl))
        if (!isNaN(num)) monthlyShares += num
      }
    })

    // 合规率
    const completed = trades.filter((t) => t.actualPnl && !String(t.actualPnl).includes('待结算') && t.actualPnl !== '--')
    const compliant = completed.filter((t) => t.status === '合规').length
    const rate = completed.length > 0 ? Math.round(compliant / completed.length * 100) : 0

    // 连续合规笔数（从最新往前数连续合规的笔数）
    let streak = 0
    for (const t of completed) {
      if (t.status === '合规') streak++
      else break
    }

    // 仓位上限 30%、个股上限 20%
    const totalCap = 30
    const stockCap = 20

    root.innerHTML = `
      <!-- Filter Bar -->
      <div id="filter-bar" class="mb-6" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
        <div class="flex items-center gap-3 sm:gap-4 flex-wrap">
          <div class="flex items-center gap-2">
            <i data-lucide="calendar-range" style="width:16px; height:16px; color:var(--ink-3);"></i>
            <label class="filter-label" style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">时间段</label>
            <input type="date" id="filter-date-start" class="filter-input">
            <span style="color:var(--ink-3);">—</span>
            <input type="date" id="filter-date-end" class="filter-input">
          </div>
          <div class="hidden sm:block" style="width:1px; height:24px; background:var(--line);"></div>
          <div class="flex items-center gap-2">
            <i data-lucide="search" style="width:16px; height:16px; color:var(--ink-3);"></i>
            <label class="filter-label" style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">股票</label>
            <select id="filter-stock" class="filter-select">
              <option value="all">全部股票</option>
              ${holdings.map((h) => `<option value="${escHtml(h.code)}">${escHtml(h.name)}</option>`).join('')}
            </select>
          </div>
          <div class="flex items-center gap-2 ml-auto">
            <button id="filter-reset" class="btn-secondary">重置</button>
            <button id="filter-apply" class="btn-primary">应用筛选</button>
          </div>
        </div>
      </div>

      <!-- KPI Summary -->
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">当前总资产</span>
            <i data-lucide="coins" style="width:14px; height:14px; color:var(--brand);"></i>
          </div>
          <div style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); white-space:nowrap; font-variant-numeric:tabular-nums;">${totalAsset > 0 ? totalAsset.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '元' : '--'}</div>
          <div class="mt-1" style="font-size:var(--text-caption); color:var(--ink-3);">市值 ${stockValue > 0 ? stockValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '--'} + 可用 ${available > 0 ? available.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '--'}</div>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">累计盈亏</span>
            <i data-lucide="trending-up" style="width:14px; height:14px; color:${totalPnl > 0 ? 'var(--price-up)' : totalPnl < 0 ? 'var(--price-down)' : 'var(--ink-3)'};"></i>
          </div>
          <div style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:${totalPnl > 0 ? 'var(--price-up)' : totalPnl < 0 ? 'var(--price-down)' : 'var(--ink)'}; white-space:nowrap; font-variant-numeric:tabular-nums;">${(totalPnl >= 0 ? '+' : '') + totalPnl.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '元'}</div>
          <div class="mt-1" style="font-size:var(--text-caption); color:var(--ink-3);">总资产 - 账户总金额</div>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">本日盈亏</span>
            <i data-lucide="zap" style="width:14px; height:14px; color:${todayPnl > 0 ? 'var(--price-up)' : todayPnl < 0 ? 'var(--price-down)' : 'var(--ink-3)'};"></i>
          </div>
          <div style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:${todayPnl > 0 ? 'var(--price-up)' : todayPnl < 0 ? 'var(--price-down)' : 'var(--ink)'}; white-space:nowrap; font-variant-numeric:tabular-nums;">${trades.length === 0 ? '--' : (todayPnl >= 0 ? '+' : '') + todayPnl.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '元'}</div>
          <div class="mt-1" style="font-size:var(--text-caption); color:var(--ink-3);">今日卖出 - 今日买入</div>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">本月累计盈亏</span>
            <i data-lucide="arrow-down-up" style="width:14px; height:14px; color:${monthlyPnl > 0 ? 'var(--price-up)' : monthlyPnl < 0 ? 'var(--price-down)' : 'var(--ink-3)'};"></i>
          </div>
          <div style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:${monthlyPnl > 0 ? 'var(--price-up)' : monthlyPnl < 0 ? 'var(--price-down)' : 'var(--ink)'}; white-space:nowrap; font-variant-numeric:tabular-nums;">${holdings.length === 0 ? '--' : (monthlyPnl >= 0 ? '+' : '') + monthlyPnl.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '元'}</div>
          <div class="mt-1" style="font-size:var(--text-caption); color:var(--ink-3);">${holdings.length === 0 ? '暂无持仓' : '持仓盈亏合计'}</div>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">规则合规率</span>
            <i data-lucide="check-circle" style="width:14px; height:14px; color:${rate >= 80 ? 'var(--state-success)' : rate >= 60 ? 'var(--state-warning)' : 'var(--state-error)'};"></i>
          </div>
          <div class="flex items-baseline gap-2">
            <span style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); white-space:nowrap; font-variant-numeric:tabular-nums;">${completed.length === 0 ? '--' : rate + '%'}</span>
          </div>
          <div class="mt-2" style="height:4px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
            <div style="width:${rate}%; height:100%; border-radius:var(--r-pill); background:${rate >= 80 ? 'var(--state-success)' : rate >= 60 ? 'var(--state-warning)' : 'var(--state-error)'};"></div>
          </div>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) sm:var(--s-5); min-width:0;">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">连续合规笔数</span>
            <i data-lucide="flame" style="width:14px; height:14px; color:var(--state-warning);"></i>
          </div>
          <div style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); white-space:nowrap; font-variant-numeric:tabular-nums;">${completed.length === 0 ? '--' : streak + '笔'}</div>
          <div class="mt-1" style="font-size:var(--text-caption); color:var(--ink-3);">目标 20笔</div>
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
            <span style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:${positionPct > 30 ? 'var(--state-error)' : positionPct > 20 ? 'var(--state-warning)' : 'var(--state-success)'}; font-variant-numeric:tabular-nums;">${totalAsset > 0 ? positionPct.toFixed(1) + '%' : '--'}</span>
          </div>
          <div class="mb-1" style="height:10px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
            <div style="width:${Math.min(positionPct, 100)}%; height:100%; border-radius:var(--r-pill); background:${positionPct > 30 ? 'var(--state-error)' : positionPct > 20 ? 'var(--state-warning)' : 'var(--state-success)'}; transition:width 300ms;"></div>
          </div>
          <div class="flex justify-between" style="font-size:var(--text-caption); color:var(--ink-3);">
            <span>当前 ${totalAsset > 0 ? positionPct.toFixed(1) + '%' : '--'}</span>
            <span>总仓位上限 ${totalCap}%</span>
          </div>
          <div class="my-4" style="border-top:1px solid var(--line);"></div>
          <div class="flex flex-col gap-3">
            ${holdings.filter((h) => parseFloat(h.quantity) > 0).length === 0 ? `
              <div class="flex items-center gap-2 py-2" style="font-size:var(--text-caption); color:var(--ink-3);">
                <i data-lucide="plus-circle" style="width:14px; height:14px;"></i>
                <span>暂无持仓，可在「持仓检查」中录入</span>
              </div>
            ` : holdings.filter((h) => parseFloat(h.quantity) > 0).map((h) => {
              const qty = parseFloat(h.quantity) || 0
              const price = parseFloat(h.currentPrice) || 0
              const value = qty * price
              const pct = totalAsset > 0 ? (value / totalAsset * 100) : 0
              const barW = Math.min(pct / stockCap * 100, 100)
              return `
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span style="font-size:var(--text-body); color:var(--ink-2);">${escHtml(h.name)}</span>
                    <span style="font-size:var(--text-caption); font-weight:var(--weight-medium); color:${pct > stockCap ? 'var(--state-error)' : pct > stockCap * 0.8 ? 'var(--state-warning)' : 'var(--state-success)'}; font-variant-numeric:tabular-nums;">${pct.toFixed(1)}%</span>
                  </div>
                  <div class="mb-1" style="height:6px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
                    <div style="width:${barW}%; height:100%; border-radius:var(--r-pill); background:${pct > stockCap ? 'var(--state-error)' : pct > stockCap * 0.8 ? 'var(--state-warning)' : 'var(--state-success)'};"></div>
                  </div>
                  <div class="flex justify-between" style="font-size:var(--text-caption); color:var(--ink-3);">
                    <span>${qty.toLocaleString('zh-CN')}股 / ${value.toLocaleString('zh-CN')}元</span>
                    <span>个股上限 ${stockCap}%</span>
                  </div>
                </div>
              `
            }).join('')}
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
          ${trades.length === 0 ? `
            <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
              <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
              <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无交易记录</p>
              <p style="font-size:var(--text-caption); color:var(--ink-3);">可在「交易记录」页面新增</p>
            </div>
          ` : trades.slice(0, 5).map((t) => {
            const pnl = String(t.actualPnl || '--')
            const pnlColor = pnl.startsWith('+') ? 'var(--price-up)' : pnl.startsWith('-') ? 'var(--price-down)' : 'var(--ink-3)'
            const isCompliant = t.status === '合规'
            const date = t.date ? t.date.slice(5).replace('-', '.') : '--'
            return recentTradeHTML({
              date,
              name: t.name + ' / ' + t.code,
              pnl,
              pnlColor,
              status: t.status || '--',
              statusBg: isCompliant ? 'var(--state-success-bg)' : 'var(--state-error-bg)',
              statusColor: isCompliant ? 'var(--state-success)' : 'var(--state-error)',
              icon: isCompliant ? 'check' : 'x'
            })
          }).join('')}
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
                  <input type="text" id="goal-name-input" placeholder="例如：降低某股票持仓成本" class="field-input" style="width:100%;">
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">关联股票</label>
                  <select id="goal-stock-input" class="field-select" style="width:100%;">
                    <option value="">不关联</option>
                    ${holdings.map((h) => `<option value="${escHtml(h.code)}">${escHtml(h.name)} (${escHtml(h.code)})</option>`).join('')}
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

  function renderRecentTrades(data, isFiltered = false) {
    const container = root.querySelector('#recent-trades')
    if (!container) return
    const trades = data || (lsGetJSON(STORAGE_KEYS.tradeRecords, []) || [])

    container.innerHTML = trades.length === 0 ? `
      <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
        <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
        <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">${isFiltered ? '无匹配交易记录' : '暂无交易记录'}</p>
        ${!isFiltered ? '<p style="font-size:var(--text-caption); color:var(--ink-3);">可在「交易记录」页面新增</p>' : ''}
      </div>
    ` : trades.slice(0, 5).map((t) => {
      const pnl = String(t.actualPnl || '--')
      const pnlColor = pnl.startsWith('+') ? 'var(--price-up)' : pnl.startsWith('-') ? 'var(--price-down)' : 'var(--ink-3)'
      const isCompliant = t.status === '合规'
      const date = t.date ? t.date.slice(5).replace('-', '.') : '--'
      return recentTradeHTML({
        date,
        name: t.name + ' / ' + t.code,
        pnl,
        pnlColor,
        status: t.status || '--',
        statusBg: isCompliant ? 'var(--state-success-bg)' : 'var(--state-error-bg)',
        statusColor: isCompliant ? 'var(--state-success)' : 'var(--state-error)',
        icon: isCompliant ? 'check' : 'x'
      })
    }).join('')
    refreshIcons()
  }

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

  let filterState = { keyword: '', startDate: '', endDate: '', stock: 'all' }

  function getFilteredData() {
    const allTrades = lsGetJSON(STORAGE_KEYS.tradeRecords, []) || []

    let filteredTrades = allTrades
    if (filterState.keyword) {
      const k = filterState.keyword.toLowerCase()
      filteredTrades = filteredTrades.filter(t => {
        const matchStock = (t.name && t.name.toLowerCase().includes(k)) ||
                           (t.code && t.code.toLowerCase().includes(k))
        const matchDate = t.date && t.date.includes(filterState.keyword)
        return matchStock || matchDate
      })
    }
    if (filterState.startDate) {
      filteredTrades = filteredTrades.filter(t => !t.date || t.date >= filterState.startDate)
    }
    if (filterState.endDate) {
      filteredTrades = filteredTrades.filter(t => !t.date || t.date <= filterState.endDate)
    }
    if (filterState.stock !== 'all') {
      filteredTrades = filteredTrades.filter(t => t.code === filterState.stock)
    }

    let filteredGoals = state.goals
    if (filterState.keyword) {
      const k = filterState.keyword.toLowerCase()
      filteredGoals = filteredGoals.filter(g =>
        g.name && g.name.toLowerCase().includes(k)
      )
    }
    if (filterState.stock !== 'all') {
      filteredGoals = filteredGoals.filter(g => !g.stockCode || g.stockCode === filterState.stock)
    }

    return { filteredTrades, filteredGoals }
  }

  function refreshFilteredViews() {
    const { filteredTrades, filteredGoals } = getFilteredData()
    const isFiltered = !!filterState.keyword || filterState.stock !== 'all' || !!filterState.startDate || !!filterState.endDate
    renderRecentTrades(filteredTrades, isFiltered)
    renderGoals(filteredGoals)
  }

  function bindEvents() {
    // Filter bar
    const applyBtn = root.querySelector('#filter-apply')
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const startEl = root.querySelector('#filter-date-start')
        const endEl = root.querySelector('#filter-date-end')
        const stockEl = root.querySelector('#filter-stock')
        filterState.startDate = startEl ? startEl.value : ''
        filterState.endDate = endEl ? endEl.value : ''
        filterState.stock = stockEl ? stockEl.value : 'all'
        refreshFilteredViews()
        showToast('已应用筛选条件')
      })
    }
    const resetBtn = root.querySelector('#filter-reset')
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const startEl = root.querySelector('#filter-date-start')
        const endEl = root.querySelector('#filter-date-end')
        const stockEl = root.querySelector('#filter-stock')
        if (startEl) startEl.value = ''
        if (endEl) endEl.value = ''
        if (stockEl) stockEl.value = 'all'
        filterState = { keyword: '', startDate: '', endDate: '', stock: 'all' }
        refreshFilteredViews()
        showToast('筛选已重置')
      })
    }
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

    on(DATA_EVENTS.HOLDINGS_CHANGED, () => {
      render()
    })
    on(DATA_EVENTS.TRADE_RECORDS_CHANGED, () => {
      render()
    })
    on(DATA_EVENTS.RISK_CTRL_CHANGED, () => {
      render()
    })
  }

  return {
    mount() {
      render()
      bindGoalEvents()
      bindEvents()
    },
    unmount() {
      // cleanup if needed
    }
  }
}
