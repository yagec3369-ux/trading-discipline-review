// 执行情况 page —延续下单计划，可按计划操作/取消/弃用，查看历史计划及操作情况。

import { refreshIcons } from '../utils/icons.js'
import { showToast, showSaveStatus, escHtml } from '../utils/ui.js'
import { lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'
import { notifyDataChange, DATA_EVENTS } from '../utils/events.js'

const STATUS_DEFS = {
  pending: { label: '待执行', color: 'var(--state-warning)', bg: 'var(--state-warning-bg)', icon: 'clock' },
  executed: { label: '已操作', color: 'var(--state-success)', bg: 'var(--state-success-bg)', icon: 'check-circle-2' },
  cancelled: { label: '已取消', color: 'var(--state-info)', bg: 'var(--state-info-bg)', icon: 'x-circle' },
  discarded: { label: '已弃用', color: 'var(--ink-3)', bg: 'var(--surface-2)', icon: 'archive' }
}

const FILTER_TABS = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待执行' },
  { id: 'executed', label: '已操作' },
  { id: 'cancelled', label: '已取消' },
  { id: 'discarded', label: '已弃用' }
]

const MOTIVE_LABELS = {
  plan: '计划内操作', fomo: '怕错过 (FOMO)', revenge: '报复性交易',
  recovery: '急于回本', greed: '贪婪追涨', fear: '恐慌杀跌'
}

const EMOTION_LABELS = {
  calm: '平静', anxious: '焦虑', excited: '兴奋',
  frustrated: '沮丧', confident: '自信'
}

export function createExecutionPage(root) {
  let plans = loadPlans()
  let currentFilter = 'all'

  function loadPlans() {
    const saved = lsGetJSON(STORAGE_KEYS.plans, null)
    if (saved && Array.isArray(saved)) return saved
    return []
  }

  function savePlans() {
    lsSetJSON(STORAGE_KEYS.plans, plans)
    showSaveStatus()
  }

  function render() {
    const counts = countByStatus()
    root.innerHTML = `
      <!-- Section 1: 统计概览 -->
      <section class="mb-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          ${statCard('待执行', counts.pending, 'clock', 'var(--state-warning)', 'var(--state-warning-bg)')}
          ${statCard('已操作', counts.executed, 'check-circle-2', 'var(--state-success)', 'var(--state-success-bg)')}
          ${statCard('已取消', counts.cancelled, 'x-circle', 'var(--state-info)', 'var(--state-info-bg)')}
          ${statCard('已弃用', counts.discarded, 'archive', 'var(--ink-3)', 'var(--surface-2)')}
        </div>
      </section>

      <!-- Section 2: 筛选 + 计划列表 -->
      <section>
        <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <i data-lucide="list-checks" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
            <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">计划执行情况</h2>
          </div>
          <div class="flex items-center gap-1 flex-wrap">
            ${FILTER_TABS.map((t) => `
              <button class="filter-btn px-3 py-1" data-filter="${t.id}" style="font-size:var(--text-caption); font-weight:var(--weight-medium); border-radius:var(--r-pill); border:1px solid var(--line); background:transparent; color:var(--ink-3); cursor:pointer; transition:all var(--duration-hover) var(--ease-hover);">
                ${t.label}${t.id !== 'all' ? ` <span class="filter-count" data-count="${t.id}">(${counts[t.id] || 0})</span>` : ''}
              </button>
            `).join('')}
          </div>
        </div>

        <div id="plans-list" class="flex flex-col gap-3">
          ${renderPlanCards()}
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

  function countByStatus() {
    const counts = { pending: 0, executed: 0, cancelled: 0, discarded: 0 }
    plans.forEach((p) => {
      if (counts[p.status] !== undefined) counts[p.status]++
    })
    return counts
  }

  function renderPlanCards() {
    const filtered = currentFilter === 'all'
      ? plans
      : plans.filter((p) => p.status === currentFilter)

    if (filtered.length === 0) {
      const emptyText = plans.length === 0
        ? '暂无计划，请先在「下单计划」页面提交计划'
        : '该状态下暂无计划'
      return `
        <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
          <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
          <p style="font-size:var(--text-body); color:var(--ink-3);">${escHtml(emptyText)}</p>
        </div>
      `
    }

    // 按创建时间倒序（最新的在前）
    const sorted = [...filtered].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })

    return sorted.map((p) => planCardHTML(p)).join('')
  }

  function planCardHTML(p) {
    const sd = STATUS_DEFS[p.status] || STATUS_DEFS.pending
    const created = formatDate(p.createdAt)
    const operated = p.operatedAt ? formatDate(p.operatedAt) : ''
    const motiveLabel = MOTIVE_LABELS[p.motiveType] || p.motiveType || '--'
    const emotionLabel = EMOTION_LABELS[p.emotionState] || p.emotionState || '--'

    const currentPrice = parseFloat(p.currentPrice) || 0
    const takeProfit = parseFloat(p.takeProfit) || 0
    const stopLoss = parseFloat(p.stopLoss) || 0
    const maxLoss = parseFloat(p.maxLoss) || 0
    const expGain = parseFloat(p.expectedGain) || 0
    const planShares = parseInt(p.planShares) || 0
    const planAmount = parseFloat(p.planAmount) || 0
    const rr = maxLoss > 0 && expGain > 0 ? (expGain / maxLoss).toFixed(1) : '--'

    const showActions = p.status === 'pending'

    return `
      <div class="plan-card" data-plan-id="${escHtml(p.id)}" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); overflow:hidden;">
        <!-- 卡片头部 -->
        <div class="flex items-center justify-between px-4 sm:px-5 py-3" style="border-bottom:1px solid var(--line);">
          <div class="flex items-center gap-3 min-w-0 flex-wrap">
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(p.stockName || '未命名')}</span>
            <span style="font-size:var(--text-mono); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(p.stockCode || '')}</span>
            <span style="font-size:var(--text-caption); color:var(--ink-3);">${escHtml(created)}</span>
          </div>
          <span style="font-size:var(--text-caption); font-weight:var(--weight-medium); padding:2px 10px; border-radius:var(--r-pill); background:${sd.bg}; color:${sd.color}; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;">
            <i data-lucide="${sd.icon}" style="width:12px; height:12px;"></i>
            ${escHtml(sd.label)}
          </span>
        </div>

        <!-- 关键指标 -->
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 px-3 sm:px-5 py-3" style="border-bottom:1px solid var(--line);">
          ${metricCell('买入价', p.currentPrice || '--')}
          ${metricCell('止盈', p.takeProfit || '--', takeProfit > 0 && currentPrice > 0 ? 'var(--price-up)' : 'var(--ink-2)')}
          ${metricCell('止损', p.stopLoss || '--', stopLoss > 0 && currentPrice > 0 ? 'var(--price-down)' : 'var(--ink-2)')}
          ${metricCell('计划金额', planAmount > 0 ? planAmount.toLocaleString('zh-CN') : '--')}
          ${metricCell('仓位(股)', planShares > 0 ? planShares.toLocaleString('zh-CN') : '--')}
          ${metricCell('风险收益比', rr === '--' ? '--' : '1:' + rr)}
        </div>

        <!-- 操作按钮 / 操作结果 -->
        ${showActions ? `
          <div class="flex items-center gap-2 px-4 sm:px-5 py-3 flex-wrap">
            <button class="exec-action-btn" data-action="executed" data-plan-id="${escHtml(p.id)}" style="font-size:var(--text-caption); font-weight:var(--weight-medium); padding:6px 14px; border-radius:var(--r-sm); border:none; background:var(--state-success); color:#fff; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i data-lucide="check" style="width:12px; height:12px;"></i>
              按计划操作
            </button>
            <button class="exec-action-btn" data-action="cancelled" data-plan-id="${escHtml(p.id)}" style="font-size:var(--text-caption); font-weight:var(--weight-medium); padding:6px 14px; border-radius:var(--r-sm); border:none; background:var(--state-info); color:#fff; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i data-lucide="x" style="width:12px; height:12px;"></i>
              取消
            </button>
            <button class="exec-action-btn" data-action="discarded" data-plan-id="${escHtml(p.id)}" style="font-size:var(--text-caption); font-weight:var(--weight-medium); padding:6px 14px; border-radius:var(--r-sm); border:1px solid var(--line); background:transparent; color:var(--ink-3); cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i data-lucide="archive" style="width:12px; height:12px;"></i>
              弃用
            </button>
            <button class="plan-toggle-detail" data-plan-id="${escHtml(p.id)}" style="font-size:var(--text-caption); color:var(--brand); background:none; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-left:auto;">
              <i data-lucide="chevron-down" class="detail-chevron" style="width:14px; height:14px; transition:transform 0.2s ease;"></i>
              详情
            </button>
          </div>
        ` : `
          <div class="flex items-center justify-between px-4 sm:px-5 py-3 flex-wrap gap-2">
            <span style="font-size:var(--text-caption); color:var(--ink-3);">
              ${operated ? '操作时间：' + escHtml(operated) : '未操作'}
            </span>
            <button class="plan-toggle-detail" data-plan-id="${escHtml(p.id)}" style="font-size:var(--text-caption); color:var(--brand); background:none; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <i data-lucide="chevron-down" class="detail-chevron" style="width:14px; height:14px; transition:transform 0.2s ease;"></i>
              详情
            </button>
          </div>
        `}

        <!-- 详情（可折叠） -->
        <div class="plan-detail" style="max-height:0; overflow:hidden; transition:max-height 0.3s ease;">
          <div class="px-4 sm:px-5 pb-4" style="border-top:1px solid var(--line); padding-top:var(--s-4);">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              ${detailItem('买入动机', motiveLabel)}
              ${detailItem('情绪状态', emotionLabel)}
              ${detailItem('波段模式', p.waveMode === '10-20' ? '10-20天波段' : p.waveMode === '20-60' ? '20-60天波段' : (p.waveMode || '--'))}
              ${detailItem('最大可接受亏损', p.maxLoss ? p.maxLoss + ' 元' : '--')}
            </div>
            ${p.buyLogic ? `<div class="mb-2"><span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">买入逻辑</span><p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(p.buyLogic)}</p></div>` : ''}
            ${p.sellLogic ? `<div class="mb-2"><span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">卖出逻辑</span><p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(p.sellLogic)}</p></div>` : ''}
            ${p.triggerDetail ? `<div class="mb-2"><span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">买入触发条件</span><p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(p.triggerDetail)}</p></div>` : ''}
            ${p.execNotes ? `<div class="mb-2"><span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">执行备注</span><p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(p.execNotes)}</p></div>` : ''}
            ${p.actionNote ? `<div class="mt-3 p-3" style="background:var(--bg); border-radius:var(--r-sm); border-left:3px solid ${sd.color};"><span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">操作备注</span><p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(p.actionNote)}</p></div>` : ''}
          </div>
        </div>
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
    // 筛选按钮
    root.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = btn.getAttribute('data-filter')
        updateFilterActive()
        const list = root.querySelector('#plans-list')
        if (list) {
          list.innerHTML = renderPlanCards()
          refreshIcons()
          bindCardEvents()
        }
      })
    })

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
    // 操作按钮
    root.querySelectorAll('.exec-action-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action')
        const id = btn.getAttribute('data-plan-id')
        handleAction(id, action)
      })
    })

    // 详情展开
    root.querySelectorAll('.plan-toggle-detail').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.plan-card')
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

  function handleAction(id, action) {
    const plan = plans.find((p) => p.id === id)
    if (!plan) return
    const def = STATUS_DEFS[action]
    if (!def) return

    plan.status = action
    plan.operatedAt = new Date().toISOString()

    const actionLabels = { executed: '按计划操作', cancelled: '取消', discarded: '弃用' }

    // 标记为已操作时，自动创建交易记录并同步持仓
    if (action === 'executed') {
      createTradeRecordFromPlan(plan)
    }

    savePlans()
    showToast('计划已标记为「' + actionLabels[action] + '」' + (action === 'executed' ? '，交易记录已自动生成' : ''))

    render()
  }

  function createTradeRecordFromPlan(plan) {
    const trades = lsGetJSON(STORAGE_KEYS.tradeRecords, []) || []
    const shares = plan.planShares || '--'
    const newTrade = {
      id: 't' + Date.now(),
      date: new Date().toISOString().slice(0, 10),
      name: plan.stockName || '',
      code: plan.stockCode || '',
      wave: plan.waveMode || '',
      status: '合规',
      statusColor: 'var(--state-success)',
      statusBg: 'var(--state-success-bg)',
      holdingStatus: '',
      buyLogic: plan.buyLogic || '—',
      planBuyPrice: plan.currentPrice || '--',
      actualBuyPrice: plan.currentPrice || '--',
      planExitPrice: plan.takeProfit || '--',
      actualExitPrice: '--',
      planPosition: shares,
      actualPosition: shares,
      planRisk: plan.maxLoss || '--',
      actualPnl: shares,
      pnlColor: 'var(--ink)',
      violation: '无违规。',
      violationBg: 'var(--state-success-bg)',
      violationColor: 'var(--state-success)',
      experience: '请补充本次经验',
      fromPlanId: plan.id
    }
    trades.unshift(newTrade)
    lsSetJSON(STORAGE_KEYS.tradeRecords, trades)

    // 同步持仓
    const qty = parseInt(shares, 10) || 0
    if (qty > 0 && plan.stockCode) {
      const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
      const existing = holdings.find((h) => h.code === plan.stockCode)
      if (existing) {
        existing.quantity = (parseInt(existing.quantity, 10) || 0) + qty
      } else {
        holdings.push({
          id: 'h_' + Date.now(),
          name: plan.stockName || '',
          code: plan.stockCode,
          buyPrice: plan.currentPrice || '--',
          currentPrice: plan.currentPrice || '--',
          quantity: qty,
          createdAt: new Date().toISOString()
        })
      }
      lsSetJSON(STORAGE_KEYS.holdings, holdings)
      notifyDataChange(DATA_EVENTS.HOLDINGS_CHANGED)
    }
    notifyDataChange(DATA_EVENTS.TRADE_RECORDS_CHANGED)
  }

  return {
    mount() { render() },
    unmount() {}
  }
}
