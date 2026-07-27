// 持仓检查 page — daily Q&A review, position analysis, review notes, history.

import { refreshIcons } from '../utils/icons.js'
import { showSaveStatus, escHtml } from '../utils/ui.js'
import { lsGet, lsSet, lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'
import { notifyDataChange, DATA_EVENTS } from '../utils/events.js'

const QA_QUESTIONS = [
  '今天的交易是否在计划内？',
  '是否严格执行了止损纪律？',
  '是否避免了追涨杀跌行为？',
  '持仓比例是否控制在规定范围内？',
  '情绪状态是否稳定？',
  '是否有未经计划的临时操作？',
  '买入前是否已完成逻辑判断记录？'
]

const TRADE_RECORDS = []

const HISTORY = []

export function createPositionCheckPage(root) {
  let qaAnswers = [null, null, null, null, null, null, null] // null | true | false
  let qaReasons = QA_QUESTIONS.map(() => ({ tradeId: '', reason: '' }))
  let holdings = loadHoldings()

  function loadHoldings() {
    const saved = lsGetJSON(STORAGE_KEYS.holdings, null)
    if (saved && Array.isArray(saved)) return saved
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
    root.innerHTML = `
      <!-- Section 1: Today's check -->
      <section class="mb-8">
        <div class="flex items-center gap-3 mb-4">
          <i data-lucide="clipboard-check" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">今日持仓检查</h2>
        </div>
        <div id="qa-list" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4);">
          ${QA_QUESTIONS.map((q, i) => `
            <div class="qa-item" data-index="${i}" style="${i < QA_QUESTIONS.length - 1 ? 'border-bottom:1px solid var(--line);' : ''}">
              <div class="flex items-center justify-between gap-4 py-3">
                <span style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${q}</span>
                <div class="flex items-center gap-2 shrink-0">
                  <button class="qa-pill inactive yes-btn" data-value="yes" data-index="${i}">是</button>
                  <button class="qa-pill inactive no-btn" data-value="no" data-index="${i}">否</button>
                </div>
              </div>
              <div class="qa-reason-container" data-index="${i}" style="max-height:0; overflow:hidden; transition:max-height 0.3s ease;">
                <div style="padding:0 0 var(--s-3) 0;" class="pl-0 sm:pl-12">
                  <div style="margin-bottom:var(--s-2);">
                    <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">关联操作记录</label>
                    <select id="qa-trade-${i}" class="field-select" style="width:100%;">
                      <option value="">请选择操作记录</option>
                    </select>
                  </div>
                  <textarea id="qa-reason-${i}" rows="2" placeholder="请说明原因..." class="field-input" style="width:100%; resize:vertical; line-height:var(--leading-body);"></textarea>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="flex items-center justify-between mt-4 px-2">
          <div class="flex items-center gap-2">
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);">纪律评分:</span>
            <span id="discipline-score" class="status-pill" style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); background:var(--surface-2); color:var(--ink-3);">0/7</span>
          </div>
          <span id="score-label" style="font-size:var(--text-caption); color:var(--ink-3);">请完成检查</span>
        </div>
      </section>

      <!-- Section 2: Position analysis -->
      <section class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <i data-lucide="bar-chart-2" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
            <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">持仓分析</h2>
          </div>
          <button id="add-holding-btn" class="flex items-center gap-2 px-4 h-9 whitespace-nowrap" style="background:var(--brand); color:var(--brand-ink); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); transition:background var(--duration-hover) var(--ease-hover); border:none; cursor:pointer;">
            <i data-lucide="plus" style="width:16px; height:16px;"></i>
            新增持仓
          </button>
        </div>
        <div id="stock-cards" class="flex flex-col gap-4">
          ${holdings.length === 0 ? `
            <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
              <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
              <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无持仓数据</p>
              <p style="font-size:var(--text-caption); color:var(--ink-3);">点击上方「新增持仓」手动录入，或在「交易记录」中录入成交后自动同步</p>
            </div>
          ` : holdings.map((h) => holdingCardHTML(h)).join('')}
        </div>
      </section>

      <!-- Section 3: Review notes -->
      <section class="mb-8">
        <div class="flex items-center gap-3 mb-4">
          <i data-lucide="file-text" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">复盘总结</h2>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
          <label for="review-notes" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">今日复盘笔记</label>
          <textarea id="review-notes" rows="6" placeholder="记录今天的交易心得、情绪变化、改进方向..." class="field-input" style="width:100%; font-size:var(--text-body); padding:var(--s-3) var(--s-4); resize:vertical; line-height:var(--leading-body);"></textarea>
        </div>
      </section>

      <!-- Section 4: History -->
      <section class="mb-8">
        <div class="flex items-center gap-3 mb-4">
          <i data-lucide="history" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">历史复盘</h2>
        </div>
        <div id="history-list" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:${HISTORY.length === 0 ? 'var(--s-7) var(--s-5)' : 'var(--s-2) 0'}; text-align:${HISTORY.length === 0 ? 'center' : 'left'};">
          ${HISTORY.length === 0 ? `
            <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
            <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无历史复盘</p>
            <p style="font-size:var(--text-caption); color:var(--ink-3);">完成今日检查后将自动归档</p>
          ` : HISTORY.map((h, i) => `
            <div class="flex items-center justify-between px-5 py-3" style="${i < HISTORY.length - 1 ? 'border-bottom:1px solid var(--line);' : ''}">
              <span style="font-size:var(--text-body); color:var(--ink-2);">${h.date}</span>
              <div class="flex items-center gap-3">
                <span style="font-size:var(--text-caption); color:var(--ink-3);">${h.label}</span>
                <span class="status-pill" style="background:${h.bg}; color:${h.color};">${h.score}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `
    lsSetJSON(STORAGE_KEYS.holdings, holdings)
    refreshIcons()
    bindEvents()
    loadSaved()
    updateScore()
  }

  function holdingCardHTML(h) {
    const { pnl, pnlPct, pnlColor } = calcPnl(h.buyPrice, h.currentPrice, h.quantity)
    const qtyBadge = parseFloat(h.quantity) > 0
      ? `<span style="font-size:var(--text-caption); color:var(--ink-3); background:var(--surface-2); border-radius:var(--r-pill); padding:2px 8px; white-space:nowrap;">持有 ${h.quantity} 股</span>`
      : ''
    const status = parseFloat(h.quantity) > 0 ? '持有中' : '已平仓'
    const statusBg = parseFloat(h.quantity) > 0 ? 'var(--state-info-bg)' : 'var(--state-success-bg)'
    const statusColor = parseFloat(h.quantity) > 0 ? 'var(--state-info)' : 'var(--state-success)'
    return `
      <div class="stock-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); overflow:hidden;">
        <div class="flex items-center justify-between px-4 sm:px-5 py-3" style="border-bottom:1px solid var(--line);">
          <div class="flex items-center gap-3 min-w-0">
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);" class="truncate">${escHtml(h.name)}</span>
            <span style="font-size:var(--text-mono); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(h.code)}</span>
            ${qtyBadge}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="status-pill" style="background:${statusBg}; color:${statusColor}; font-size:var(--text-caption);">${status}</span>
            <button class="edit-holding-btn" data-id="${h.id}" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px; display:flex;" title="编辑">
              <i data-lucide="edit-3" style="width:14px; height:14px;"></i>
            </button>
            <button class="delete-holding-btn" data-id="${h.id}" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px; display:flex;" title="删除">
              <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-5 gap-1 sm:gap-0 px-2 sm:px-5 py-3" style="border-bottom:1px solid var(--line);">
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">成本价</div>
            <div style="font-size:var(--text-mono); font-family:var(--font-mono); color:var(--ink-2);">${h.buyPrice || '--'}</div>
          </div>
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">现价</div>
            <div style="font-size:var(--text-mono); font-family:var(--font-mono); color:var(--ink-2);">${h.currentPrice || '--'}</div>
          </div>
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">盈亏</div>
            <div style="font-size:var(--text-mono); font-family:var(--font-mono); color:${pnlColor}; font-weight:var(--weight-medium);">${pnl}</div>
          </div>
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">盈亏比例</div>
            <div style="font-size:var(--text-mono); font-family:var(--font-mono); color:${pnlColor}; font-weight:var(--weight-medium);">${pnlPct}</div>
          </div>
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">持仓数</div>
            <div style="font-size:var(--text-mono); color:var(--ink-2);">${h.quantity || 0}</div>
          </div>
        </div>
      </div>
    `
  }

  function setPillState(index, value) {
    const qaItem = root.querySelector(`.qa-item[data-index="${index}"]`)
    if (!qaItem) return
    const yesBtn = qaItem.querySelector('.yes-btn')
    const noBtn = qaItem.querySelector('.no-btn')
    yesBtn.className = 'qa-pill inactive yes-btn'
    noBtn.className = 'qa-pill inactive no-btn'
    yesBtn.setAttribute('data-index', index)
    noBtn.setAttribute('data-index', index)
    if (value === true) yesBtn.className = 'qa-pill yes-active yes-btn'
    else if (value === false) noBtn.className = 'qa-pill no-active no-btn'
  }

  function setReasonContainer(index, show) {
    const container = root.querySelector(`.qa-reason-container[data-index="${index}"]`)
    if (!container) return
    if (show) {
      container.style.maxHeight = '200px'
      const ta = root.querySelector(`#qa-reason-${index}`)
      if (ta) setTimeout(() => ta.focus(), 100)
    } else {
      container.style.maxHeight = '0px'
    }
  }

  function updateScore() {
    let score = 0
    qaAnswers.forEach((v) => { if (v === true) score++ })
    const scoreEl = root.querySelector('#discipline-score')
    const labelEl = root.querySelector('#score-label')
    const totalAnswered = qaAnswers.filter((v) => v !== null).length
    scoreEl.textContent = score + '/7'
    if (totalAnswered === 0) {
      scoreEl.style.background = 'var(--surface-2)'
      scoreEl.style.color = 'var(--ink-3)'
      labelEl.textContent = '请完成检查'
      labelEl.style.color = 'var(--ink-3)'
    } else if (score >= 6) {
      scoreEl.style.background = 'var(--state-success-bg)'
      scoreEl.style.color = 'var(--state-success)'
      labelEl.textContent = '纪律优秀'
      labelEl.style.color = 'var(--state-success)'
    } else if (score >= 4) {
      scoreEl.style.background = 'var(--state-warning-bg)'
      scoreEl.style.color = 'var(--state-warning)'
      labelEl.textContent = '有待改善'
      labelEl.style.color = 'var(--state-warning)'
    } else {
      scoreEl.style.background = 'var(--state-error-bg)'
      scoreEl.style.color = 'var(--state-error)'
      labelEl.textContent = '需要警惕'
      labelEl.style.color = 'var(--state-error)'
    }
  }

  function autoSave() {
    showSaveStatus()
    const notesEl = root.querySelector('#review-notes')
    const data = {
      qaAnswers,
      qaReasons,
      notes: notesEl ? notesEl.value : '',
      _savedAt: new Date().toISOString()
    }
    lsSetJSON(STORAGE_KEYS.dailyReview, data)
  }

  function bindEvents() {
    // Add holding
    const addBtn = root.querySelector('#add-holding-btn')
    if (addBtn) {
      addBtn.addEventListener('click', () => openHoldingDialog())
    }

    // Edit holding
    root.querySelectorAll('.edit-holding-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        if (h) openHoldingDialog(h)
      })
    })

    // Delete holding
    root.querySelectorAll('.delete-holding-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const h = holdings.find((item) => item.id === id)
        if (h && confirm(`确认删除 ${h.name} / ${h.code} 的持仓记录？`)) {
          holdings = holdings.filter((item) => item.id !== id)
          saveHoldings()
          render()
        }
      })
    })

    // Q&A pills
    root.querySelectorAll('.qa-item').forEach((qaItem) => {
      const index = parseInt(qaItem.getAttribute('data-index'), 10)
      const yesBtn = qaItem.querySelector('.yes-btn')
      const noBtn = qaItem.querySelector('.no-btn')
      const reasonTextarea = qaItem.querySelector(`#qa-reason-${index}`)
      const tradeSelect = qaItem.querySelector(`#qa-trade-${index}`)

      if (reasonTextarea) {
        reasonTextarea.addEventListener('input', () => {
          qaReasons[index].reason = reasonTextarea.value
          autoSave()
        })
      }
      if (tradeSelect) {
        tradeSelect.addEventListener('change', () => {
          qaReasons[index].tradeId = tradeSelect.value
          autoSave()
        })
      }
      yesBtn.addEventListener('click', () => {
        qaAnswers[index] = qaAnswers[index] === true ? null : true
        setPillState(index, qaAnswers[index])
        setReasonContainer(index, false)
        updateScore()
        autoSave()
      })
      noBtn.addEventListener('click', () => {
        if (qaAnswers[index] === false) {
          qaAnswers[index] = null
          setPillState(index, null)
          setReasonContainer(index, false)
        } else {
          qaAnswers[index] = false
          setPillState(index, false)
          setReasonContainer(index, true)
        }
        updateScore()
        autoSave()
      })
    })

    // Review notes autosave
    const reviewNotes = root.querySelector('#review-notes')
    if (reviewNotes) {
      reviewNotes.addEventListener('input', autoSave)
      reviewNotes.addEventListener('change', autoSave)
    }

    // Price diff toggle
    root.querySelectorAll('.price-diff-toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const card = toggle.closest('.stock-card')
        if (!card) return
        const container = card.querySelector('.price-diff-container')
        const chevron = toggle.querySelector('.price-diff-chevron')
        const isOpen = container.style.maxHeight !== '0px' && container.style.maxHeight !== ''
        if (isOpen) {
          container.style.maxHeight = '0px'
          if (chevron) chevron.style.transform = 'rotate(0deg)'
        } else {
          container.style.maxHeight = container.scrollHeight + 'px'
          if (chevron) chevron.style.transform = 'rotate(90deg)'
        }
      })
    })
  }

  function loadSaved() {
    const saved = lsGetJSON(STORAGE_KEYS.dailyReview, null)
    if (!saved) return
    try {
      if (saved.qaAnswers && Array.isArray(saved.qaAnswers)) {
        saved.qaAnswers.forEach((v, i) => {
          if (i < qaAnswers.length) {
            qaAnswers[i] = v
            setPillState(i, v)
          }
        })
      }
      if (saved.qaReasons && Array.isArray(saved.qaReasons)) {
        saved.qaReasons.forEach((v, i) => {
          if (i < qaReasons.length) {
            if (typeof v === 'string') {
              qaReasons[i].reason = v
            } else {
              qaReasons[i].tradeId = v.tradeId || ''
              qaReasons[i].reason = v.reason || ''
            }
            const ta = root.querySelector(`#qa-reason-${i}`)
            if (ta && qaReasons[i].reason) ta.value = qaReasons[i].reason
            const ts = root.querySelector(`#qa-trade-${i}`)
            if (ts && qaReasons[i].tradeId) ts.value = qaReasons[i].tradeId
            if (qaAnswers[i] === false) setReasonContainer(i, true)
          }
        })
      }
      if (saved.notes) {
        const notesEl = root.querySelector('#review-notes')
        if (notesEl) notesEl.value = saved.notes
      }
    } catch (e) {}
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
          createdAt: new Date().toISOString()
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

  return {
    mount() { render() },
    unmount() { closeHoldingDialog() }
  }
}
