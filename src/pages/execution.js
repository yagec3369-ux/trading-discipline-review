// 执行情况 page —按买入/卖出拆分显示每条计划执行记录

import { refreshIcons } from '../utils/icons.js'
import { showToast, showSaveStatus, escHtml } from '../utils/ui.js'
import { lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'
import { on, off, notifyDataChange, DATA_EVENTS } from '../utils/events.js'

const LEG_STATUS = {
  pending: { label: '待执行', color: 'var(--state-warning)', bg: 'var(--state-warning-bg)', icon: 'clock' },
  executed: { label: '已执行', color: 'var(--state-success)', bg: 'var(--state-success-bg)', icon: 'check-circle-2' },
  cancelled: { label: '已取消', color: 'var(--state-info)', bg: 'var(--state-info-bg)', icon: 'x-circle' },
  discarded: { label: '已弃用', color: 'var(--ink-3)', bg: 'var(--surface-2)', icon: 'archive' }
}

const FILTER_TABS = [
  { id: 'all', label: '全部' },
  { id: 'buy', label: '买入执行' },
  { id: 'sell', label: '卖出执行' },
  { id: 'pending', label: '待执行' },
  { id: 'executed', label: '已执行' }
]

export function createExecutionPage(root) {
  let plans = loadPlans()
  let currentFilter = 'all'
  let currentStockFilter = 'all'
  let _selfNotifying = false

  function loadPlans() {
    const saved = lsGetJSON(STORAGE_KEYS.plans, null)
    if (saved && Array.isArray(saved)) return saved
    return []
  }

  function savePlans() {
    lsSetJSON(STORAGE_KEYS.plans, plans)
  }

  function savePlansAndNotify() {
    savePlans()
    _selfNotifying = true
    notifyDataChange(DATA_EVENTS.PLANS_CHANGED)
    _selfNotifying = false
  }

  function listLegs() {
    const legs = []
    plans.forEach((p) => {
      const op = p.operationType || 'buy'
      const hasBuy = op === 'buy' || op === 't0'
      const hasSell = op === 'sell' || op === 't0'

      if (hasBuy) {
        const buyStatus = (p.buyStatus && LEG_STATUS[p.buyStatus]) ? p.buyStatus : (op === 'buy' ? p.status || 'pending' : p.buyStatus || 'pending')
        legs.push({
          id: p.id + '_buy',
          plan: p,
          legType: 'buy',
          status: buyStatus,
          actionLabel: '买入',
          actionColor: 'var(--state-error)',
          actionBg: 'var(--state-error-bg)',
          price: p.buyPrice,
          shares: p.buyShares,
          amount: p.buyAmount || ((parseFloat(p.buyPrice) || 0) * (parseFloat(p.buyShares) || 0)),
          operable: op === 'buy' || op === 't0',
          operatedAt: p.buyOperatedAt || null,
          note: p.buyNote || '',
          cancelReason: p.buyCancelReason || ''
        })
      }
      if (hasSell) {
        const sellStatus = (p.sellStatus && LEG_STATUS[p.sellStatus]) ? p.sellStatus : (op === 'sell' ? p.status || 'pending' : p.sellStatus || 'pending')
        legs.push({
          id: p.id + '_sell',
          plan: p,
          legType: 'sell',
          status: sellStatus,
          actionLabel: '卖出',
          actionColor: 'var(--state-success)',
          actionBg: 'var(--state-success-bg)',
          price: p.sellPrice,
          shares: p.sellShares,
          amount: p.sellAmount || ((parseFloat(p.sellPrice) || 0) * (parseFloat(p.sellShares) || 0)),
          operable: op === 'sell' || op === 't0',
          operatedAt: p.sellOperatedAt || null,
          note: p.sellNote || '',
          cancelReason: p.sellCancelReason || ''
        })
      }
    })
    return legs
  }

  function getStockOptions(legs) {
    const map = {}
    legs.forEach((l) => {
      const p = l.plan
      const key = p.code || p.name
      if (key && !map[key]) {
        map[key] = p.name + ' / ' + p.code
      }
    })
    return Object.keys(map).map((k) => ({ code: k, label: map[k] }))
  }

  function render() {
    const legs = listLegs()
    const counts = countLegsByStatus(legs)
    const stockOptions = getStockOptions(legs)

    root.innerHTML = `
      <section class="mb-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          ${statCard('待执行', counts.pending, 'clock', 'var(--state-warning)', 'var(--state-warning-bg)')}
          ${statCard('已执行', counts.executed + counts.cancelled, 'check-circle-2', 'var(--state-success)', 'var(--state-success-bg)')}
          ${statCard('已买入', legs.filter(l => l.status === 'executed' && l.legType === 'buy').length, 'trending-up', 'var(--state-error)', 'var(--state-error-bg)')}
          ${statCard('已卖出', legs.filter(l => l.status === 'executed' && l.legType === 'sell').length, 'trending-down', 'var(--state-success)', 'var(--state-success-bg)')}
        </div>
      </section>

      <section>
        <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <i data-lucide="list-checks" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
            <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">计划执行情况</h2>
          </div>
          <div class="flex items-center gap-2">
            <select id="stock-filter" class="field-select" style="font-size:var(--text-caption); padding:4px 8px; height:32px;">
              <option value="all">全部股票</option>
              ${stockOptions.map((s) => `<option value="${escHtml(s.code)}" ${currentStockFilter === s.code ? 'selected' : ''}>${escHtml(s.label)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="flex items-center gap-1 flex-wrap mb-4">
          ${FILTER_TABS.map((t) => {
            let cnt
            if (t.id === 'all') cnt = ''
            else if (t.id === 'buy') cnt = legs.filter(l => l.legType === 'buy' && l.status === 'pending').length
            else if (t.id === 'sell') cnt = legs.filter(l => l.legType === 'sell' && l.status === 'pending').length
            else if (t.id === 'pending') cnt = counts.pending
            else if (t.id === 'executed') cnt = counts.executed + counts.cancelled
            else cnt = counts[t.id] || 0
            return `
            <button class="filter-btn px-3 py-1" data-filter="${t.id}" style="font-size:var(--text-caption); font-weight:var(--weight-medium); border-radius:var(--r-pill); border:1px solid var(--line); background:transparent; color:var(--ink-3); cursor:pointer; transition:all var(--duration-hover) var(--ease-hover);">
              ${t.label}${cnt !== '' ? ` <span class="filter-count">(${cnt})</span>` : ''}
            </button>
            `
          }).join('')}
        </div>

        <div id="legs-list" class="flex flex-col gap-3">
          ${renderLegCards(legs)}
        </div>
      </section>
    `
    refreshIcons()
    bindEvents()
    updateFilterActive()
  }

  function statCard(label, count, icon, color, bg) {
    return `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4);">
        <div class="flex items-center justify-between mb-2">
          <span style="font-size:var(--text-caption); color:var(--ink-3);">${escHtml(label)}</span>
          <span style="width:28px; height:28px; border-radius:var(--r-sm); background:${bg}; color:${color}; display:inline-flex; align-items:center; justify-content:center;">
            <i data-lucide="${icon}" style="width:14px; height:14px;"></i>
          </span>
        </div>
        <div style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); font-variant-numeric:tabular-nums;">${count}</div>
      </div>
    `
  }

  function countLegsByStatus(legs) {
    const counts = { pending: 0, executed: 0, cancelled: 0, discarded: 0 }
    legs.forEach((l) => {
      if (counts[l.status] !== undefined) counts[l.status]++
    })
    return counts
  }

  function renderLegCards(legs) {
    let filtered = legs
    if (currentStockFilter !== 'all') {
      filtered = filtered.filter((l) => (l.plan.code || l.plan.name) === currentStockFilter)
    }
    if (currentFilter === 'buy') {
      filtered = filtered.filter((l) => l.legType === 'buy' && l.status === 'pending')
    } else if (currentFilter === 'sell') {
      filtered = filtered.filter((l) => l.legType === 'sell' && l.status === 'pending')
    } else if (currentFilter === 'pending') {
      filtered = filtered.filter((l) => l.status === 'pending')
    } else if (currentFilter === 'executed') {
      filtered = filtered.filter((l) => l.status === 'executed' || l.status === 'cancelled')
    } else if (currentFilter === 'cancelled') {
      filtered = filtered.filter((l) => l.status === 'cancelled')
    }

    if (filtered.length === 0) {
      const emptyText = legs.length === 0
        ? '暂无计划，请先在「下单计划」页面提交计划'
        : '该状态下暂无记录'
      return `
        <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
          <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
          <p style="font-size:var(--text-body); color:var(--ink-3);">${escHtml(emptyText)}</p>
        </div>
      `
    }

    const sorted = [...filtered].sort((a, b) => {
      const ta = a.plan.createdAt ? new Date(a.plan.createdAt).getTime() : 0
      const tb = b.plan.createdAt ? new Date(b.plan.createdAt).getTime() : 0
      return tb - ta
    })

    return sorted.map((l) => legCardHTML(l)).join('')
  }

  function legCardHTML(l) {
    const sd = LEG_STATUS[l.status] || LEG_STATUS.pending
    const p = l.plan
    const opTypeLabel = p.operationType === 't0' ? '做T' : p.operationType === 'sell' ? '卖出' : '买入'
    const operated = l.operatedAt ? formatDate(l.operatedAt) : ''
    const totalAmount = (parseFloat(p.buyAmount) || 0) + (parseFloat(p.sellAmount) || 0)
    const expAmount = (p.expectedGainNR || 0) * 1000
    const lossAmount = (p.maxLossNR || 0) * 1000
    const rr = lossAmount > 0 && expAmount > 0 ? (expAmount / lossAmount).toFixed(1) : '--'
    const canAct = l.status === 'pending'

    // 状态颜色根据legType区分
    let statusColor = sd.color
    let statusBg = sd.bg
    if (l.status === 'executed') {
      statusColor = l.legType === 'buy' ? 'var(--state-error)' : 'var(--state-success)'
      statusBg = l.legType === 'buy' ? 'var(--state-error-bg)' : 'var(--state-success-bg)'
    }

    return `
      <div class="leg-card" data-leg-id="${escHtml(l.id)}" data-plan-id="${escHtml(p.id)}" data-leg-type="${l.legType}" style="background:var(--surface); border:1px solid var(--line); border-left:3px solid ${l.status === 'executed' ? statusColor : 'var(--line)'}; border-radius:var(--r-md); overflow:hidden;">
        <div class="flex items-center justify-between px-4 sm:px-5 py-3" style="border-bottom:1px solid var(--line);">
          <div class="flex items-center gap-3 min-w-0 flex-wrap">
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(p.name || '未命名')}</span>
            <span style="font-size:var(--text-mono); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(p.code || '')}</span>
            <span style="font-size:11px; padding:2px 8px; border-radius:var(--r-pill); background:${l.actionBg}; color:${l.actionColor}; font-weight:var(--weight-medium); display:inline-flex; align-items:center; gap:4px;">
              <i data-lucide="${l.legType === 'buy' ? 'trending-up' : 'trending-down'}" style="width:11px; height:11px;"></i>
              ${l.actionLabel}执行
            </span>
            ${p.operationType === 't0' ? `<span style="font-size:11px; padding:2px 8px; border-radius:var(--r-pill); background:var(--state-warning-bg); color:var(--state-warning); font-weight:var(--weight-medium);">${opTypeLabel}</span>` : ''}
          </div>
          <span style="font-size:var(--text-caption); font-weight:var(--weight-medium); padding:2px 10px; border-radius:var(--r-pill); background:${statusBg}; color:${statusColor}; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;">
            <i data-lucide="${sd.icon}" style="width:12px; height:12px;"></i>
            ${escHtml(sd.label)}
          </span>
        </div>

        <div class="px-4 sm:px-5 py-3">
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
            ${metricCell(l.legType === 'buy' ? '买入价' : '卖出价', l.price || '--', l.actionColor)}
            ${metricCell('股数', l.shares || '--')}
            ${metricCell('金额', l.amount ? Number(l.amount).toLocaleString() : '--')}
            ${metricCell('收盘价', p.dailyClose || '--')}
            ${metricCell('预期收益', (p.expectedGainNR || 0) + 'R')}
            ${metricCell('风险收益比', rr === '--' ? '--' : '1:' + rr)}
          </div>
          ${l.cancelReason ? `<div style="font-size:var(--text-caption); color:var(--state-info); padding:var(--s-2) var(--s-3); background:var(--state-info-bg); border-radius:var(--r-sm); border-left:3px solid var(--state-info);"><strong>取消原因：</strong>${escHtml(l.cancelReason)}</div>` : ''}
          ${l.note && !l.cancelReason ? `<div style="font-size:var(--text-caption); color:var(--ink-3); padding:var(--s-2) var(--s-3); background:var(--bg); border-radius:var(--r-sm); border-left:3px solid ${l.actionColor};"><strong style="color:var(--ink-2);">操作备注：</strong>${escHtml(l.note)}</div>` : ''}
        </div>

        <div class="flex items-center gap-2 px-4 sm:px-5 py-3 flex-wrap">
          <button class="exec-leg-btn" data-action="executed" data-leg-id="${escHtml(l.id)}" data-plan-id="${escHtml(p.id)}" data-leg-type="${l.legType}" ${canAct ? '' : 'disabled'} style="font-size:var(--text-caption); font-weight:var(--weight-medium); padding:6px 14px; border-radius:var(--r-sm); border:none; ${canAct ? `background:${l.legType === 'buy' ? 'var(--state-error)' : 'var(--state-success)'}; color:#fff; cursor:pointer;` : 'background:var(--surface-2); color:var(--ink-3); cursor:not-allowed;'} display:inline-flex; align-items:center; gap:4px;">
            <i data-lucide="check" style="width:12px; height:12px;"></i>
            已${l.actionLabel}
          </button>
          <button class="exec-leg-btn" data-action="cancelled" data-leg-id="${escHtml(l.id)}" data-plan-id="${escHtml(p.id)}" data-leg-type="${l.legType}" ${canAct ? '' : 'disabled'} style="font-size:var(--text-caption); font-weight:var(--weight-medium); padding:6px 14px; border-radius:var(--r-sm); border:none; ${canAct ? 'background:var(--state-info); color:#fff; cursor:pointer;' : 'background:var(--surface-2); color:var(--ink-3); cursor:not-allowed;'} display:inline-flex; align-items:center; gap:4px;">
            <i data-lucide="x" style="width:12px; height:12px;"></i>
            取消
          </button>
          <button class="exec-leg-btn" data-action="discarded" data-leg-id="${escHtml(l.id)}" data-plan-id="${escHtml(p.id)}" data-leg-type="${l.legType}" ${canAct ? '' : 'disabled'} style="font-size:var(--text-caption); font-weight:var(--weight-medium); padding:6px 14px; border-radius:var(--r-sm); border:1px solid var(--line); ${canAct ? 'background:transparent; color:var(--ink-3); cursor:pointer;' : 'background:var(--surface-2); color:var(--ink-3); cursor:not-allowed; border-color:var(--surface-2);'} display:inline-flex; align-items:center; gap:4px;">
            <i data-lucide="archive" style="width:12px; height:12px;"></i>
            弃用
          </button>
          ${!canAct ? `
            <span style="font-size:var(--text-caption); color:var(--ink-3); margin-left:auto;">
              ${operated ? '操作时间：' + escHtml(operated) : ''}
            </span>
            <button class="plan-toggle-detail" data-leg-id="${escHtml(l.id)}" style="font-size:var(--text-caption); color:var(--brand); background:none; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i data-lucide="chevron-down" class="detail-chevron" style="width:14px; height:14px; transition:transform 0.2s ease;"></i>
              详情
            </button>
          ` : ''}
        </div>
        ${!canAct ? `
          <div class="plan-detail" style="max-height:0; overflow:hidden; transition:max-height 0.3s ease;">
            <div class="px-4 sm:px-5 pb-4" style="border-top:1px solid var(--line); padding-top:var(--s-4);">
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                ${detailItem('操作类型', opTypeLabel)}
                ${detailItem('执行类型', l.actionLabel)}
                ${detailItem('状态', sd.label)}
                ${detailItem('创建时间', formatDate(p.createdAt))}
              </div>
              ${p.reviewNotes ? `<div class="mb-2"><span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">复盘总结</span><p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(p.reviewNotes)}</p></div>` : ''}
              ${totalAmount > 0 ? `<div class="mt-2" style="font-size:var(--text-caption); color:var(--ink-3);">计划总金额: ${totalAmount.toLocaleString()} 元</div>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    `
  }

  function metricCell(label, value, color) {
    return `
      <div class="text-center min-w-0">
        <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">${escHtml(label)}</div>
        <div style="font-size:var(--text-mono); font-family:var(--font-mono); color:${color || 'var(--ink-2)'}; font-weight:var(--weight-medium);">${escHtml(String(value))}</div>
      </div>
    `
  }

  function detailItem(label, value) {
    return `
      <div>
        <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">${escHtml(label)}</span>
        <span style="font-size:var(--text-body); color:var(--ink-2);">${escHtml(String(value))}</span>
      </div>
    `
  }

  function formatDate(iso) {
    if (!iso) return '--'
    try {
      const d = new Date(iso)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mi = String(d.getMinutes()).padStart(2, '0')
      return mm + '-' + dd + ' ' + hh + ':' + mi
    } catch (e) {
      return '--'
    }
  }

  function bindEvents() {
    root.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = btn.getAttribute('data-filter')
        updateFilterActive()
        const list = root.querySelector('#legs-list')
        if (list) {
          list.innerHTML = renderLegCards(listLegs())
          refreshIcons()
          bindCardEvents()
        }
      })
    })

    const stockFilter = root.querySelector('#stock-filter')
    if (stockFilter) {
      stockFilter.addEventListener('change', () => {
        currentStockFilter = stockFilter.value
        const list = root.querySelector('#legs-list')
        if (list) {
          list.innerHTML = renderLegCards(listLegs())
          refreshIcons()
          bindCardEvents()
        }
      })
    }

    bindCardEvents()
  }

  function updateFilterActive() {
    root.querySelectorAll('.filter-btn').forEach((btn) => {
      const active = btn.getAttribute('data-filter') === currentFilter
      if (active) {
        btn.style.background = 'var(--brand)'
        btn.style.color = 'var(--brand-ink)'
        btn.style.borderColor = 'var(--brand)'
      } else {
        btn.style.background = 'transparent'
        btn.style.color = 'var(--ink-3)'
        btn.style.borderColor = 'var(--line)'
      }
    })
  }

  function bindCardEvents() {
    root.querySelectorAll('.exec-leg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return
        const action = btn.getAttribute('data-action')
        const planId = btn.getAttribute('data-plan-id')
        const legType = btn.getAttribute('data-leg-type')
        handleLegAction(planId, legType, action)
      })
    })

    root.querySelectorAll('.plan-toggle-detail').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.leg-card')
        if (!card) return
        const detail = card.querySelector('.plan-detail')
        const chevron = btn.querySelector('.detail-chevron')
        if (detail) {
          const expanded = detail.style.maxHeight && detail.style.maxHeight !== '0px'
          if (expanded) {
            detail.style.maxHeight = '0px'
            if (chevron) chevron.style.transform = 'rotate(0deg)'
          } else {
            detail.style.maxHeight = detail.scrollHeight + 'px'
            if (chevron) chevron.style.transform = 'rotate(180deg)'
          }
        }
      })
    })
  }

  function handleLegAction(planId, legType, action) {
    const plan = plans.find((p) => p.id === planId)
    if (!plan) return

    // 取消需要填写原因
    if (action === 'cancelled') {
      openCancelDialog(plan, legType)
      return
    }

    applyLegAction(plan, legType, action)
  }

  function applyLegAction(plan, legType, action, cancelReason) {
    if (legType === 'buy') {
      plan.buyStatus = action
      plan.buyOperatedAt = new Date().toISOString()
      if (cancelReason) plan.buyCancelReason = cancelReason
    } else if (legType === 'sell') {
      plan.sellStatus = action
      plan.sellOperatedAt = new Date().toISOString()
      if (cancelReason) plan.sellCancelReason = cancelReason
    }

    const opType = plan.operationType || 'buy'
    if (opType === 'buy') {
      plan.status = plan.buyStatus
    } else if (opType === 'sell') {
      plan.status = plan.sellStatus
    } else {
      const bs = plan.buyStatus || 'pending'
      const ss = plan.sellStatus || 'pending'
      if (bs === 'executed' && ss === 'executed') plan.status = 'executed'
      else if (bs === 'cancelled' || ss === 'cancelled') plan.status = 'cancelled'
      else if (bs === 'discarded' || ss === 'discarded') plan.status = 'discarded'
      else plan.status = 'pending'
    }

    const actionLabels = { executed: '已执行', cancelled: '取消', discarded: '弃用' }

    savePlansAndNotify()

    if (action === 'executed') {
      createTradeRecordFromPlan(plan, legType)
    }

    showToast(legType === 'buy' ? '买入记录已标记为「' + actionLabels[action] + '」' : '卖出记录已标记为「' + actionLabels[action] + '」')
    render()
  }

  let cancelOverlayEl = null
  let cancelDialogEl = null

  function openCancelDialog(plan, legType) {
    closeCancelDialog()
    cancelOverlayEl = document.createElement('div')
    cancelOverlayEl.style.cssText = 'position:fixed; inset:0; z-index:100; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; padding:16px;'
    cancelOverlayEl.addEventListener('click', (e) => { if (e.target === cancelOverlayEl) closeCancelDialog() })

    cancelDialogEl = document.createElement('div')
    cancelDialogEl.style.cssText = `background:var(--bg); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-float); padding:var(--s-5) var(--s-6); width:min(420px, 100%);`
    cancelDialogEl.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">取消${legType === 'buy' ? '买入' : '卖出'}计划</h3>
        <button id="close-cancel-dialog" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
          <i data-lucide="x" style="width:16px; height:16px;"></i>
        </button>
      </div>
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-3); margin-bottom:var(--s-3);">
        <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink);">${escHtml(plan.name)}</span>
        <span style="font-size:var(--text-caption); color:var(--ink-3); margin-left:8px;">${escHtml(plan.code)}</span>
      </div>
      <div class="mb-4">
        <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">取消原因 *</label>
        <textarea id="cancel-reason" rows="3" class="field-input" style="width:100%; resize:vertical;" placeholder="请说明取消原因..."></textarea>
      </div>
      <div class="flex items-center gap-2 justify-end">
        <button id="cancel-cancel-dialog" class="btn-secondary">返回</button>
        <button id="confirm-cancel" class="btn-primary" style="background:var(--state-info);">确认取消</button>
      </div>
    `
    cancelOverlayEl.appendChild(cancelDialogEl)
    document.body.appendChild(cancelOverlayEl)
    refreshIcons()

    cancelDialogEl.querySelector('#close-cancel-dialog').addEventListener('click', closeCancelDialog)
    cancelDialogEl.querySelector('#cancel-cancel-dialog').addEventListener('click', closeCancelDialog)
    cancelDialogEl.querySelector('#confirm-cancel').addEventListener('click', () => {
      const reason = cancelDialogEl.querySelector('#cancel-reason').value.trim()
      if (!reason) { showToast('请填写取消原因'); return }
      closeCancelDialog()
      applyLegAction(plan, legType, 'cancelled', reason)
    })
  }

  function closeCancelDialog() {
    if (cancelOverlayEl && cancelOverlayEl.parentNode) cancelOverlayEl.parentNode.removeChild(cancelOverlayEl)
    cancelOverlayEl = null
    cancelDialogEl = null
  }

  function createTradeRecordFromPlan(plan, legType) {
    const trades = lsGetJSON(STORAGE_KEYS.tradeRecords, []) || []
    const records = []

    const pushLeg = (type) => {
      if (type === 'buy' && plan.buyPrice && plan.buyShares) {
        records.push({
          id: 't_buy_' + Date.now(),
          date: new Date().toISOString().slice(0, 10),
          type: 'buy',
          name: plan.name || '',
          code: plan.code || '',
          planPrice: plan.buyPrice,
          actualPrice: plan.buyPrice,
          planShares: plan.buyShares,
          actualShares: plan.buyShares,
          planAmount: plan.buyAmount || (plan.buyPrice * plan.buyShares),
          actualAmount: plan.buyAmount || (plan.buyPrice * plan.buyShares),
          emotion: '',
          note: plan.reviewNotes || '',
          status: '合规',
          fromPlanId: plan.id
        })
      } else if (type === 'sell' && plan.sellPrice && plan.sellShares) {
        records.push({
          id: 't_sell_' + Date.now(),
          date: new Date().toISOString().slice(0, 10),
          type: 'sell',
          name: plan.name || '',
          code: plan.code || '',
          planPrice: plan.sellPrice,
          actualPrice: plan.sellPrice,
          planShares: plan.sellShares,
          actualShares: plan.sellShares,
          planAmount: plan.sellAmount || (plan.sellPrice * plan.sellShares),
          actualAmount: plan.sellAmount || (plan.sellPrice * plan.sellShares),
          emotion: '',
          note: plan.reviewNotes || '',
          status: '合规',
          fromPlanId: plan.id
        })
      }
    }

    if (legType === 'buy') {
      pushLeg('buy')
    } else if (legType === 'sell') {
      pushLeg('sell')
    } else {
      pushLeg('buy')
      pushLeg('sell')
    }

    records.forEach((r) => trades.unshift(r))
    lsSetJSON(STORAGE_KEYS.tradeRecords, trades)

    const code = plan.code
    const name = plan.name

    if (code) {
      const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []

      const updateHoldings = (type) => {
        const existing = holdings.find((h) => h.code === code)
        if (type === 'buy' && plan.buyShares) {
          const qty = parseInt(plan.buyShares, 10) || 0
          const buyPrice = parseFloat(plan.buyPrice) || 0
          if (existing) {
            const oldQty = parseInt(existing.quantity, 10) || 0
            const oldCost = parseFloat(existing.buyPrice) || 0
            // 新成本 = (原成本×原数量 + 买入价×买入数量 - 卖出价×卖出数量) / 总数量
            // 本次为纯买入，卖出数量为 0
            const totalQty = oldQty + qty
            if (totalQty > 0) {
              existing.buyPrice = ((oldCost * oldQty) + (buyPrice * qty)) / totalQty
            }
            existing.quantity = totalQty
            existing.currentPrice = plan.dailyClose || plan.buyPrice || existing.currentPrice
          } else {
            holdings.push({
              id: 'h_' + Date.now(),
              name: name,
              code: code,
              buyPrice: buyPrice || '--',
              currentPrice: plan.dailyClose || plan.buyPrice || '--',
              quantity: qty,
              createdAt: new Date().toISOString()
            })
          }
        } else if (type === 'sell' && plan.sellShares) {
          const qty = parseInt(plan.sellShares, 10) || 0
          const sellPrice = parseFloat(plan.sellPrice) || 0
          if (existing) {
            const oldQty = parseInt(existing.quantity, 10) || 0
            const oldCost = parseFloat(existing.buyPrice) || 0
            // 新成本 = (原成本×原数量 - 卖出价×卖出数量) / 总数量
            // 本次为纯卖出，买入数量为 0
            const totalQty = oldQty - qty
            if (totalQty > 0) {
              existing.buyPrice = ((oldCost * oldQty) - (sellPrice * qty)) / totalQty
            } else if (totalQty === 0) {
              // 全部卖出，清仓保留成本价记录
              existing.buyPrice = oldCost
            }
            existing.quantity = Math.max(0, totalQty)
            existing.currentPrice = plan.sellPrice || existing.currentPrice
          }
        }
      }

      if (legType === 'buy') updateHoldings('buy')
      else if (legType === 'sell') updateHoldings('sell')

      lsSetJSON(STORAGE_KEYS.holdings, holdings)
      notifyDataChange(DATA_EVENTS.HOLDINGS_CHANGED)
    }
    notifyDataChange(DATA_EVENTS.TRADE_RECORDS_CHANGED)
  }

  let _listener = null

  return {
    mount() {
      _listener = () => {
        if (_selfNotifying) return
        plans = loadPlans()
        render()
      }
      on(DATA_EVENTS.PLANS_CHANGED, _listener)
      on(DATA_EVENTS.TRADE_RECORDS_CHANGED, _listener)
      on(DATA_EVENTS.HOLDINGS_CHANGED, _listener)
      render()
    },
    unmount() {
      closeCancelDialog()
      if (_listener) {
        off(DATA_EVENTS.PLANS_CHANGED, _listener)
        off(DATA_EVENTS.TRADE_RECORDS_CHANGED, _listener)
        off(DATA_EVENTS.HOLDINGS_CHANGED, _listener)
        _listener = null
      }
    }
  }
}
