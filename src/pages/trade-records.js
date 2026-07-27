// 交易记录 page — trade entry cards with collapsible details + summary stats.

import { refreshIcons } from '../utils/icons.js'
import { showToast, escHtml } from '../utils/ui.js'
import { lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'

// 交易记录 — 默认为空，由用户自行录入
const INITIAL_TRADES = []

export function createTradeRecordsPage(root) {
  let trades = loadTrades()

  function loadTrades() {
    const saved = lsGetJSON(STORAGE_KEYS.tradeRecords, null)
    if (saved && Array.isArray(saved)) return saved
    return []
  }
  function saveTrades() {
    lsSetJSON(STORAGE_KEYS.tradeRecords, trades)
  }
  function updateHoldingsOnTrade(name, code, shares) {
    const holdings = lsGetJSON(STORAGE_KEYS.holdings, []) || []
    const qty = parseInt(shares, 10) || 0
    if (qty <= 0) return

    const existing = holdings.find((h) => h.code === code)
    if (existing) {
      existing.quantity = (parseInt(existing.quantity, 10) || 0) + qty
    } else {
      holdings.push({
        id: 'h_' + Date.now(),
        name,
        code,
        buyPrice: '--',
        currentPrice: '--',
        quantity: qty,
        createdAt: new Date().toISOString()
      })
    }
    lsSetJSON(STORAGE_KEYS.holdings, holdings)
  }

  function render() {
    const total = trades.length
    const compliant = trades.filter((t) => t.status === '合规').length
    const violating = trades.filter((t) => t.status === '违规').length
    const rate = total > 0 ? Math.round(compliant / total * 100) : 0

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">交易记录</h2>
        <button id="new-trade-btn" class="flex items-center gap-2 px-4 h-9 whitespace-nowrap" style="background:var(--brand); color:var(--brand-ink); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); transition:background var(--duration-hover) var(--ease-hover); border:none; cursor:pointer;">
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

      <div id="trade-cards" class="flex flex-col gap-6">
        ${trades.length === 0 ? `
          <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
            <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
            <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无交易记录</p>
            <p style="font-size:var(--text-caption); color:var(--ink-3);">点击右上方「新增记录」开始录入</p>
          </div>
        ` : trades.map((t, idx) => tradeCardHTML(t, idx)).join('')}
      </div>

      <div class="mt-8" style="background:var(--surface-2); border-left:3px solid var(--brand); border-radius:0 var(--r-md) var(--r-md) 0; padding:var(--s-4) var(--s-5);">
        <p style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--brand); margin-bottom:var(--s-2); letter-spacing:0.02em;">核验启发</p>
        <p style="font-size:var(--text-body); line-height:var(--leading-body); color:var(--ink-2);">评价顺序 -- 先看是否遵守规则，再看策略是否有效，最后才看盈亏金额。遵守规则但亏损=合格交易。违反规则但赚钱=不合格交易。你的违规记录中是否有重复出现的模式？</p>
      </div>
    `
    refreshIcons()
    bindEvents()
  }

  function tradeCardHTML(t, idx) {
    return `
      <div class="trade-card" data-trade-idx="${idx}" style="background:var(--bg); border:1px solid var(--line); border-radius:var(--r-md); box-shadow:var(--shadow-card);">
        <div class="flex items-center justify-between px-4 sm:px-6 py-4 gap-3" style="border-bottom:1px solid var(--line);">
          <div class="flex items-center gap-3 min-w-0 flex-wrap">
            <span style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">${escHtml(t.date)}</span>
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);" class="truncate">${escHtml(t.name)} / ${escHtml(t.code)}</span>
            <span class="hidden sm:inline" style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">${escHtml(t.wave)}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="inline-flex items-center px-2.5 py-0.5" style="font-size:var(--text-caption); font-weight:var(--weight-medium); color:${t.statusColor}; border-radius:var(--r-sm); background:${t.statusBg};">${escHtml(t.status)}</span>
            ${t.holdingStatus ? `<span class="inline-flex items-center px-2 py-0.5" style="font-size:var(--text-caption); font-weight:var(--weight-medium); color:${t.holdingStatusColor}; border-radius:var(--r-sm); background:${t.holdingStatusBg};">${escHtml(t.holdingStatus)}</span>` : ''}
            <button class="delete-trade-btn" data-trade-idx="${idx}" aria-label="删除" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px; display:flex;">
              <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 px-4 sm:px-6 py-5">
          <div class="flex flex-col gap-4">
            <div>
              <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">买入逻辑</span>
              <span style="font-size:var(--text-body); color:var(--ink); line-height:var(--leading-body);">${escHtml(t.buyLogic)}</span>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">计划买入价</span>
                <span style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium); font-variant-numeric:tabular-nums;">${escHtml(t.planBuyPrice)}</span>
              </div>
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">实际买入价</span>
                <span style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium); font-variant-numeric:tabular-nums;">${escHtml(t.actualBuyPrice)}</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">计划退出价</span>
                <span style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium); font-variant-numeric:tabular-nums;">${escHtml(t.planExitPrice)}</span>
              </div>
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">实际退出价</span>
                <span style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium); font-variant-numeric:tabular-nums;">${escHtml(t.actualExitPrice)}</span>
              </div>
            </div>
          </div>
          <div class="flex flex-col gap-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">计划仓位</span>
                <span style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium);">${escHtml(t.planPosition)}</span>
              </div>
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">实际仓位</span>
                <span style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium);">${escHtml(t.actualPosition)}</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">计划风险</span>
                <span style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium);">${escHtml(t.planRisk)}</span>
              </div>
              <div>
                <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">买入股数</span>
                <span style="font-size:var(--text-body-l); color:${t.pnlColor}; font-weight:var(--weight-semibold); font-variant-numeric:tabular-nums;">${escHtml(t.actualPnl)}</span>
              </div>
            </div>
          </div>
        </div>
        <div style="border-top:1px solid var(--line);">
          <button class="collapse-toggle flex items-center gap-2 w-full px-4 sm:px-6 py-3" data-target="trade-${idx}-detail" style="cursor:pointer; border:none; background:transparent; color:var(--brand); font-size:var(--text-caption); font-weight:var(--weight-medium); font-family:var(--font-primary); text-align:left;">
            <i data-lucide="chevron-right" class="collapse-chevron" style="width:14px; height:14px; transition:transform 280ms cubic-bezier(0.32,0.72,0,1);"></i>
            <span class="collapse-label">展开详情</span>
          </button>
          <div id="trade-${idx}-detail" class="hidden px-4 sm:px-6 pb-5">
            <div class="flex flex-col gap-4">
              <div>
                <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">违规记录</label>
                <div class="p-3" style="background:${t.violationBg}; border-radius:var(--r-sm); font-size:var(--text-body); color:${t.violationColor}; line-height:var(--leading-body);">${escHtml(t.violation)}</div>
              </div>
              <div>
                <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">本次经验</label>
                <div class="p-3" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm); font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(t.experience)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  function bindEvents() {
    // Collapse toggles
    root.querySelectorAll('.collapse-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target')
        const target = root.querySelector('#' + targetId)
        const icon = btn.querySelector('.collapse-chevron')
        const label = btn.querySelector('.collapse-label')
        const isOpen = !target.classList.contains('hidden')
        if (isOpen) {
          target.classList.add('hidden')
          if (icon) icon.style.transform = 'rotate(0deg)'
          if (label) label.textContent = '展开详情'
        } else {
          target.classList.remove('hidden')
          if (icon) icon.style.transform = 'rotate(90deg)'
          if (label) label.textContent = '收起详情'
        }
      })
    })

    // New trade button
    const newBtn = root.querySelector('#new-trade-btn')
    if (newBtn) {
      newBtn.addEventListener('click', () => openAddDialog())
    }

    // Delete trade
    root.querySelectorAll('.delete-trade-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const idx = parseInt(btn.getAttribute('data-trade-idx'), 10)
        const t = trades[idx]
        if (!t) return
        if (confirm(`确认删除 ${t.name} / ${t.code} 的交易记录？`)) {
          trades.splice(idx, 1)
          saveTrades()
          render()
          showToast('记录已删除')
        }
      })
    })
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
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">交易日期</label>
            <input type="date" id="new-date" class="field-input" style="width:100%;" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">波段模式</label>
            <select id="new-wave" class="field-select" style="width:100%;">
              <option value="波段10-20天">波段10-20天</option>
              <option value="波段20-60天">波段20-60天</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">状态</label>
            <select id="new-status" class="field-select" style="width:100%;">
              <option value="合规">合规</option>
              <option value="违规">违规</option>
            </select>
          </div>
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">买入股数</label>
            <input type="number" id="new-pnl" class="field-input" style="width:100%;" placeholder="例如：1000" min="1">
          </div>
        </div>
        <div>
          <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">买入逻辑</label>
          <textarea id="new-logic" rows="2" class="field-input" style="width:100%; resize:vertical;" placeholder="简要描述买入逻辑"></textarea>
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
      if (!name || !code) { showToast('请填写股票名称和代码'); return }
      const status = overlayEl.querySelector('#new-status').value
      const shares = overlayEl.querySelector('#new-pnl').value.trim() || '--'
      const newTrade = {
        id: 't' + Date.now(),
        date: overlayEl.querySelector('#new-date').value,
        name, code,
        wave: overlayEl.querySelector('#new-wave').value,
        status,
        statusColor: status === '违规' ? 'var(--state-error)' : 'var(--state-success)',
        statusBg: status === '违规' ? 'var(--state-error-bg)' : 'var(--state-success-bg)',
        holdingStatus: '',
        buyLogic: overlayEl.querySelector('#new-logic').value.trim() || '—',
        planBuyPrice: '--', actualBuyPrice: '--',
        planExitPrice: '--', actualExitPrice: '--',
        planPosition: '--', actualPosition: '--',
        planRisk: '--',
        actualPnl: shares,
        pnlColor: 'var(--ink)',
        violation: status === '违规' ? '请补充违规说明' : '无违规。',
        violationBg: status === '违规' ? 'var(--state-error-bg)' : 'var(--state-success-bg)',
        violationColor: status === '违规' ? 'var(--state-error)' : 'var(--state-success)',
        experience: '请补充本次经验'
      }
      trades.unshift(newTrade)
      saveTrades()
      updateHoldingsOnTrade(name, code, shares)
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

  return {
    mount() { render() },
    unmount() { closeAddDialog() }
  }
}
