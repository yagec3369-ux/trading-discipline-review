// 账户风控 page — account overview metrics, circuit-breaker checklist, recovery period.

import { refreshIcons } from '../utils/icons.js'
import { showSaveStatus, escHtml } from '../utils/ui.js'
import {
  lsGet,
  lsSet,
  lsGetJSON,
  STORAGE_KEYS
} from '../utils/storage.js'
import { on, off, emit, DATA_EVENTS } from '../utils/events.js'
import { getGistToken, setGistToken, syncToGist, pullFromGist } from '../utils/sync.js'

function getSyncToken() {
  return getGistToken()
}

// Field keys persisted under STORAGE_KEYS.riskCtrl prefix
const FIELD_KEYS = {
  totalFund: 'total_fund',
  stockValue: 'stock_value',
  monthlyPnl: 'monthly_pnl',
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
    trigger: '本月累计亏损 / 账户总金额 >= 3%',
    source: '本月累计盈亏 & 账户总金额'
  },
  {
    title: '发生浮亏补仓',
    trigger: '每日复盘中"是否严格执行止损"回答为"否"',
    source: '每日复盘页面 (Q&A 第2题)'
  },
  {
    title: '单只持仓超过20%',
    trigger: '任意单只股票持仓市值 / 账户总金额 > 20%',
    source: '交易记录页面 (个股持仓明细)'
  },
  {
    title: '无计划买入',
    trigger: '每日复盘中"是否有未经计划的临时操作"回答为"否"',
    source: '每日复盘页面 (Q&A 第6题)'
  },
  {
    title: '情绪化下单',
    trigger: '每日复盘中"情绪状态是否稳定"回答为"否"',
    source: '每日复盘页面 (Q&A 第5题)'
  }
]

// Map checklist item index -> daily review Q&A index.
// qaAnswers stores booleans: true = 是, false = 否, null = unanswered.
const QA_MAPPING = {
  // Item 3 (发生浮亏补仓): triggered when "是否严格执行了止损纪律" = 否 (false)
  2: { qaIndex: 1, triggerValue: false, triggeredText: '已触发：未严格执行止损', safeText: '正常：已严格执行止损' },
  // Item 5 (无计划买入): triggered when "是否有未经计划的临时操作" = 是 (true)
  4: { qaIndex: 5, triggerValue: true, triggeredText: '已触发：存在未经计划的临时操作', safeText: '正常：无未经计划的操作' },
  // Item 6 (情绪化下单): triggered when "情绪状态是否稳定" = 否 (false)
  5: { qaIndex: 4, triggerValue: false, triggeredText: '已触发：情绪状态不稳定', safeText: '正常：情绪状态稳定' }
}

export function createRiskControlPage(root) {
  // Local state mirror of inputs for recalculation
  const state = {
    totalFund: lsGet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.totalFund, '120000'),
    monthlyPnl: lsGet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.monthlyPnl, ''),
    compliantCount: lsGet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.compliantCount, '0'),
    recoveryStatus: lsGet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.recoveryStatus, 'active')
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

      <!-- Section 1: 账户概览 -->
      <section class="mb-8">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">账户概览</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${overviewCard('账户总金额', 'landmark', '元', 'rc-total-fund', true, state.totalFund)}
          ${overviewCard('股票市值', 'trending-up', '元', 'rc-stock-value', false)}
          ${overviewCard('可用资金', 'wallet', '元', 'rc-available', false)}
          ${overviewCard('当前总资产', 'coins', '元', 'rc-total-asset', false)}
          ${positionCard()}
          ${overviewCard('本月累计盈亏', 'arrow-down-up', '元', 'rc-monthly-pnl', true, state.monthlyPnl, '正数盈/负数亏')}
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5); margin-top:var(--s-4);">
          <h4 style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">资金转入/转出</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">转入金额（元）</label>
              <div class="flex items-center gap-2">
                <input type="number" id="rc-transfer-in" class="field-input" placeholder="0" min="0" step="0.01" style="flex:1;">
                <button id="btn-transfer-in" class="btn-primary">转入</button>
              </div>
            </div>
            <div>
              <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">转出金额（元）</label>
              <div class="flex items-center gap-2">
                <input type="number" id="rc-transfer-out" class="field-input" placeholder="0" min="0" step="0.01" style="flex:1;">
                <button id="btn-transfer-out" class="btn-secondary">转出</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: 熔断检查清单 -->
      <section class="mb-8">
        <div class="flex items-center gap-2 mb-4" style="color:var(--brand);">
          <i data-lucide="alert-triangle" style="width:20px; height:20px; flex-shrink:0;"></i>
          <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">熔断检查清单</h3>
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
          <div class="flex flex-col gap-1" id="checklist-container">
            ${CHECKLIST_DEFS.map((c, i) => checklistItemHTML(c, i)).join('')}
          </div>
        </div>
      </section>

      <!-- Section 3: 纪律恢复期 -->
      <section class="mb-8">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">纪律恢复期</h3>
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
                <input type="number" id="rc-compliant-count" min="0" max="20" value="${escHtml(state.compliantCount)}" style="width:52px; background:transparent; border:1px solid var(--state-info); border-radius:var(--r-xs); font-size:var(--text-caption); color:var(--state-info); font-weight:var(--weight-medium); text-align:center; outline:none; font-variant-numeric:tabular-nums;">
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

      <!-- Section 4: 风控提醒 -->
      <div style="background:var(--surface-2); border-left:3px solid var(--brand); border-radius:0 var(--r-md) var(--r-md) 0; padding:var(--s-4) var(--s-5);">
        <p style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--brand); margin-bottom:var(--s-2); letter-spacing:0.02em;">风控提醒</p>
        <p style="font-size:var(--text-body); line-height:var(--leading-body); color:var(--ink-2);">以上数据基于操作计划和每日复盘自动生成。请确保及时填写操作计划和每日复盘，以保证风控数据准确性。</p>
      </div>

      <!-- Section 5: 数据管理 -->
      <section class="mt-8">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">数据管理</h3>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5);">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium);">清除所有数据</p>
              <p style="font-size:var(--text-caption); color:var(--ink-3); margin-top:2px;">删除所有本地存储的交易记录、持仓、计划等数据，恢复初始状态</p>
            </div>
            <button id="clear-data-btn" class="shrink-0 px-4 h-9" style="background:var(--state-error); color:white; border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); border:none; cursor:pointer;">
              清除数据
            </button>
          </div>
        </div>

        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5); margin-top:var(--s-4);">
          <p style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium); margin-bottom:var(--s-3);">云同步 (GitHub Gist)</p>
          <p style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:var(--s-4);">配置 Token 后可多设备同步数据。需 <a href="https://github.com/settings/tokens/new" target="_blank" style="color:var(--brand);">创建 Token</a> 并勾选 gist 权限</p>
          <div class="flex items-center gap-2 mb-4">
            <input type="text" id="sync-token-input" placeholder="ghp_xxx..." value="${escHtml(getSyncToken())}" style="flex:1; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-2) var(--s-3); font-size:var(--text-body); font-family:var(--font-mono);">
            <button id="save-token-btn" class="shrink-0 px-4 h-9" style="background:var(--surface-2); color:var(--ink); border:1px solid var(--line); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-medium); cursor:pointer;">
              保存
            </button>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <button id="sync-upload-btn" class="flex items-center gap-2 px-4 h-9" style="background:var(--brand); color:var(--brand-ink); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); border:none; cursor:pointer;">
              <i data-lucide="upload-cloud" style="width:16px; height:16px;"></i>
              上传
            </button>
            <button id="sync-download-btn" class="flex items-center gap-2 px-4 h-9" style="background:var(--surface-2); color:var(--ink); border:1px solid var(--line); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-medium); cursor:pointer;">
              <i data-lucide="download-cloud" style="width:16px; height:16px;"></i>
              拉取
            </button>
            <span id="sync-status" style="font-size:var(--text-caption); color:var(--ink-3);"></span>
          </div>
        </div>
      </section>
    `
    refreshIcons()
    bindEvents()
    // Initial calc
    recalcDerived()
    updatePnlColor()
    updateRecovery()
    runAllChecks()
  }

  function overviewCard(label, icon, unit, id, editable, value, placeholder) {
    const valueAttr = value !== null && value !== undefined && value !== '' ? `value="${escHtml(value)}"` : ''
    const placeholderAttr = placeholder ? `placeholder="${escHtml(placeholder)}"` : ''
    const control = editable
      ? `<input type="number" id="${id}" class="rc-input" ${valueAttr} ${placeholderAttr}>`
      : `<span id="${id}" class="rc-display">--</span>`
    return `
      <div class="relative" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5);">
        <div class="absolute top-3 right-3" style="color:var(--ink-3);">
          <i data-lucide="${icon}" style="width:16px; height:16px;"></i>
        </div>
        <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">${escHtml(label)}</label>
        <div class="flex items-baseline gap-1">
          ${control}
          <span style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">${escHtml(unit)}</span>
        </div>
      </div>
    `
  }

  function positionCard() {
    return `
      <div class="relative" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5);">
        <div class="absolute top-3 right-3" style="color:var(--ink-3);">
          <i data-lucide="pie-chart" style="width:16px; height:16px;"></i>
        </div>
        <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">总仓位占比</label>
        <div class="flex items-baseline gap-1">
          <span id="rc-position-pct" class="rc-display">--</span>
          <span style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">%</span>
        </div>
        <div class="mt-3" style="height:6px; background:var(--surface-2); border-radius:var(--r-pill); overflow:hidden;">
          <div id="rc-position-bar" style="height:100%; width:0%; border-radius:var(--r-pill); background:var(--state-success); transition:width 0.3s ease, background-color 0.3s ease;"></div>
        </div>
      </div>
    `
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
    // Editable field bindings
    bindField('rc-total-fund', FIELD_KEYS.totalFund, () => {
      recalcDerived()
      runAllChecks()
      emit(DATA_EVENTS.RISK_CTRL_CHANGED)
    })
    bindField('rc-monthly-pnl', FIELD_KEYS.monthlyPnl, () => {
      updatePnlColor()
      runAllChecks()
    })

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
        state.compliantCount = compliantInput.value
        lsSet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.compliantCount, compliantInput.value)
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

    // Transfer in
    root.querySelector('#btn-transfer-in')?.addEventListener('click', () => {
      const input = root.querySelector('#rc-transfer-in')
      const amount = parseFloat(input.value) || 0
      if (amount <= 0) {
        showSaveStatus('请输入有效金额', 'error')
        return
      }
      const newTotal = (parseFloat(state.totalFund) || 0) + amount
      state.totalFund = String(newTotal)
      lsSet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.totalFund, String(newTotal))
      const inputEl = root.querySelector('#rc-total-fund')
      if (inputEl) inputEl.value = String(newTotal)
      input.value = ''
      recalcDerived()
      emit(DATA_EVENTS.RISK_CTRL_CHANGED)
      showSaveStatus('资金转入成功')
    })

    // Transfer out
    root.querySelector('#btn-transfer-out')?.addEventListener('click', () => {
      const input = root.querySelector('#rc-transfer-out')
      const amount = parseFloat(input.value) || 0
      if (amount <= 0) {
        showSaveStatus('请输入有效金额', 'error')
        return
      }
      const currentTotal = parseFloat(state.totalFund) || 0
      const stockValue = getHoldingsValue()
      const available = currentTotal - stockValue
      if (amount > available) {
        showSaveStatus(`转出金额不能超过可用资金（${available.toFixed(2)}元）`, 'error')
        return
      }
      const newTotal = currentTotal - amount
      state.totalFund = String(newTotal)
      lsSet(STORAGE_KEYS.riskCtrl + FIELD_KEYS.totalFund, String(newTotal))
      const inputEl = root.querySelector('#rc-total-fund')
      if (inputEl) inputEl.value = String(newTotal)
      input.value = ''
      recalcDerived()
      emit(DATA_EVENTS.RISK_CTRL_CHANGED)
      showSaveStatus('资金转出成功')
    })

    // Listen for holdings changes from other pages
    on(DATA_EVENTS.HOLDINGS_CHANGED, () => {
      recalcDerived()
    })

    // Clear all data
    root.querySelector('#clear-data-btn')?.addEventListener('click', () => {
      if (!confirm('确认清除所有数据？此操作不可撤销。')) return
      if (!confirm('再次确认：将删除所有交易记录、持仓、计划、逻辑库等数据。')) return
      localStorage.clear()
      location.reload()
    })

    // Sync: save token
    root.querySelector('#save-token-btn')?.addEventListener('click', () => {
      const input = root.querySelector('#sync-token-input')
      const token = input?.value?.trim() || ''
      if (!token) {
        showSaveStatus('请输入Token', 'error')
        return
      }
      setGistToken(token)
      showSaveStatus('Token已保存')
    })

    // Sync: upload
    root.querySelector('#sync-upload-btn')?.addEventListener('click', async () => {
      const statusEl = root.querySelector('#sync-status')
      statusEl.textContent = '上传中...'
      try {
        await syncToGist()
        statusEl.textContent = '上传成功 ✓'
        statusEl.style.color = 'var(--state-success)'
      } catch (err) {
        statusEl.textContent = '上传失败: ' + err.message
        statusEl.style.color = 'var(--state-error)'
      }
    })

    // Sync: download
    root.querySelector('#sync-download-btn')?.addEventListener('click', async () => {
      const statusEl = root.querySelector('#sync-status')
      statusEl.textContent = '拉取中...'
      try {
        await pullFromGist()
        statusEl.textContent = '拉取成功 ✓'
        statusEl.style.color = 'var(--state-success)'
        setTimeout(() => location.reload(), 500)
      } catch (err) {
        statusEl.textContent = '拉取失败: ' + err.message
        statusEl.style.color = 'var(--state-error)'
      }
    })
  }

  function bindField(id, key, onChange) {
    const el = root.querySelector('#' + id)
    if (!el) return
    el.addEventListener('input', () => {
      state[key] = el.value
      lsSet(STORAGE_KEYS.riskCtrl + key, el.value)
      showSaveStatus()
      if (onChange) onChange()
    })
  }

  function recalcDerived() {
    // 1. 账户总金额（锚定值，可编辑）
    const totalFund = parseFloat(state.totalFund) || 0
    // 2. 股票总市值（根据持仓情况统计：Σ 数量 × 现价）
    const stockValue = getHoldingsValue()
    // 3. 可用资金 = 账户总金额 - 股票总市值
    const available = totalFund - stockValue
    // 4. 当前总资产 = 股票市值 + 可用资金
    const totalAsset = stockValue + available
    // 5. 总仓位占比 = 股票市值 / 当前总资产
    const positionPct = totalAsset > 0 ? (stockValue / totalAsset * 100) : 0

    const stockValueEl = root.querySelector('#rc-stock-value')
    const availableEl = root.querySelector('#rc-available')
    const totalAssetEl = root.querySelector('#rc-total-asset')
    const positionPctEl = root.querySelector('#rc-position-pct')
    const positionBarEl = root.querySelector('#rc-position-bar')

    const fmt = (v) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
    const hasData = totalFund > 0 || stockValue > 0

    if (stockValueEl) {
      stockValueEl.textContent = stockValue > 0 ? fmt(stockValue) : '--'
    }
    if (availableEl) {
      availableEl.textContent = hasData ? fmt(available) : '--'
    }
    if (totalAssetEl) {
      totalAssetEl.textContent = hasData ? fmt(totalAsset) : '--'
    }

    if (positionPctEl && positionBarEl) {
      if (totalAsset > 0 && stockValue > 0) {
        const pctStr = positionPct.toFixed(1)
        positionPctEl.textContent = pctStr
        const barW = Math.min(positionPct, 100)
        positionBarEl.style.width = barW + '%'
        if (positionPct > 30) {
          positionPctEl.style.color = 'var(--state-error)'
          positionBarEl.style.background = 'var(--state-error)'
        } else if (positionPct > 20) {
          positionPctEl.style.color = 'var(--state-warning)'
          positionBarEl.style.background = 'var(--state-warning)'
        } else {
          positionPctEl.style.color = 'var(--ink)'
          positionBarEl.style.background = 'var(--state-success)'
        }
      } else {
        positionPctEl.textContent = '--'
        positionPctEl.style.color = 'var(--ink)'
        positionBarEl.style.width = '0%'
      }
    }
  }

  function updatePnlColor() {
    const pnlEl = root.querySelector('#rc-monthly-pnl')
    if (!pnlEl) return
    const v = parseFloat(pnlEl.value)
    if (pnlEl.value === '' || isNaN(v)) {
      pnlEl.style.color = 'var(--ink)'
    } else if (v > 0) {
      pnlEl.style.color = 'var(--price-up)'
    } else if (v < 0) {
      pnlEl.style.color = 'var(--price-down)'
    } else {
      pnlEl.style.color = 'var(--ink)'
    }
  }

  function updateRecovery() {
    const compliantInput = root.querySelector('#rc-compliant-count')
    const label = root.querySelector('#recovery-label')
    const bar = root.querySelector('#recovery-progress-bar')
    const pctEl = root.querySelector('#recovery-pct')
    if (!compliantInput) return
    let count = parseInt(compliantInput.value, 10) || 0
    if (count < 0) count = 0
    if (count > 20) count = 20
    compliantInput.value = count
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

  // 股票总市值 = Σ(持仓数量 × 现价)，仅统计持有中的股票
  function getHoldingsValue() {
    const holdings = lsGetJSON(STORAGE_KEYS.holdings, null) || []
    if (!Array.isArray(holdings) || holdings.length === 0) return 0
    return holdings.reduce((sum, h) => {
      const qty = parseFloat(h.quantity) || 0
      const price = parseFloat(h.currentPrice) || 0
      return sum + qty * price
    }, 0)
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
    const totalFund = parseFloat(state.totalFund) || 0
    const monthlyPnl = parseFloat(state.monthlyPnl) || 0
    const trades = getTradeRecords()
    const states = ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']

    // Item 1: 连续3笔止损 — detect from trade records
    const completedTrades = trades.filter((t) => t.actualPnl && !t.actualPnl.includes('待结算') && t.actualPnl !== '--')
    if (completedTrades.length >= 3) {
      const recent3 = completedTrades.slice(0, 3)
      const allLoss = recent3.every((t) => /^-/.test(String(t.actualPnl).trim()))
      if (allLoss) {
        states[0] = 'triggered'
      } else {
        states[0] = 'safe'
      }
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
        setChecklistStatus(1, 'safe', '请先填写账户总金额')
      } else {
        setChecklistStatus(1, 'safe', '本月无亏损或未录入盈亏')
      }
    }

    // Items 3, 5, 6 — daily review Q&A driven (booleans: true=是, false=否, null=unanswered)
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

    // Item 4: 单只持仓超过20% — pending (requires per-stock position value)
    states[3] = 'pending'
    setChecklistStatus(3, 'pending', '需录入各股票仓位后自动检测')

    // Update circuit breaker banner
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
