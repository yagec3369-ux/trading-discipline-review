// 持仓检查 page — 每只股票独立的每日7项检查 + 复盘 + 归档

import { refreshIcons } from '../utils/icons.js'
import { showToast, showSaveStatus, escHtml } from '../utils/ui.js'
import { lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'
import { on, off, notifyDataChange, DATA_EVENTS } from '../utils/events.js'

const DAILY_QUESTIONS = [
  '今日操作是否在计划内？',
  '是否严格执行了止损纪律？',
  '是否避免了追涨杀跌？',
  '仓位是否符合风控要求？',
  '情绪状态是否稳定？',
  '是否有未经计划的临时操作？',
  '是否完成了逻辑判断记录？'
]

function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function makeEmptyChecks() {
  return DAILY_QUESTIONS.map(() => ({ answer: null, reason: '' }))
}

function getOrCreateStock(holdings, id) {
  let stock = holdings.find((h) => h.id === id)
  if (!stock) return null
  if (!stock.checks) stock.checks = null
  if (!stock.reviewNotes) stock.reviewNotes = ''
  if (!stock.reviewHistory) stock.reviewHistory = []
  if (!stock.logicStatus) stock.logicStatus = null
  if (stock.archived === undefined) stock.archived = false
  if (stock.expanded === undefined) stock.expanded = true
  return stock
}

export function createPositionCheckPage(root) {
  let holdings = loadHoldings()

  function loadHoldings() {
    const saved = lsGetJSON(STORAGE_KEYS.holdings, null)
    if (saved && Array.isArray(saved)) {
      return saved.map((h) => ({
        ...h,
        checks: h.checks || null,
        reviewNotes: h.reviewNotes || '',
        reviewHistory: h.reviewHistory || [],
        logicStatus: h.logicStatus || null,
        archived: h.archived === true,
        expanded: h.expanded !== false
      }))
    }
    return []
  }

  function saveHoldings() {
    lsSetJSON(STORAGE_KEYS.holdings, holdings)
    notifyDataChange(DATA_EVENTS.HOLDINGS_CHANGED)
  }

  function calcPnl(buyPrice, currentPrice, quantity) {
    const bp = parseFloat(buyPrice) || 0
    const cp = parseFloat(currentPrice) || 0
    const qty = parseFloat(quantity) || 0
    const diff = (cp - bp) * qty
    const pct = bp > 0 ? ((cp - bp) / bp * 100) : 0
    return {
      pnl: diff.toFixed(2),
      pnlPct: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
      pnlColor: diff >= 0 ? 'var(--price-up)' : 'var(--price-down)'
    }
  }

  function render() {
    const activeHoldings = holdings.filter((h) => !h.archived)
    const archivedHoldings = holdings.filter((h) => h.archived)

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <i data-lucide="clipboard-check" style="width:20px; height:20px; color:var(--brand);"></i>
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">持仓检查</h2>
        </div>
        <button id="add-holding-btn" class="flex items-center gap-2 px-4 h-9 whitespace-nowrap" style="background:var(--brand); color:var(--brand-ink); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); border:none; cursor:pointer;">
          <i data-lucide="plus" style="width:16px; height:16px;"></i>
          新增持仓
        </button>
      </div>

      ${activeHoldings.length === 0 ? `
        <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
          <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
          <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无持仓</p>
          <p style="font-size:var(--text-caption); color:var(--ink-3);">点击「新增持仓」手动录入，或在「下单计划」页面执行买入后自动同步</p>
        </div>
      ` : `
        <div id="holdings-list" class="flex flex-col gap-4">
          ${activeHoldings.map((h) => stockCardHTML(h)).join('')}
        </div>
      `}

      ${archivedHoldings.length > 0 ? `
        <div class="mt-8">
          <div class="flex items-center gap-3 mb-4">
            <i data-lucide="archive" style="width:18px; height:18px; color:var(--ink-3);"></i>
            <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">已归档 (${archivedHoldings.length})</h3>
          </div>
          <div id="archived-list" class="flex flex-col gap-2">
            ${archivedHoldings.map((h) => archivedRowHTML(h)).join('')}
          </div>
        </div>
      ` : ''}
    `
    refreshIcons()
    bindEvents()
  }

  function stockCardHTML(h) {
    const today = todayStr()
    const todayCheck = h.checks && h.checks.date === today ? h.checks : null
    const historyList = (h.reviewHistory || []).slice(-10).reverse()
    const submitted = todayCheck && todayCheck.submitted
    const canSubmit = todayCheck && todayCheck.checks.every((c) => c.answer !== null)
    const expanded = h.expanded !== false

    const { pnl, pnlPct, pnlColor } = calcPnl(h.buyPrice, h.currentPrice, h.quantity)
    const qty = parseFloat(h.quantity) || 0
    const statusLabel = qty > 0 ? '持有中' : '已平仓'
    const statusColor = qty > 0 ? 'var(--state-info)' : 'var(--state-success)'
    const statusBg = qty > 0 ? 'var(--state-info-bg)' : 'var(--state-success-bg)'

    const score = todayCheck && todayCheck.checks ? todayCheck.checks.filter((c) => c.answer === true).length : 0
    const total = DAILY_QUESTIONS.length
    const scoreColor = score >= 6 ? 'var(--state-success)' : score >= 4 ? 'var(--state-warning)' : 'var(--state-error)'

    return `
      <div class="stock-card" data-id="${h.id}" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); overflow:hidden;">
        <div class="stock-card-header flex items-center justify-between px-4 sm:px-5 py-3" style="cursor:pointer; user-select:none; border-bottom:1px solid var(--line);">
          <div class="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
            <i class="expand-chevron" data-lucide="chevron-right" style="width:16px; height:16px; color:var(--ink-3); transition:transform 0.2s; transform:rotate(${expanded ? '90deg' : '0deg'}); flex-shrink:0;"></i>
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(h.name)}</span>
            <span style="font-size:var(--text-caption); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(h.code)}</span>
            <span class="inline-flex items-center px-2 py-0.5" style="font-size:11px; border-radius:var(--r-sm); background:${statusBg}; color:${statusColor}; font-weight:var(--weight-medium);">${statusLabel}</span>
            ${h.logicStatus === 'valid' ? '<span class="inline-flex items-center px-2 py-0.5" style="font-size:11px; border-radius:var(--r-sm); background:var(--state-success-bg); color:var(--state-success); font-weight:var(--weight-medium);">逻辑有效</span>' : h.logicStatus === 'invalid' ? '<span class="inline-flex items-center px-2 py-0.5" style="font-size:11px; border-radius:var(--r-sm); background:var(--state-error-bg); color:var(--state-error); font-weight:var(--weight-medium);">逻辑失效</span>' : ''}
            ${submitted ? `<span style="font-size:11px; padding:2px 8px; border-radius:var(--r-sm); background:var(--surface-2); color:var(--ink-3);">今日 ${score}/${total}</span>` : ''}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span style="font-size:var(--text-caption); color:${pnlColor}; font-weight:var(--weight-medium);">${pnl} (${pnlPct})</span>
            <button class="archive-stock-btn" data-id="${h.id}" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;" title="归档">
              <i data-lucide="archive" style="width:14px; height:14px;"></i>
            </button>
          </div>
        </div>

        <div class="stock-card-body" style="max-height:${expanded ? 'none' : '0px'}; overflow:hidden; transition:max-height 0.3s ease;">
          <div class="px-4 sm:px-5 py-4">
            <!-- 持仓数据 -->
            <div style="border-bottom:1px solid var(--line); padding-bottom:var(--s-3); margin-bottom:var(--s-3);">
              <div class="grid grid-cols-5 gap-3">
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">成本价</span>
                  <span style="font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono);">${h.buyPrice || '--'}</span>
                </div>
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">现价</span>
                  <span style="font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono);">${h.currentPrice || '--'}</span>
                </div>
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">盈亏</span>
                  <span style="font-size:var(--text-body); color:${pnlColor}; font-weight:var(--weight-semibold);">${pnl}</span>
                </div>
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">盈亏%</span>
                  <span style="font-size:var(--text-body); color:${pnlColor}; font-weight:var(--weight-semibold);">${pnlPct}</span>
                </div>
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">持仓数</span>
                  <span style="font-size:var(--text-body); color:var(--ink);">${h.quantity || 0}</span>
                </div>
              </div>
            </div>

            <!-- 今日纪律检查 -->
            <div class="mb-4">
              <div class="flex items-center justify-between mb-3">
                <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink); display:flex; align-items:center; gap:6px;">
                  <i data-lucide="clipboard-check" style="width:14px; height:14px; color:var(--brand);"></i>
                  今日纪律检查
                </span>
                ${submitted ? '<span style="font-size:var(--text-caption); color:var(--state-success); display:flex; align-items:center; gap:4px;"><i data-lucide="check-circle" style="width:12px; height:12px;"></i>已提交' : `<span style="font-size:var(--text-caption); color:${scoreColor};">${score}/${total}</span>`}
              </div>
              ${renderCheckList(h, todayCheck, submitted)}
            </div>

            <!-- 复盘总结 -->
            <div class="mb-4">
              <label style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink); display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                <i data-lucide="file-text" style="width:14px; height:14px; color:var(--brand);"></i>
                今日复盘总结${submitted ? '' : '（当日可修改）'}
              </label>
              <textarea class="review-notes-input" data-id="${h.id}" rows="2" placeholder="记录今日操作心得、情绪变化、改进方向..." style="width:100%; font-size:var(--text-body); padding:var(--s-2) var(--s-3); resize:vertical; border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg); color:var(--ink);">${escHtml(h.reviewNotes || '')}</textarea>
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div class="flex items-center gap-2">
                <button class="logic-valid-btn" data-id="${h.id}" style="background:${h.logicStatus === 'valid' ? 'var(--state-success)' : 'var(--surface-2)'}; color:${h.logicStatus === 'valid' ? 'white' : 'var(--ink-3)'}; font-weight:var(--weight-medium); border:none; border-radius:var(--r-sm); padding:var(--s-2) var(--s-4); cursor:pointer; display:flex; align-items:center; gap:4px;">
                  <i data-lucide="check" style="width:14px; height:14px;"></i>
                  逻辑有效
                </button>
                <button class="logic-invalid-btn" data-id="${h.id}" style="background:${h.logicStatus === 'invalid' ? 'var(--state-error)' : 'var(--surface-2)'}; color:${h.logicStatus === 'invalid' ? 'white' : 'var(--ink-3)'}; font-weight:var(--weight-medium); border:none; border-radius:var(--r-sm); padding:var(--s-2) var(--s-4); cursor:pointer; display:flex; align-items:center; gap:4px;">
                  <i data-lucide="x" style="width:14px; height:14px;"></i>
                  逻辑失效
                </button>
              </div>
              <button class="submit-checks-btn" data-id="${h.id}" ${!canSubmit ? 'disabled' : ''} style="background:${canSubmit ? 'var(--brand)' : 'var(--surface-2)'}; color:${canSubmit ? 'var(--brand-ink)' : 'var(--ink-3)'}; font-weight:var(--weight-medium); border:none; border-radius:var(--r-sm); padding:var(--s-2) var(--s-4); cursor:${canSubmit ? 'pointer' : 'not-allowed'}; display:flex; align-items:center; gap:4px;">
                <i data-lucide="send" style="width:14px; height:14px;"></i>
                ${submitted ? '已提交' : '提交检查'}
              </button>
            </div>

            <!-- 历史复盘记录 -->
            ${historyList.length > 0 ? `
              <div>
                <div class="flex items-center gap-2 mb-2">
                  <i data-lucide="history" style="width:13px; height:13px; color:var(--ink-3);"></i>
                  <span style="font-size:var(--text-caption); color:var(--ink-3);">历史复盘记录</span>
                </div>
                <div class="history-list" data-id="${h.id}" style="max-height:200px; overflow-y:auto; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm);">
                  ${historyList.map((rec, i) => {
                    const s = rec.checks ? rec.checks.filter((c) => c.answer === true).length : 0
                    const t = rec.checks ? rec.checks.length : 7
                    const sc = s >= 6 ? 'var(--state-success)' : s >= 4 ? 'var(--state-warning)' : 'var(--state-error)'
                    return `
                      <div class="history-item" data-history-idx="${i}" style="padding:var(--s-2) var(--s-3); ${i < historyList.length - 1 ? 'border-bottom:1px solid var(--line);' : ''} cursor:pointer; display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-size:var(--text-caption); color:var(--ink-2);">${escHtml(rec.date)}</span>
                        <span style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:${sc};">${s}/${t}</span>
                      </div>
                    `
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `
  }

  function renderCheckList(h, todayCheck, submitted) {
    const checks = todayCheck ? todayCheck.checks : (h.checks && h.checks.date === todayStr() ? h.checks.checks : makeEmptyChecks())
    const readonly = submitted

    return `
      <div class="qa-list" data-id="${h.id}">
        ${DAILY_QUESTIONS.map((q, i) => {
          const c = checks[i] || { answer: null, reason: '' }
          const yesActive = c.answer === true ? 'yes-active' : ''
          const noActive = c.answer === false ? 'no-active' : ''
          return `
            <div class="qa-item" data-qidx="${i}" data-id="${h.id}" style="${i < DAILY_QUESTIONS.length - 1 ? 'border-bottom:1px solid var(--line);' : ''} ${readonly ? 'qa-readonly' : ''}">
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${q}</span>
                <div class="flex items-center gap-2 shrink-0">
                  <button class="qa-pill yes-btn ${yesActive}" data-value="yes" data-qidx="${i}" data-id="${h.id}" ${readonly ? 'disabled' : ''}>是</button>
                  <button class="qa-pill no-btn ${noActive}" data-value="no" data-qidx="${i}" data-id="${h.id}" ${readonly ? 'disabled' : ''}>否</button>
                </div>
              </div>
              ${!readonly ? `
                <div class="qa-reason-container" data-qidx="${i}" data-id="${h.id}" style="max-height:${c.answer === false ? '200px' : '0px'}; overflow:hidden; transition:max-height 0.3s ease;">
                  <div style="padding:0 0 var(--s-2) 0;">
                    <textarea class="qa-reason-input" data-qidx="${i}" data-id="${h.id}" rows="1" placeholder="请说明原因..." style="width:100%; resize:vertical; border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg); color:var(--ink); font-size:var(--text-body); padding:var(--s-2);">${escHtml(c.reason || '')}</textarea>
                  </div>
                </div>
              ` : ''}
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function archivedRowHTML(h) {
    return `
      <div class="archived-row flex items-center justify-between px-4 py-2" style="background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm);">
        <div class="flex items-center gap-3">
          <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink);">${escHtml(h.name)}</span>
          <span style="font-size:var(--text-caption); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(h.code)}</span>
          <span style="font-size:var(--text-caption); color:var(--ink-3);">持仓 ${h.quantity || 0} 股</span>
        </div>
        <button class="unarchive-stock-btn" data-id="${h.id}" style="background:none; border:none; cursor:pointer; color:var(--brand); font-size:var(--text-caption); display:flex; align-items:center; gap:4px;">
          <i data-lucide="rotate-ccw" style="width:12px; height:12px;"></i>
          恢复
        </button>
      </div>
    `
  }

  function bindEvents() {
    const addBtn = root.querySelector('#add-holding-btn')
    if (addBtn) addBtn.addEventListener('click', () => openHoldingDialog())

    root.querySelectorAll('.stock-card-header').forEach((header) => {
      header.addEventListener('click', () => {
        const card = header.closest('.stock-card')
        if (!card) return
        const id = card.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        if (h) {
          h.expanded = h.expanded === false ? true : false
          saveHoldings()
          render()
        }
      })
    })

    root.querySelectorAll('.archive-stock-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        if (h && confirm(`确认归档 ${h.name}？归档后不会在主列表显示。`)) {
          h.archived = true
          h.archivedAt = new Date().toISOString()
          saveHoldings()
          render()
          showToast('已归档')
        }
      })
    })

    root.querySelectorAll('.unarchive-stock-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        if (h) {
          h.archived = false
          h.archivedAt = null
          saveHoldings()
          render()
          showToast('已恢复')
        }
      })
    })

    root.querySelectorAll('.qa-item').forEach((item) => {
      const id = item.getAttribute('data-id')
      const qidx = parseInt(item.getAttribute('data-qidx'), 10)
      const yesBtn = item.querySelector('.yes-btn')
      const noBtn = item.querySelector('.no-btn')

      if (yesBtn) {
        yesBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          updateCheckAnswer(id, qidx, true)
        })
      }
      if (noBtn) {
        noBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          updateCheckAnswer(id, qidx, false)
        })
      }
    })

    root.querySelectorAll('.review-notes-input').forEach((ta) => {
      ta.addEventListener('input', () => {
        const id = ta.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        if (h) {
          h.reviewNotes = ta.value
          autoSave()
        }
      })
    })

    root.querySelectorAll('.qa-reason-input').forEach((ta) => {
      ta.addEventListener('input', () => {
        const id = ta.getAttribute('data-id')
        const qidx = parseInt(ta.getAttribute('data-qidx'), 10)
        const h = holdings.find((item) => item.id === id)
        if (h) {
          ensureTodayCheck(h)
          h.checks.checks[qidx].reason = ta.value
          autoSave()
        }
      })
    })

    root.querySelectorAll('.logic-valid-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        if (h) {
          h.logicStatus = h.logicStatus === 'valid' ? null : 'valid'
          saveHoldings()
          render()
        }
      })
    })
    root.querySelectorAll('.logic-invalid-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        if (h) {
          h.logicStatus = h.logicStatus === 'invalid' ? null : 'invalid'
          saveHoldings()
          render()
        }
      })
    })

    root.querySelectorAll('.submit-checks-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        if (!h) return
        ensureTodayCheck(h)
        if (!h.checks.checks.every((c) => c.answer !== null)) {
          showToast('请完成所有检查项')
          return
        }
        if (h.checks.submitted) return
        h.checks.submitted = true
        h.checks.submittedAt = new Date().toISOString()
        if (!h.reviewHistory) h.reviewHistory = []
        h.reviewHistory.push({
          date: h.checks.date,
          checks: h.checks.checks.map((c) => ({ ...c })),
          notes: h.reviewNotes || '',
          submittedAt: h.checks.submittedAt
        })
        saveHoldings()
        showToast('检查已提交')
        render()
      })
    })

    root.querySelectorAll('.history-item').forEach((item) => {
      item.addEventListener('click', () => {
        const list = item.parentElement
        const id = list.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        const idx = parseInt(item.getAttribute('data-history-idx'), 10)
        if (h && h.reviewHistory && h.reviewHistory[idx]) {
          showHistoryDetail(h.reviewHistory[idx], h)
        }
      })
    })
  }

  function ensureTodayCheck(h) {
    const today = todayStr()
    if (!h.checks || h.checks.date !== today) {
      h.checks = {
        date: today,
        checks: makeEmptyChecks(),
        submitted: false,
        submittedAt: null
      }
    }
    if (!h.checks.checks || h.checks.checks.length !== DAILY_QUESTIONS.length) {
      h.checks.checks = makeEmptyChecks()
    }
  }

  function updateCheckAnswer(holdingId, qidx, answer) {
    const h = holdings.find((item) => item.id === holdingId)
    if (!h) return
    ensureTodayCheck(h)
    if (h.checks.submitted) return
    h.checks.checks[qidx].answer = answer
    saveHoldings()
    render()
  }

  function autoSave() {
    showSaveStatus()
    saveHoldings()
  }

  let holdingDialogEl = null
  let holdingOverlayEl = null
  function openHoldingDialog(editItem = null) {
    closeHoldingDialog()
    holdingOverlayEl = document.createElement('div')
    holdingOverlayEl.style.cssText = 'position:fixed; inset:0; z-index:99; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; padding:16px;'
    holdingOverlayEl.addEventListener('click', (e) => { if (e.target === holdingOverlayEl) closeHoldingDialog() })

    holdingDialogEl = document.createElement('div')
    holdingDialogEl.style.cssText = `background:var(--bg); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-float); padding:var(--s-5) var(--s-6); width:min(480px, 100%); max-height:90vh; overflow-y:auto;`
    holdingDialogEl.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">${editItem ? '编辑持仓' : '新增持仓'}</h3>
        <button id="close-holding-dialog" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
          <i data-lucide="x" style="width:16px; height:16px;"></i>
        </button>
      </div>
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">股票名称 *</label>
            <input type="text" id="holding-name" class="field-input" style="width:100%;" placeholder="例如：兴森科技" value="${editItem ? escHtml(editItem.name) : ''}">
          </div>
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">股票代码 *</label>
            <input type="text" id="holding-code" class="field-input" style="width:100%;" placeholder="例如：002436" value="${editItem ? escHtml(editItem.code) : ''}">
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">成本价 *</label>
            <input type="number" id="holding-buy-price" class="field-input" style="width:100%;" placeholder="198.50" step="0.01" value="${editItem ? editItem.buyPrice : ''}">
          </div>
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">现价 *</label>
            <input type="number" id="holding-current-price" class="field-input" style="width:100%;" placeholder="215.30" step="0.01" value="${editItem ? editItem.currentPrice : ''}">
          </div>
          <div>
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">持仓数 *</label>
            <input type="number" id="holding-quantity" class="field-input" style="width:100%;" placeholder="1000" min="0" value="${editItem ? editItem.quantity : ''}">
          </div>
        </div>
        <div class="flex items-center gap-2 justify-end pt-2">
          <button id="cancel-holding-dialog" class="btn-secondary">取消</button>
          <button id="confirm-holding-dialog" class="btn-primary">${editItem ? '保存' : '添加'}</button>
        </div>
      </div>
    `
    holdingOverlayEl.appendChild(holdingDialogEl)
    document.body.appendChild(holdingOverlayEl)
    refreshIcons()

    holdingDialogEl.querySelector('#close-holding-dialog').addEventListener('click', closeHoldingDialog)
    holdingDialogEl.querySelector('#cancel-holding-dialog').addEventListener('click', closeHoldingDialog)
    holdingDialogEl.querySelector('#confirm-holding-dialog').addEventListener('click', () => {
      const name = holdingDialogEl.querySelector('#holding-name').value.trim()
      const code = holdingDialogEl.querySelector('#holding-code').value.trim()
      const buyPrice = holdingDialogEl.querySelector('#holding-buy-price').value.trim()
      const currentPrice = holdingDialogEl.querySelector('#holding-current-price').value.trim()
      const quantity = holdingDialogEl.querySelector('#holding-quantity').value.trim()

      if (!name || !code || !buyPrice || !currentPrice || !quantity) {
        showToast('请填写所有必填项')
        return
      }

      if (editItem) {
        const idx = holdings.findIndex((h) => h.id === editItem.id)
        if (idx !== -1) {
          holdings[idx] = {
            ...holdings[idx],
            name,
            code,
            buyPrice,
            currentPrice,
            quantity: parseInt(quantity, 10)
          }
        }
      } else {
        holdings.push({
          id: 'h_' + Date.now(),
          name,
          code,
          buyPrice,
          currentPrice,
          quantity: parseInt(quantity, 10),
          createdAt: new Date().toISOString(),
          checks: null,
          reviewNotes: '',
          reviewHistory: [],
          logicStatus: null,
          archived: false,
          expanded: true
        })
      }
      saveHoldings()
      closeHoldingDialog()
      render()
      showToast(editItem ? '持仓已更新' : '持仓已添加')
    })
  }

  function closeHoldingDialog() {
    if (holdingOverlayEl && holdingOverlayEl.parentNode) holdingOverlayEl.parentNode.removeChild(holdingOverlayEl)
    holdingOverlayEl = null
    holdingDialogEl = null
  }

  let historyDialogEl = null
  let historyOverlayEl = null

  function showHistoryDetail(rec, stock) {
    if (historyOverlayEl && historyOverlayEl.parentNode) historyOverlayEl.parentNode.removeChild(historyOverlayEl)
    historyOverlayEl = document.createElement('div')
    historyOverlayEl.style.cssText = 'position:fixed; inset:0; z-index:100; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; padding:16px;'
    historyOverlayEl.addEventListener('click', (e) => { if (e.target === historyOverlayEl) closeHistoryDialog() })

    const score = rec.checks ? rec.checks.filter((c) => c.answer === true).length : 0
    const total = rec.checks ? rec.checks.length : 7

    historyDialogEl = document.createElement('div')
    historyDialogEl.style.cssText = `background:var(--bg); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-float); padding:var(--s-5) var(--s-6); width:min(480px, 100%); max-height:90vh; overflow-y:auto;`
    historyDialogEl.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(stock.name)} · ${escHtml(rec.date)} 检查详情</h3>
        <button id="close-history-dialog" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
          <i data-lucide="x" style="width:16px; height:16px;"></i>
        </button>
      </div>
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-3) var(--s-4); margin-bottom:var(--s-3); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:var(--text-body); color:var(--ink-3);">纪律评分</span>
        <span style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:${score >= 6 ? 'var(--state-success)' : score >= 4 ? 'var(--state-warning)' : 'var(--state-error)'};">${score}/${total}</span>
      </div>
      ${rec.checks ? rec.checks.map((c, i) => `
        <div style="padding:var(--s-2) 0; ${i < rec.checks.length - 1 ? 'border-bottom:1px solid var(--line);' : ''}">
          <div class="flex items-center justify-between">
            <span style="font-size:var(--text-body); color:var(--ink-2);">${DAILY_QUESTIONS[i]}</span>
            <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:${c.answer === true ? 'var(--state-success)' : c.answer === false ? 'var(--state-error)' : 'var(--ink-3)'};">${c.answer === true ? '是' : c.answer === false ? '否' : '-'}</span>
          </div>
          ${c.reason ? `<p style="font-size:var(--text-caption); color:var(--ink-3); margin-top:2px; padding-left:var(--s-3);">${escHtml(c.reason)}</p>` : ''}
        </div>
      `).join('') : ''}
      ${rec.notes ? `
        <div style="margin-top:var(--s-3); padding:var(--s-3); background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm);">
          <span style="font-size:var(--text-caption); color:var(--ink-3); font-weight:var(--weight-medium); display:block; margin-bottom:4px;">复盘总结</span>
          <p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(rec.notes)}</p>
        </div>
      ` : ''}
    `
    historyOverlayEl.appendChild(historyDialogEl)
    document.body.appendChild(historyOverlayEl)
    refreshIcons()
    historyDialogEl.querySelector('#close-history-dialog').addEventListener('click', closeHistoryDialog)
  }

  function closeHistoryDialog() {
    if (historyOverlayEl && historyOverlayEl.parentNode) historyOverlayEl.parentNode.removeChild(historyOverlayEl)
    historyOverlayEl = null
    historyDialogEl = null
  }

  let _holdingsListener = null

  return {
    mount() {
      holdings = loadHoldings()
      _holdingsListener = () => {
        holdings = loadHoldings()
        render()
      }
      on(DATA_EVENTS.HOLDINGS_CHANGED, _holdingsListener)
      on(DATA_EVENTS.TRADE_RECORDS_CHANGED, _holdingsListener)
      render()
    },
    unmount() {
      closeHoldingDialog()
      closeHistoryDialog()
      if (_holdingsListener) {
        off(DATA_EVENTS.HOLDINGS_CHANGED, _holdingsListener)
        off(DATA_EVENTS.TRADE_RECORDS_CHANGED, _holdingsListener)
        _holdingsListener = null
      }
    }
  }
}
