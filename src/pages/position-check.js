// 持仓检查 page — daily Q&A review, position analysis, review notes, history.

import { refreshIcons } from '../utils/icons.js'
import { showSaveStatus, escHtml } from '../utils/ui.js'
import { lsGet, lsSet, lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'

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

// 持仓数据 — 默认为空，由用户自行录入
const HOLDINGS = []

const HISTORY = []

export function createPositionCheckPage(root) {
  let qaAnswers = [null, null, null, null, null, null, null] // null | true | false
  let qaReasons = QA_QUESTIONS.map(() => ({ tradeId: '', reason: '' }))

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
                      <option value="">${TRADE_RECORDS.length === 0 ? '暂无可关联记录' : '请选择操作记录'}</option>
                      ${TRADE_RECORDS.map((r) => `<option value="${r.id}">${r.date} - ${r.name}</option>`).join('')}
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
        <div class="flex items-center gap-3 mb-4">
          <i data-lucide="bar-chart-2" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">持仓分析</h2>
        </div>
        <div id="stock-cards" class="flex flex-col gap-4">
          ${HOLDINGS.length === 0 ? `
            <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
              <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
              <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无持仓数据</p>
              <p style="font-size:var(--text-caption); color:var(--ink-3);">可在「下单计划」中提交计划，或在「交易记录」中录入成交后自动同步</p>
            </div>
          ` : HOLDINGS.map((h) => holdingCardHTML(h)).join('')}
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
    // Persist holdings for cross-page access (account risk control reads this)
    lsSetJSON(STORAGE_KEYS.holdings, HOLDINGS)
    refreshIcons()
    bindEvents()
    loadSaved()
    updateScore()
  }

  function holdingCardHTML(h) {
    const qtyBadge = h.quantity > 0
      ? `<span style="font-size:var(--text-caption); color:var(--ink-3); background:var(--surface-2); border-radius:var(--r-pill); padding:2px 8px; white-space:nowrap;">持有 ${h.quantity} 股</span>`
      : ''
    return `
      <div class="stock-card" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); overflow:hidden;">
        <div class="flex items-center justify-between px-4 sm:px-5 py-3" style="border-bottom:1px solid var(--line);">
          <div class="flex items-center gap-3 min-w-0">
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);" class="truncate">${h.name}</span>
            <span style="font-size:var(--text-mono); color:var(--ink-3); font-family:var(--font-mono);">${h.code}</span>
            ${qtyBadge}
          </div>
          <span class="status-pill" style="background:${h.statusBg}; color:${h.statusColor}; font-size:var(--text-caption);">${h.status}</span>
        </div>
        <div class="grid grid-cols-5 gap-1 sm:gap-0 px-2 sm:px-5 py-3" style="border-bottom:1px solid var(--line);">
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">买入价</div>
            <div style="font-size:var(--text-mono); font-family:var(--font-mono); color:var(--ink-2);">${h.buyPrice}</div>
          </div>
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">现价</div>
            <div style="font-size:var(--text-mono); font-family:var(--font-mono); color:var(--ink-2);">${h.currentPrice}</div>
          </div>
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">盈亏</div>
            <div style="font-size:var(--text-mono); font-family:var(--font-mono); color:${h.pnlColor}; font-weight:var(--weight-medium);">${h.pnl}</div>
          </div>
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">盈亏比例</div>
            <div style="font-size:var(--text-mono); font-family:var(--font-mono); color:${h.pnlColor}; font-weight:var(--weight-medium);">${h.pnlPct}</div>
          </div>
          <div class="text-center min-w-0">
            <div style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:2px;">持仓天数</div>
            <div style="font-size:var(--text-mono); color:var(--ink-2);">${h.days}</div>
          </div>
        </div>
        <button class="price-diff-toggle flex items-center gap-2 w-full px-4 sm:px-5 py-2" style="cursor:pointer; border:none; background:transparent; color:var(--brand); font-size:var(--text-caption); font-weight:var(--weight-medium); transition:background var(--duration-hover) var(--ease-hover); text-align:left;">
          <i data-lucide="chevron-right" class="price-diff-chevron" style="width:14px; height:14px; transition:transform 0.2s ease;"></i>
          每日持仓价差
        </button>
        <div class="price-diff-container" style="max-height:0; overflow:hidden; transition:max-height 0.3s ease;">
          <div style="padding:0 var(--s-4) var(--s-4) var(--s-4); sm:padding:0 var(--s-5) var(--s-4) var(--s-5);">
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:var(--text-mono); min-width:320px;">
                <thead>
                  <tr style="border-bottom:1px solid var(--line);">
                    <th style="padding:var(--s-2); text-align:left; font-weight:var(--weight-medium); color:var(--ink-3); font-size:var(--text-caption);">日期</th>
                    <th style="padding:var(--s-2); text-align:right; font-weight:var(--weight-medium); color:var(--ink-3); font-size:var(--text-caption);">收盘价</th>
                    <th style="padding:var(--s-2); text-align:right; font-weight:var(--weight-medium); color:var(--ink-3); font-size:var(--text-caption);">价差</th>
                    <th style="padding:var(--s-2); text-align:right; font-weight:var(--weight-medium); color:var(--ink-3); font-size:var(--text-caption);">价差比例</th>
                  </tr>
                </thead>
                <tbody>
                  ${h.history.map((row, idx) => `
                    <tr style="${idx < h.history.length - 1 ? 'border-bottom:1px solid var(--line);' : ''}">
                      <td style="padding:var(--s-2); color:var(--ink-2);">${row.date}</td>
                      <td style="padding:var(--s-2); text-align:right; color:var(--ink-2);">${row.close}</td>
                      <td style="padding:var(--s-2); text-align:right; color:${row.color};">${row.diff}</td>
                      <td style="padding:var(--s-2); text-align:right; color:${row.color};">${row.diffPct}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
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

  return {
    mount() { render() },
    unmount() {}
  }
}
