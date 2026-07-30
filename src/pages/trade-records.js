// 交易记录 page — trade entry cards with collapsible details + summary stats.

import { refreshIcons } from '../utils/icons.js'
import { showToast, escHtml } from '../utils/ui.js'
import { lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'
import { on, off, notifyDataChange, DATA_EVENTS } from '../utils/events.js'

const EMOTION_OPTIONS = ['平静', '焦虑', '兴奋', '沮丧', '自信', '贪婪', '恐慌']

export function createTradeRecordsPage(root) {
  let trades = loadTrades()
  let _selfNotifying = false

  function loadTrades() {
    const saved = lsGetJSON(STORAGE_KEYS.tradeRecords, null)
    if (saved && Array.isArray(saved)) return saved
    return []
  }

  function saveTrades() {
    lsSetJSON(STORAGE_KEYS.tradeRecords, trades)
  }

  function saveTradesAndNotify() {
    saveTrades()
    _selfNotifying = true
    notifyDataChange(DATA_EVENTS.TRADE_RECORDS_CHANGED)
    _selfNotifying = false
  }

  function updateHoldingsOnTrade(name, code, type, shares, price) {
    if (!code) return
    const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
    const qty = parseInt(shares, 10) || 0
    if (qty <= 0) return

    const existing = holdings.find((h) => h.code === code)
    const priceNum = parseFloat(price) || 0

    if (type === 'buy') {
      if (existing) {
        const oldQty = parseInt(existing.quantity, 10) || 0
        const oldCost = parseFloat(existing.buyPrice) || 0
        const newQty = oldQty + qty
        // 加权平均成本
        if (newQty > 0 && priceNum > 0) {
          existing.buyPrice = ((oldCost * oldQty) + (priceNum * qty)) / newQty
        }
        existing.quantity = newQty
        // 更新现价为最新买入价（确保市值计算有效）
        if (priceNum > 0) existing.currentPrice = priceNum
      } else {
        holdings.push({
          id: 'h_' + Date.now(),
          name, code,
          buyPrice: priceNum > 0 ? priceNum : '--',
          currentPrice: priceNum > 0 ? priceNum : '--',
          quantity: qty,
          createdAt: new Date().toISOString()
        })
      }
    } else if (type === 'sell') {
      if (existing) {
        const oldQty = parseInt(existing.quantity, 10) || 0
        const oldCost = parseFloat(existing.buyPrice) || 0
        const newQty = Math.max(0, oldQty - qty)
        // 做T后重新计算成本
        if (newQty > 0 && priceNum > 0) {
          existing.buyPrice = ((oldCost * oldQty) - (priceNum * qty)) / newQty
        } else if (newQty === 0) {
          existing.buyPrice = oldCost
        }
        existing.quantity = newQty
        // 更新现价为最新卖出价（确保市值计算有效）
        if (priceNum > 0) existing.currentPrice = priceNum
      }
    }
    lsSetJSON(STORAGE_KEYS.holdings, holdings)
    notifyDataChange(DATA_EVENTS.HOLDINGS_CHANGED)
  }

  function render() {
    const total = trades.length
    const compliant = trades.filter((t) => t.status === '合规').length
    const violating = trades.filter((t) => t.status === '违规').length
    const rate = total > 0 ? Math.round(compliant / total * 100) : 0

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">交易记录</h2>
        <button id="new-trade-btn" class="flex items-center gap-2 px-4 h-9 whitespace-nowrap" style="background:var(--brand); color:var(--brand-ink); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); border:none; cursor:pointer;">
          <i data-lucide="plus" style="width:16px; height:16px;"></i>
          新增记录
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-3 mb-6 p-4" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md);">
        <div class="flex items-center gap-2">
          <span style="font-size:var(--text-caption); color:var(--ink-3);">总交易笔数</span>
          <span class="inline-flex items-center justify-center px-2 py-0.5" style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--ink); border-radius:var(--r-sm); background:var(--surface-2); min-width:32px;">${total}</span>
        </div>
        <span style="color:var(--line);">|</span>
        <div class="flex items-center gap-2">
          <span style="font-size:var(--text-caption); color:var(--ink-3);">合规</span>
          <span class="inline-flex items-center justify-center px-2 py-0.5" style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--state-success); border-radius:var(--r-sm); background:var(--state-success-bg); min-width:32px;">${compliant}</span>
        </div>
        <span style="color:var(--line);">|</span>
        <div class="flex items-center gap-2">
          <span style="font-size:var(--text-caption); color:var(--ink-3);">违规</span>
          <span class="inline-flex items-center justify-center px-2 py-0.5" style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--state-error); border-radius:var(--r-sm); background:var(--state-error-bg); min-width:32px;">${violating}</span>
        </div>
        <span style="color:var(--line);">|</span>
        <div class="flex items-center gap-2">
          <span style="font-size:var(--text-caption); color:var(--ink-3);">合规率</span>
          <span class="inline-flex items-center justify-center px-2 py-0.5" style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--brand); border-radius:var(--r-sm); background:var(--brand-muted); min-width:40px;">${rate}%</span>
        </div>
      </div>

      <div id="trade-cards" class="flex flex-col gap-4">
        ${trades.length === 0 ? `
          <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
            <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
            <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无交易记录</p>
            <p style="font-size:var(--text-caption); color:var(--ink-3);">点击右上方「新增记录」开始录入，或在「下单计划」页面执行计划后自动生成</p>
          </div>
        ` : trades.map((t, idx) => tradeCardHTML(t, idx)).join('')}
      </div>
    `
    refreshIcons()
    bindEvents()
  }

  function tradeCardHTML(t, idx) {
    const isBuy = t.type === 'buy'
    const typeLabel = isBuy ? '买入' : '卖出'
    const typeColor = isBuy ? 'var(--state-error)' : 'var(--state-success)'
    const typeBg = isBuy ? 'var(--state-error-bg)' : 'var(--state-success-bg)'
    const statusColor = t.status === '违规' ? 'var(--state-error)' : 'var(--state-success)'
    const statusBg = t.status === '违规' ? 'var(--state-error-bg)' : 'var(--state-success-bg)'

    // 计划价 vs 实际价
    const planPrice = t.planPrice != null ? Number(t.planPrice) : null
    const actualPrice = t.actualPrice != null ? Number(t.actualPrice) : null
    const hasDiff = planPrice != null && actualPrice != null && Math.abs(planPrice - actualPrice) > 0.0001
    const priceDiff = hasDiff ? (actualPrice - planPrice) : 0
    const priceDiffPct = hasDiff && planPrice > 0 ? (priceDiff / planPrice) * 100 : 0
    // 偏差颜色：买入时实际价高于计划 = 不利（红），卖出时实际价低于计划 = 不利（红）
    const diffBad = hasDiff && ((isBuy && priceDiff > 0) || (!isBuy && priceDiff < 0))
    const diffColor = !hasDiff
      ? 'var(--ink-3)'
      : diffBad
        ? 'var(--state-error)'
        : 'var(--state-success)'
    const diffText = !hasDiff
      ? '与计划一致'
      : (diffBad ? '不利偏离' : '有利偏离') + ' ' + (priceDiff >= 0 ? '+' : '') + priceDiff.toFixed(2) + ' (' + (priceDiffPct >= 0 ? '+' : '') + priceDiffPct.toFixed(2) + '%)'

    const planShares = t.planShares != null ? Number(t.planShares) : null
    const actualShares = t.actualShares != null ? Number(t.actualShares) : null
    const sharesText = actualShares != null
      ? (planShares != null && actualShares !== planShares
          ? actualShares + ' / 计划 ' + planShares
          : actualShares)
      : '--'

    const planAmount = t.planAmount != null ? Number(t.planAmount) : null
    const actualAmount = t.actualAmount != null ? Number(t.actualAmount) : null
    const amountText = actualAmount != null
      ? (planAmount != null && Math.abs(actualAmount - planAmount) > 0.01
          ? actualAmount.toLocaleString() + ' / 计划 ' + planAmount.toLocaleString()
          : actualAmount.toLocaleString())
      : '--'

    return `
      <div class="trade-card" data-trade-idx="${idx}" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); box-shadow:var(--shadow-card); overflow:hidden;">
        <div class="flex items-center justify-between px-4 sm:px-5 py-3 gap-3" style="border-bottom:1px solid var(--line);">
          <div class="flex items-center gap-3 min-w-0 flex-wrap">
            <span style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">${escHtml(t.date)}</span>
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);" class="truncate">${escHtml(t.name)} / ${escHtml(t.code)}</span>
            <span class="inline-flex items-center px-2 py-0.5" style="font-size:11px; font-weight:var(--weight-medium); color:${typeColor}; border-radius:var(--r-sm); background:${typeBg};">${typeLabel}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="inline-flex items-center px-2.5 py-0.5" style="font-size:var(--text-caption); font-weight:var(--weight-medium); color:${statusColor}; border-radius:var(--r-sm); background:${statusBg};">${escHtml(t.status)}</span>
            ${t.fromPlanId ? '<span style="font-size:11px; color:var(--brand); display:inline-flex; align-items:center; gap:2px;"><i data-lucide="link" style="width:11px; height:11px;"></i>计划内</span>' : '<span style="font-size:11px; color:var(--ink-3); display:inline-flex; align-items:center; gap:2px;"><i data-lucide="alert-triangle" style="width:11px; height:11px;"></i>无计划</span>'}
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-5 py-3">
          <div>
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">计划${isBuy ? '买入' : '卖出'}价</span>
            <span style="font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono); font-weight:var(--weight-medium);">${planPrice != null ? planPrice.toFixed(2) : '--'}</span>
          </div>
          <div>
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">实际${isBuy ? '买入' : '卖出'}价</span>
            <span style="font-size:var(--text-body); color:${typeColor}; font-family:var(--font-mono); font-weight:var(--weight-semibold);">${actualPrice != null ? actualPrice.toFixed(2) : '--'}</span>
          </div>
          <div>
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">偏差</span>
            <span style="font-size:var(--text-body); color:${diffColor}; font-family:var(--font-mono); font-weight:var(--weight-medium);">${diffText}</span>
          </div>
          <div>
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">股数</span>
            <span style="font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono); font-weight:var(--weight-medium);">${sharesText}</span>
          </div>
          <div>
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">${isBuy ? '买入' : '卖出'}金额</span>
            <span style="font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono); font-weight:var(--weight-medium);">${amountText}</span>
          </div>
          <div>
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">${isBuy ? '买入' : '卖出'}情绪</span>
            <span style="font-size:var(--text-body); color:var(--ink);">${escHtml(t.emotion || '--')}</span>
          </div>
        </div>
        ${t.note ? `
          <div style="border-top:1px solid var(--line); padding:var(--s-2) var(--s-5);">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">备注：</span>
            <span style="font-size:var(--text-caption); color:var(--ink-2);">${escHtml(t.note)}</span>
          </div>
        ` : ''}
      </div>
    `
  }

  function bindEvents() {
    const newBtn = root.querySelector('#new-trade-btn')
    if (newBtn) newBtn.addEventListener('click', () => openAddDialog())
  }

  let dialogEl = null
  let overlayEl = null
  function openAddDialog() {
    closeAddDialog()
    overlayEl = document.createElement('div')
    overlayEl.style.cssText = 'position:fixed; inset:0; z-index:99; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; padding:16px;'
    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeAddDialog() })

    dialogEl = document.createElement('div')
    dialogEl.style.cssText = `background:var(--bg); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-float); padding:var(--s-5) var(--s-6); width:min(480px, 100%); max-height:90vh; overflow-y:auto;`
    dialogEl.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">新增交易记录</h3>
        <button id="close-dialog" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
          <i data-lucide="x" style="width:16px; height:16px;"></i>
        </button>
      </div>
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">股票名称 *</label>
            <input type="text" id="new-name" class="field-input" style="width:100%;" placeholder="例如：兴森科技">
          </div>
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">股票代码 *</label>
            <input type="text" id="new-code" class="field-input" style="width:100%;" placeholder="例如：002436">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">交易类型 *</label>
            <select id="new-type" class="field-select" style="width:100%;">
              <option value="buy">买入</option>
              <option value="sell">卖出</option>
            </select>
          </div>
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">交易日期</label>
            <input type="date" id="new-date" class="field-input" style="width:100%;" value="${new Date().toISOString().slice(0,10)}">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">价格（元）*</label>
            <input type="number" id="new-price" class="field-input" style="width:100%;" placeholder="47.09" step="0.01" min="0">
          </div>
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">股数 *</label>
            <input type="number" id="new-shares" class="field-input" style="width:100%;" placeholder="1000" min="1" step="100">
          </div>
        </div>
        <div>
          <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">买入情绪</label>
          <select id="new-emotion" class="field-select" style="width:100%;">
            ${EMOTION_OPTIONS.map((e) => `<option value="${e}">${e}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">备注</label>
          <textarea id="new-note" rows="2" class="field-input" style="width:100%; resize:vertical;" placeholder="补充说明（可选）"></textarea>
        </div>
        <div style="background:var(--state-error-bg); border-radius:var(--r-sm); padding:var(--s-2) var(--s-3); font-size:var(--text-caption); color:var(--state-error); display:flex; align-items:center; gap:6px;">
          <i data-lucide="info" style="width:12px; height:12px;"></i>
          直接新增的交易记录标记为「违规」，从下单计划执行生成的记录为「合规」
        </div>
        <div class="flex items-center gap-2 justify-end pt-2">
          <button id="cancel-dialog" class="btn-secondary">取消</button>
          <button id="confirm-dialog" class="btn-primary">添加</button>
        </div>
      </div>
    `
    overlayEl.appendChild(dialogEl)
    document.body.appendChild(overlayEl)
    refreshIcons()

    overlayEl.querySelector('#close-dialog').addEventListener('click', closeAddDialog)
    overlayEl.querySelector('#cancel-dialog').addEventListener('click', closeAddDialog)
    overlayEl.querySelector('#confirm-dialog').addEventListener('click', () => {
      const name = overlayEl.querySelector('#new-name').value.trim()
      const code = overlayEl.querySelector('#new-code').value.trim()
      const type = overlayEl.querySelector('#new-type').value
      const date = overlayEl.querySelector('#new-date').value
      const price = overlayEl.querySelector('#new-price').value.trim()
      const shares = overlayEl.querySelector('#new-shares').value.trim()
      const emotion = overlayEl.querySelector('#new-emotion').value
      const note = overlayEl.querySelector('#new-note').value.trim()

      if (!name || !code) { showToast('请填写股票名称和代码'); return }
      if (!price || !shares) { showToast('请填写价格和股数'); return }

      const amount = (parseFloat(price) * parseInt(shares, 10)).toFixed(2)
      const newTrade = {
        id: 't_' + Date.now(),
        date,
        type,
        name, code,
        planPrice: price,
        actualPrice: price,
        planShares: shares,
        actualShares: shares,
        planAmount: amount,
        actualAmount: amount,
        emotion,
        note,
        status: '违规',
        fromPlanId: null
      }
      trades.unshift(newTrade)
      saveTradesAndNotify()
      updateHoldingsOnTrade(name, code, type, shares, price)
      closeAddDialog()
      render()
      showToast('已新增记录，持仓已同步更新')
    })
  }
  function closeAddDialog() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl)
    overlayEl = null
    dialogEl = null
  }

  let _listener = null

  return {
    mount() {
      _listener = () => {
        if (_selfNotifying) return
        trades = loadTrades()
        render()
      }
      on(DATA_EVENTS.TRADE_RECORDS_CHANGED, _listener)
      on(DATA_EVENTS.HOLDINGS_CHANGED, _listener)
      render()
    },
    unmount() {
      closeAddDialog()
      if (_listener) {
        off(DATA_EVENTS.TRADE_RECORDS_CHANGED, _listener)
        off(DATA_EVENTS.HOLDINGS_CHANGED, _listener)
        _listener = null
      }
    }
  }
}
