// 账户风控 page — 纪律恢复期、仓位使用率、熔断状态及熔断检查清单

import { refreshIcons } from '../utils/icons.js'
import { showSaveStatus, escHtml } from '../utils/ui.js'
import {
  lsGet,
  lsSet,
  lsGetJSON,
  STORAGE_KEYS
} from '../utils/storage.js'
import { on, emit, DATA_EVENTS } from '../utils/events.js'

// Field keys persisted under STORAGE_KEYS.riskCtrl prefix
const FIELD_KEYS = {
  totalFund: 'total_fund',
  compliantCount: 'compliant_count',
  recoveryStatus: 'recovery_status'
}

const CHECKLIST_DEFS = [
  {
    title: '连续3笔止损',
    trigger: '连续3笔交易均触发止损',
    source: '交易记录页面'
  },
  {
    title: '单月累计亏损达到3%',
    trigger: '本月累计亏损 / 本金 >= 3%',
    source: '本月累计盈亏 & 本金'
  },
  {
    title: '发生浮亏补仓',
    trigger: '每日复盘中"是否严格执行止损"回答为"否"',
    source: '每日复盘页面 (Q&A 第2题)'
  },
  {
    title: '单只持仓超过20%',
    trigger: '任意单只股票持仓市值 / 本金 > 20%',
    source: '交易记录页面 (个股持仓明细)'
  },
  {
    title: '无计划买入',
    trigger: '每日复盘中"是否有未经计划的临时操作"回答为"是"',
    source: '每日复盘页面 (Q&A 第6题)'
  },
  {
    title: '情绪化下单',
    trigger: '每日复盘中"情绪状态是否稳定"回答为"否"',
    source: '每日复盘页面 (Q&A 第5题)'
  }
]

// Map checklist item index -> daily review Q&A index.
const QA_MAPPING = {
  // Item 3 (发生浮亏补仓): triggered when "是否严格执行了止损纪律" = 否 (false)
  2: { qaIndex: 1, triggerValue: false, triggeredText: '已触发：未严格执行止损', safeText: '正常：已严格执行止损' },
  // Item 5 (无计划买入): triggered when "是否有未经计划的临时操作" = 是 (true)
  4: { qaIndex: 5, triggerValue: true, triggeredText: '已触发：存在未经计划的临时操作', safeText: '正常：无未经计划的操作' },
  // Item 6 (情绪化下单): triggered when "情绪状态是否稳定" = 否 (false)
  5: { qaIndex: 4, triggerValue: false, triggeredText: '已触发：情绪状态不稳定', safeText: '正常：情绪状态稳定' }
}

export function createRiskControlPage(root) {
  const state = {
    totalFund: parseFloat(lsGet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.totalFund, '200000')) || 200000,
    compliantCount: parseInt(lsGet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.compliantCount, '0')) || 0,
    recoveryStatus: lsGet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.recoveryStatus, 'active')
  }

  // 持仓浮动盈亏
  function calcFloatPnl() {
    const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
    return holdings.reduce((sum, h) => {
      const qty = parseFloat(h.quantity) || 0
      if (qty <= 0) return sum
      const buyPrice = parseFloat(h.buyPrice) || 0
      const curPrice = parseFloat(h.currentPrice) || 0
      return sum + (curPrice - buyPrice) * qty
    }, 0)
  }

  function calcAvailableFund() {
    const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
    const totalHoldingCost = holdings.reduce((s, h) => s + (parseFloat(h.buyPrice) || 0) * (parseFloat(h.quantity) || 0), 0)
    return state.totalFund - totalHoldingCost
  }

  function getHoldingsValue() {
    const holdings = lsGetJSON(STORAGE_KEYS.holdings, null) || []
    if (!Array.isArray(holdings) || holdings.length === 0) return 0
    return holdings.reduce((sum, h) => {
      const qty = parseFloat(h.quantity) || 0
      const price = parseFloat(h.currentPrice) || 0
      return sum + qty * price
    }, 0)
  }

  function calcTotalAsset() {
    return getHoldingsValue() + calcAvailableFund()
  }

  // ── 仓位使用率 ──────────────────────────────────
  function computePositionUsage() {
    const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
    const activeHoldings = holdings.filter((h) => !h.archived && parseFloat(h.quantity) > 0)
    const totalCap = 30
    const stockCap = 20
    const totalAsset = calcTotalAsset()
    const stockValue = getHoldingsValue()
    const totalPct = totalAsset > 0 ? (stockValue / totalAsset * 100) : 0
    const items = activeHoldings.map((h) => {
      const qty = parseFloat(h.quantity) || 0
      const price = parseFloat(h.currentPrice) || 0
      const value = qty * price
      const pct = totalAsset > 0 ? (value / totalAsset * 100) : 0
      const barW = Math.min(pct / stockCap * 100, 100)
      return { id: h.id, name: h.name, qty, value, pct, barW, stockCap }
    })
    return { totalCap, stockCap, totalPct, items, stockValue, totalAsset }
  }

  function renderPositionUsage() {
    const { totalCap, stockCap, totalPct, items, stockValue, totalAsset } = computePositionUsage()
    const totalColor = totalPct > totalCap ? 'var(--state-error)' : totalPct > totalCap * 0.7 ? 'var(--state-warning)' : 'var(--state-success)'
    const totalBarW = Math.min(totalPct / totalCap * 100, 100)
    return `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
        <div class="flex items-center justify-between mb-2">
          <span class="flex items-center gap-2" style="font-size:var(--text-body); color:var(--ink-2);">
            <i data-lucide="pie-chart" style="width:14px; height:14px;"></i>
            总仓位
          </span>
          <span style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:${totalColor}; font-variant-numeric:tabular-nums;">
            ${totalAsset > 0 ? totalPct.toFixed(1) + '%' : '--'}
          </span>
        </div>
        <div class="mb-1" style="height:10px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
          <div style="width:${totalBarW}%; height:100%; border-radius:var(--r-pill); background:${totalColor}; transition:width 300ms;"></div>
        </div>
        <div class="flex justify-between" style="font-size:var(--text-caption); color:var(--ink-3);">
          <span>当前 ${totalAsset > 0 ? totalPct.toFixed(1) + '%' : '--'}（市值 ${stockValue > 0 ? stockValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '--'} 元）</span>
          <span>总仓位上限 ${totalCap}%</span>
        </div>
        <div class="my-4" style="border-top:1px solid var(--line);"></div>
        <div class="flex flex-col gap-3">
          ${items.length === 0 ? `
            <div class="flex items-center gap-2 py-2" style="font-size:var(--text-caption); color:var(--ink-3);">
              <i data-lucide="plus-circle" style="width:14px; height:14px;"></i>
              <span>暂无持仓，可在「持仓检查」中录入</span>
            </div>
          ` : items.map((h) => {
            const color = h.pct > h.stockCap ? 'var(--state-error)' : h.pct > h.stockCap * 0.8 ? 'var(--state-warning)' : 'var(--state-success)'
            return `
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <span style="font-size:var(--text-body); color:var(--ink-2);">${escHtml(h.name)}</span>
                  <span style="font-size:var(--text-caption); font-weight:var(--weight-medium); color:${color}; font-variant-numeric:tabular-nums;">${h.pct.toFixed(1)}%</span>
                </div>
                <div class="mb-1" style="height:6px; border-radius:var(--r-pill); background:var(--surface-2); overflow:hidden;">
                  <div style="width:${h.barW}%; height:100%; border-radius:var(--r-pill); background:${color};"></div>
                </div>
                <div class="flex justify-between" style="font-size:var(--text-caption); color:var(--ink-3);">
                  <span>${h.qty.toLocaleString('zh-CN')}股 / ${h.value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}元</span>
                  <span>个股上限 ${h.stockCap}%</span>
                </div>
              </div>
            `
          }).join('')}
        </div>
      </div>
    `
  }

  function render() {
    root.innerHTML = `
      <!-- Circuit breaker banner -->
      <section id="circuit-banner-ok" class="mb-6" style="background:var(--state-success-bg); border:1px solid var(--state-success); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
        <div class="flex items-center gap-2" style="color:var(--state-success);">
          <i data-lucide="shield-check" style="width:20px; height:20px; flex-shrink:0;"></i>
          <p style="font-size:var(--text-body-l); font-weight:var(--weight-semibold);">熔断未触发 — 交易正常</p>
        </div>
      </section>
      <section id="circuit-banner-triggered" class="hidden mb-6" style="background:var(--state-error-bg); border:1px solid var(--state-error); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
        <div class="flex items-center gap-2" style="color:var(--state-error);">
          <i data-lucide="alert-triangle" style="width:20px; height:20px; flex-shrink:0;"></i>
          <p style="font-size:var(--text-body-l); font-weight:var(--weight-semibold);">熔断触发！停止新交易5个交易日</p>
        </div>
      </section>

      <!-- Section 1: 纪律恢复期 -->
      <section class="mb-8">
        <div class="flex items-center gap-2 mb-4">
          <i data-lucide="refresh-cw" style="width:18px; height:18px; color:var(--brand);"></i>
          <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin:0;">纪律恢复期</h3>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
          <div class="flex flex-wrap items-center gap-4 sm:gap-6 mb-5">
            <label style="font-size:var(--text-body-l); color:var(--ink-2);">当前状态：</label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="recovery-status" value="active" style="accent-color:var(--state-warning);">
              <span style="font-size:var(--text-body); color:var(--ink);">恢复中</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="recovery-status" value="lifted" style="accent-color:var(--state-success);">
              <span style="font-size:var(--text-body); color:var(--ink);">已解除</span>
            </label>
          </div>

          <div id="recovery-progress-card" style="background:var(--state-info-bg); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
            <div class="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div class="flex items-center gap-2" style="color:var(--state-info);">
                <i data-lucide="timer" style="width:16px; height:16px; flex-shrink:0;"></i>
                <span style="font-size:var(--text-body); font-weight:var(--weight-medium);">恢复进度</span>
              </div>
              <div class="flex items-center gap-2">
                <span id="recovery-label" style="font-size:var(--text-caption); color:var(--state-info); font-weight:var(--weight-medium);">已完成 0/20 笔合规交易</span>
                <input type="number" id="rc-compliant-count" min="0" max="20" value="${state.compliantCount}" style="width:52px; background:transparent; border:1px solid var(--state-info); border-radius:var(--r-xs); font-size:var(--text-caption); color:var(--state-info); font-weight:var(--weight-medium); text-align:center; outline:none; font-variant-numeric:tabular-nums;">
              </div>
            </div>
            <div style="height:8px; background:var(--surface-2); border-radius:var(--r-pill); overflow:hidden;">
              <div id="recovery-progress-bar" style="height:100%; width:0%; border-radius:var(--r-pill); background:var(--state-info); transition:width 0.3s ease;"></div>
            </div>
            <div class="flex justify-end mt-1">
              <span id="recovery-pct" style="font-size:var(--text-caption); color:var(--ink-3);">0%</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: 仓位使用率 -->
      <section class="mb-8">
        <div class="flex items-center gap-2 mb-4">
          <i data-lucide="pie-chart" style="width:18px; height:18px; color:var(--brand);"></i>
          <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin:0;">仓位使用率</h3>
        </div>
        <div id="position-usage-container">
          ${renderPositionUsage()}
        </div>
      </section>

      <!-- Section 3: 熔断状态及熔断检查清单 -->
      <section>
        <div class="flex items-center gap-2 mb-4">
          <i data-lucide="alert-triangle" style="width:18px; height:18px; color:var(--brand);"></i>
          <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin:0;">熔断检查清单</h3>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
          <div class="flex flex-col gap-1" id="checklist-container">
            ${CHECKLIST_DEFS.map((c, i) => checklistItemHTML(c, i)).join('')}
          </div>
        </div>
      </section>
    `
    refreshIcons()
    bindEvents()
    updateRecovery()
    runAllChecks()
  }

  function checklistItemHTML(def, idx) {
    const isLast = idx === CHECKLIST_DEFS.length - 1
    const borderStyle = isLast ? '' : 'border-bottom:1px solid var(--line);'
    return `
      <div class="checklist-item" data-checklist-idx="${idx}">
        <div class="checklist-row flex items-center justify-between gap-3 py-2 px-2" data-checklist="${idx}">
          <span style="font-size:var(--text-body-l); line-height:var(--leading-body); color:var(--ink);">${escHtml(def.title)}</span>
          <span class="checklist-tag shrink-0 px-2 py-0.5" style="font-size:var(--text-caption); font-weight:var(--weight-medium); border-radius:var(--r-pill); background:var(--state-warning-bg); color:var(--state-warning); white-space:nowrap;">待检测</span>
        </div>
        <div class="checklist-detail px-2" style="${borderStyle}">
          <div style="font-size:var(--text-caption); line-height:var(--leading-caption); color:var(--ink-3);">
            <p style="margin-bottom:var(--s-1);"><strong style="color:var(--ink-2);">触发条件：</strong>${escHtml(def.trigger)}</p>
            <p style="margin-bottom:var(--s-1);"><strong style="color:var(--ink-2);">当前状态：</strong><span class="detail-value">待检测</span></p>
            <p><strong style="color:var(--ink-2);">数据来源：</strong>${escHtml(def.source)}</p>
          </div>
        </div>
      </div>
    `
  }

  function bindEvents() {
    // Checklist row toggles
    root.querySelectorAll('.checklist-row').forEach((row) => {
      row.addEventListener('click', () => {
        const detail = row.nextElementSibling
        if (detail && detail.classList.contains('checklist-detail')) {
          detail.classList.toggle('expanded')
        }
      })
    })

    // Compliant count input
    const compliantInput = root.querySelector('#rc-compliant-count')
    if (compliantInput) {
      compliantInput.addEventListener('input', () => {
        const v = parseInt(compliantInput.value, 10)
        state.compliantCount = isNaN(v) ? 0 : v
        lsSet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.compliantCount, String(state.compliantCount))
        updateRecovery()
        showSaveStatus()
      })
    }

    // Recovery status radios
    const radios = root.querySelectorAll('input[name="recovery-status"]')
    radios.forEach((r) => {
      if (r.value === state.recoveryStatus) r.checked = true
      r.addEventListener('change', () => {
        state.recoveryStatus = r.value
        lsSet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.recoveryStatus, r.value)
        showSaveStatus()
      })
    })

    // Data sync
    on(DATA_EVENTS.HOLDINGS_CHANGED, () => {
      const container = root.querySelector('#position-usage-container')
      if (container) {
        container.innerHTML = renderPositionUsage()
        refreshIcons()
      }
      runAllChecks()
    })
    on(DATA_EVENTS.TRADE_RECORDS_CHANGED, () => {
      runAllChecks()
    })
    on(DATA_EVENTS.RISK_CTRL_CHANGED, () => {
      const newFund = parseFloat(lsGet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.totalFund, String(state.totalFund)))
      if (!isNaN(newFund) && newFund !== state.totalFund) {
        state.totalFund = newFund
      }
      const container = root.querySelector('#position-usage-container')
      if (container) {
        container.innerHTML = renderPositionUsage()
        refreshIcons()
      }
      runAllChecks()
    })
  }

  function updateRecovery() {
    const compliantInput = root.querySelector('#rc-compliant-count')
    const label = root.querySelector('#recovery-label')
    const bar = root.querySelector('#recovery-progress-bar')
    const pctEl = root.querySelector('#recovery-pct')
    let count = state.compliantCount
    if (count < 0) count = 0
    if (count > 20) count = 20
    state.compliantCount = count
    if (compliantInput) compliantInput.value = count
    const pct = Math.round(count / 20 * 100)
    if (label) label.textContent = '已完成 ' + count + '/20 笔合规交易'
    if (bar) bar.style.width = pct + '%'
    if (pctEl) pctEl.textContent = pct + '%'
  }

  // ── Checklist detection ──
  function getDailyReviewData() {
    return lsGetJSON(STORAGE_KEYS.dailyReview, null)
  }

  function getTradeRecords() {
    return lsGetJSON(STORAGE_KEYS.tradeRecords, null) || []
  }

  function setChecklistStatus(index, status, detailText) {
    const items = root.querySelectorAll('.checklist-item')
    const item = items[index]
    if (!item) return
    const tag = item.querySelector('.checklist-tag')
    const detailVal = item.querySelector('.detail-value')
    if (!tag) return

    if (status === 'triggered') {
      tag.textContent = '触发'
      tag.style.background = 'var(--state-error-bg)'
      tag.style.color = 'var(--state-error)'
    } else if (status === 'safe') {
      tag.textContent = '安全'
      tag.style.background = 'var(--state-success-bg)'
      tag.style.color = 'var(--state-success)'
    } else {
      tag.textContent = '待检测'
      tag.style.background = 'var(--state-warning-bg)'
      tag.style.color = 'var(--state-warning)'
    }
    if (detailVal) {
      if (detailText) {
        detailVal.textContent = detailText
      }
      if (status === 'triggered') {
        detailVal.style.color = 'var(--state-error)'
      } else if (status === 'safe') {
        detailVal.style.color = 'var(--state-success)'
      } else {
        detailVal.style.color = 'var(--ink-3)'
      }
    }
  }

  function runAllChecks() {
    const dailyData = getDailyReviewData()
    const totalFund = state.totalFund
    const monthlyPnl = calcFloatPnl()
    const totalAsset = calcTotalAsset()
    const trades = getTradeRecords()
    const states = ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']

    // Item 1: 连续3笔止损
    const completedTrades = trades.filter((t) => t.actualPnl && !t.actualPnl.includes('待结算') && t.actualPnl !== '--')
    if (completedTrades.length >= 3) {
      const recent3 = completedTrades.slice(0, 3)
      const allLoss = recent3.every((t) => /^-/.test(String(t.actualPnl).trim()))
      states[0] = allLoss ? 'triggered' : 'safe'
    } else if (completedTrades.length > 0) {
      states[0] = 'safe'
    } else {
      states[0] = 'pending'
    }
    setChecklistStatus(0, states[0], describeConsecutiveLosses(completedTrades))

    // Item 2: 单月累计亏损达到3%
    if (totalFund > 0 && monthlyPnl < 0) {
      const lossPct = Math.abs(monthlyPnl) / totalFund * 100
      const detail = '本月亏损 ' + Math.abs(monthlyPnl).toLocaleString('zh-CN', { maximumFractionDigits: 0 }) + ' 元，占比 ' + lossPct.toFixed(2) + '%'
      states[1] = lossPct >= 3 ? 'triggered' : 'safe'
      setChecklistStatus(1, states[1], detail)
    } else {
      states[1] = 'safe'
      if (totalFund <= 0) {
        setChecklistStatus(1, 'safe', '请先填写本金')
      } else {
        setChecklistStatus(1, 'safe', '本月无亏损或未录入盈亏')
      }
    }

    // Items 3, 5, 6 — daily review Q&A driven
    Object.keys(QA_MAPPING).forEach((itemIdxStr) => {
      const itemIdx = parseInt(itemIdxStr, 10)
      const cfg = QA_MAPPING[itemIdxStr]
      let status = 'safe'
      let detail = cfg.safeText
      if (dailyData && Array.isArray(dailyData.qaAnswers) && dailyData.qaAnswers.length > cfg.qaIndex) {
        const ans = dailyData.qaAnswers[cfg.qaIndex]
        if (ans === cfg.triggerValue) {
          status = 'triggered'
          detail = cfg.triggeredText
        } else if (ans === null || ans === undefined) {
          status = 'safe'
          detail = '未录入每日复盘数据'
        }
      } else {
        status = 'safe'
        detail = '未录入每日复盘数据'
      }
      states[itemIdx] = status
      setChecklistStatus(itemIdx, status, detail)
    })

    // Item 4: 单只持仓超过20%
    const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
    const activeHoldings = holdings.filter((h) => !h.archived && parseFloat(h.quantity) > 0)
    if (activeHoldings.length > 0 && totalAsset > 0) {
      const overPosition = activeHoldings.filter((h) => {
        const marketVal = (parseFloat(h.quantity) || 0) * (parseFloat(h.currentPrice) || 0)
        return (marketVal / totalAsset) > 0.20
      })
      if (overPosition.length > 0) {
        states[3] = 'triggered'
        const detailText = overPosition.map((h) => {
          const marketVal = (parseFloat(h.quantity) || 0) * (parseFloat(h.currentPrice) || 0)
          const pct = (marketVal / totalAsset * 100).toFixed(1)
          return `${h.name} ${pct}%`
        }).join('、')
        setChecklistStatus(3, 'triggered', `以下个股仓位超过20%：${detailText}`)
      } else {
        states[3] = 'safe'
        setChecklistStatus(3, 'safe', '所有个股仓位均在20%以下')
      }
    } else if (activeHoldings.length === 0) {
      states[3] = 'pending'
      setChecklistStatus(3, 'pending', '暂无持仓数据')
    } else {
      states[3] = 'pending'
      setChecklistStatus(3, 'pending', '请先填写本金')
    }

    updateCircuitBanner(states)
  }

  function describeConsecutiveLosses(completedTrades) {
    if (completedTrades.length < 3) {
      if (completedTrades.length === 0) return '需在交易记录中录入数据后自动检测'
      return '近 ' + completedTrades.length + ' 笔交易，不足3笔，暂不触发'
    }
    const recent3 = completedTrades.slice(0, 3)
    const lossCount = recent3.filter((t) => /^-/.test(String(t.actualPnl).trim())).length
    if (lossCount === 3) return '近3笔交易均为止损，已触发'
    return '近3笔交易中 ' + lossCount + ' 笔止损，未触发'
  }

  function updateCircuitBanner(states) {
    const anyTriggered = states.indexOf('triggered') !== -1
    const bannerOk = root.querySelector('#circuit-banner-ok')
    const bannerTriggered = root.querySelector('#circuit-banner-triggered')
    if (!bannerOk || !bannerTriggered) return
    if (anyTriggered) {
      bannerOk.classList.add('hidden')
      bannerTriggered.classList.remove('hidden')
    } else {
      bannerOk.classList.remove('hidden')
      bannerTriggered.classList.add('hidden')
    }
  }

  return {
    mount() { render() },
    unmount() {}
  }
}
