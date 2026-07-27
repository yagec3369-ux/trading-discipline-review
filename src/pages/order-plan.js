import { refreshIcons } from '../utils/icons.js'
import { showToast, showSaveStatus, escHtml } from '../utils/ui.js'
import { lsGet, lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'
import { on, notifyDataChange, DATA_EVENTS } from '../utils/events.js'

const DAILY_QUESTIONS = [
  '今日操作是否在计划内？',
  '是否严格执行了止损纪律？',
  '是否避免了追涨杀跌？',
  '仓位是否符合风控要求？',
  '情绪状态是否稳定？',
  '是否有未经计划的临时操作？',
  '是否完成了逻辑判断记录？'
]

const R_UNIT = 1000

function getTotalFund() {
  const v = lsGet(STORAGE_KEYS.riskCtrl + 'total_fund', '120000')
  const n = parseFloat(v)
  return isNaN(n) || n <= 0 ? 120000 : n
}

function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function loadPlans() {
  const saved = lsGetJSON(STORAGE_KEYS.plans, null)
  if (saved && Array.isArray(saved)) return saved
  return []
}

function savePlans(plans) {
  lsSetJSON(STORAGE_KEYS.plans, plans)
}

function makeEmptyChecks() {
  return DAILY_QUESTIONS.map(() => ({ answer: null, reason: '' }))
}

export function createOrderPlanPage(root) {
  let plans = loadPlans()

  function render() {
    const activePlans = plans.filter((p) => !p.archived)
    const archivedPlans = plans.filter((p) => p.archived)

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">下单计划</h2>
        <button id="add-plan-btn" class="flex items-center gap-2 px-4 h-9 whitespace-nowrap" style="background:var(--brand); color:var(--brand-ink); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); border:none; cursor:pointer;">
          <i data-lucide="plus" style="width:16px; height:16px;"></i>
          新增计划
        </button>
      </div>

      ${activePlans.length === 0 ? `
        <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
          <i data-lucide="inbox" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
          <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无计划</p>
          <p style="font-size:var(--text-caption); color:var(--ink-3);">点击「新增计划」创建第一只股票的操作计划</p>
        </div>
      ` : `
        <div id="plans-list" class="flex flex-col gap-4">
          ${activePlans.map((p) => planCardHTML(p)).join('')}
        </div>
      `}

      ${archivedPlans.length > 0 ? `
        <div class="mt-8">
          <div class="flex items-center gap-3 mb-4">
            <i data-lucide="archive" style="width:18px; height:18px; color:var(--ink-3);"></i>
            <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">已归档 (${archivedPlans.length})</h3>
          </div>
          <div id="archived-list" class="flex flex-col gap-2">
            ${archivedPlans.map((p) => archivedRowHTML(p)).join('')}
          </div>
        </div>
      ` : ''}
    `
    refreshIcons()
    bindEvents()
  }

  function planCardHTML(p) {
    const today = todayStr()
    const todayCheck = p.checks && p.checks.date === today ? p.checks : null
    const historyList = (p.history || []).slice(-10).reverse()
    const canSubmit = todayCheck && todayCheck.checks.every((c) => c.answer !== null)
    const submitted = todayCheck && todayCheck.submitted
    const expanded = p.expanded !== false

    const opColor = p.operationType === 'sell' ? 'var(--state-success)' : p.operationType === 't0' ? 'var(--state-warning)' : 'var(--state-error)'
    const opBg = p.operationType === 'sell' ? 'var(--state-success-bg)' : p.operationType === 't0' ? 'var(--state-warning-bg)' : 'var(--state-error-bg)'
    const opLabel = p.operationType === 'sell' ? '卖出' : p.operationType === 't0' ? '做T' : '买入'

    const nrColor = p.maxLossNR > 0 && p.expectedGainNR > 0 && p.expectedGainNR >= p.maxLossNR * 2 ? 'var(--state-success)' : p.maxLossNR > 0 ? 'var(--state-warning)' : 'var(--ink-3)'

    return `
      <div class="plan-card" data-id="${p.id}" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); overflow:hidden;">
        <div class="plan-card-header flex items-center justify-between px-4 sm:px-5 py-3" style="cursor:pointer; user-select:none; border-bottom:1px solid var(--line);">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <i class="expand-chevron" data-lucide="chevron-right" style="width:16px; height:16px; color:var(--ink-3); transition:transform 0.2s; transform:rotate(${expanded ? '90deg' : '0deg'}); flex-shrink:0;"></i>
            <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(p.name)}</span>
            <span style="font-size:var(--text-caption); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(p.code)}</span>
            <span class="inline-flex items-center px-2 py-0.5" style="font-size:11px; border-radius:var(--r-sm); background:${opBg}; color:${opColor}; font-weight:var(--weight-medium);">${opLabel}</span>
            ${p.logicStatus === 'valid' ? '<span class="inline-flex items-center px-2 py-0.5" style="font-size:11px; border-radius:var(--r-sm); background:var(--state-success-bg); color:var(--state-success); font-weight:var(--weight-medium);">逻辑有效</span>' : p.logicStatus === 'invalid' ? '<span class="inline-flex items-center px-2 py-0.5" style="font-size:11px; border-radius:var(--r-sm); background:var(--state-error-bg); color:var(--state-error); font-weight:var(--weight-medium);">逻辑失效</span>' : ''}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span style="font-size:var(--text-caption); color:${nrColor}; font-weight:var(--weight-medium);">${p.expectedGainNR || 0}R / ${p.maxLossNR || 0}R</span>
            <button class="edit-plan-btn" data-id="${p.id}" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;" title="编辑基本信息">
              <i data-lucide="edit-3" style="width:14px; height:14px;"></i>
            </button>
            <button class="archive-plan-btn" data-id="${p.id}" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;" title="归档">
              <i data-lucide="archive" style="width:14px; height:14px;"></i>
            </button>
          </div>
        </div>

        <div class="plan-card-body" style="max-height:${expanded ? 'none' : '0px'}; overflow:hidden; transition:max-height 0.3s ease;">
          <div class="px-4 sm:px-5 py-4">
            <!-- Basic info row -->
            <div style="border-bottom:1px solid var(--line); padding-bottom:var(--s-3); margin-bottom:var(--s-3);">
              <div class="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">当日收盘价</span>
                  <span style="font-size:var(--text-body); color:var(--ink); font-family:var(--font-mono);">${p.dailyClose || '--'}</span>
                </div>
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">操作类型</span>
                  <span style="font-size:var(--text-body); color:${opColor}; font-weight:var(--weight-medium);">${opLabel}</span>
                </div>
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">状态</span>
                  <span style="font-size:var(--text-body); color:var(--ink);">${p.status === 'pending' ? '待执行' : p.status === 'executed' ? '已操作' : p.status === 'cancelled' ? '已取消' : p.status === 'discarded' ? '已弃用' : '--'}</span>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div style="background:${p.operationType === 'sell' ? 'var(--surface-2)' : 'transparent'}; border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-2) var(--s-3); ${p.operationType === 'sell' ? 'opacity:0.5;' : ''}">
                  <div style="font-size:var(--text-caption); color:var(--state-error); font-weight:var(--weight-semibold); margin-bottom:4px;">买入</div>
                  <div class="grid grid-cols-3 gap-2" style="font-size:var(--text-caption);">
                    <div><span style="color:var(--ink-3);">价</span> <span style="color:var(--ink); font-family:var(--font-mono);">${p.buyPrice || '--'}</span></div>
                    <div><span style="color:var(--ink-3);">量</span> <span style="color:var(--ink);">${p.buyShares || '--'}</span></div>
                    <div><span style="color:var(--ink-3);">额</span> <span style="color:var(--ink);">${p.buyAmount ? Number(p.buyAmount).toLocaleString() : '--'}</span></div>
                  </div>
                </div>
                <div style="background:${p.operationType === 'buy' ? 'var(--surface-2)' : 'transparent'}; border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-2) var(--s-3); ${p.operationType === 'buy' ? 'opacity:0.5;' : ''}">
                  <div style="font-size:var(--text-caption); color:var(--state-success); font-weight:var(--weight-semibold); margin-bottom:4px;">卖出</div>
                  <div class="grid grid-cols-3 gap-2" style="font-size:var(--text-caption);">
                    <div><span style="color:var(--ink-3);">价</span> <span style="color:var(--ink); font-family:var(--font-mono);">${p.sellPrice || '--'}</span></div>
                    <div><span style="color:var(--ink-3);">量</span> <span style="color:var(--ink);">${p.sellShares || '--'}</span></div>
                    <div><span style="color:var(--ink-3);">额</span> <span style="color:var(--ink);">${p.sellAmount ? Number(p.sellAmount).toLocaleString() : '--'}</span></div>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">预期收益</span>
                  <span style="font-size:var(--text-body); color:var(--state-error); font-weight:var(--weight-semibold);">${p.expectedGainNR || 0}R = ${(p.expectedGainNR || 0) * R_UNIT}元</span>
                </div>
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">最大亏损</span>
                  <span style="font-size:var(--text-body); color:var(--state-success); font-weight:var(--weight-semibold);">${p.maxLossNR || 0}R = ${(p.maxLossNR || 0) * R_UNIT}元</span>
                </div>
                <div>
                  <span style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">风险收益比</span>
                  <span style="font-size:var(--text-body); color:${nrColor}; font-weight:var(--weight-semibold);">${p.maxLossNR > 0 && p.expectedGainNR > 0 ? '1:' + (p.expectedGainNR / p.maxLossNR).toFixed(1) : '-'}</span>
                </div>
              </div>
            </div>

            <!-- Daily checks -->
            <div class="mb-4">
              <div class="flex items-center justify-between mb-3">
                <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink); display:flex; align-items:center; gap:6px;">
                  <i data-lucide="clipboard-check" style="width:14px; height:14px; color:var(--brand);"></i>
                  今日纪律检查
                </span>
                ${submitted ? '<span style="font-size:var(--text-caption); color:var(--state-success); display:flex; align-items:center; gap:4px;"><i data-lucide="check-circle" style="width:12px; height:12px;"></i>已提交</span>' : ''}
              </div>
              ${renderCheckList(p, todayCheck, submitted)}
            </div>

            <!-- Review notes -->
            <div class="mb-4">
              <label style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink); display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                <i data-lucide="file-text" style="width:14px; height:14px; color:var(--brand);"></i>
                今日复盘总结
              </label>
              <textarea class="review-notes-input" data-id="${p.id}" rows="3" placeholder="记录今日操作心得、情绪变化、改进方向..." style="width:100%; font-size:var(--text-body); padding:var(--s-2) var(--s-3); resize:vertical; border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg); color:var(--ink);">${escHtml(p.reviewNotes || '')}</textarea>
            </div>

            <!-- Submit / Logic buttons -->
            <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div class="flex items-center gap-2">
                <button class="logic-valid-btn" data-id="${p.id}" style="background:${p.logicStatus === 'valid' ? 'var(--state-success)' : 'var(--surface-2)'}; color:${p.logicStatus === 'valid' ? 'white' : 'var(--ink-3)'}; font-weight:var(--weight-medium); border:none; border-radius:var(--r-sm); padding:var(--s-2) var(--s-4); cursor:pointer; display:flex; align-items:center; gap:4px;">
                  <i data-lucide="check" style="width:14px; height:14px;"></i>
                  逻辑有效
                </button>
                <button class="logic-invalid-btn" data-id="${p.id}" style="background:${p.logicStatus === 'invalid' ? 'var(--state-error)' : 'var(--surface-2)'}; color:${p.logicStatus === 'invalid' ? 'white' : 'var(--ink-3)'}; font-weight:var(--weight-medium); border:none; border-radius:var(--r-sm); padding:var(--s-2) var(--s-4); cursor:pointer; display:flex; align-items:center; gap:4px;">
                  <i data-lucide="x" style="width:14px; height:14px;"></i>
                  逻辑失效
                </button>
              </div>
              <button class="submit-checks-btn" data-id="${p.id}" ${!canSubmit ? 'disabled' : ''} style="background:${canSubmit ? 'var(--brand)' : 'var(--surface-2)'}; color:${canSubmit ? 'var(--brand-ink)' : 'var(--ink-3)'}; font-weight:var(--weight-medium); border:none; border-radius:var(--r-sm); padding:var(--s-2) var(--s-4); cursor:${canSubmit ? 'pointer' : 'not-allowed'}; display:flex; align-items:center; gap:4px;">
                <i data-lucide="send" style="width:14px; height:14px;"></i>
                ${submitted ? '已提交' : '提交检查'}
              </button>
            </div>

            <!-- History -->
            ${historyList.length > 0 ? `
              <div>
                <div class="flex items-center gap-2 mb-2">
                  <i data-lucide="history" style="width:13px; height:13px; color:var(--ink-3);"></i>
                  <span style="font-size:var(--text-caption); color:var(--ink-3);">历史记录</span>
                </div>
                <div class="history-list" data-id="${p.id}" style="max-height:150px; overflow-y:auto; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm);">
                  ${historyList.map((h, i) => {
                    const score = h.checks ? h.checks.filter((c) => c.answer === true).length : 0
                    const total = h.checks ? h.checks.length : 7
                    const scoreColor = score >= 6 ? 'var(--state-success)' : score >= 4 ? 'var(--state-warning)' : 'var(--state-error)'
                    return `
                      <div class="history-item" data-history-idx="${i}" style="padding:var(--s-2) var(--s-3); ${i < historyList.length - 1 ? 'border-bottom:1px solid var(--line);' : ''} cursor:pointer; display:flex; align-items:center; justify-content:space-between;" onmouseenter="this.style.background='var(--surface)'" onmouseleave="this.style.background=''">
                        <span style="font-size:var(--text-caption); color:var(--ink-2);">${escHtml(h.date)}</span>
                        <span style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:${scoreColor};">${score}/${total}</span>
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

  function renderCheckList(p, todayCheck, submitted) {
    const checks = todayCheck ? todayCheck.checks : (p.checks && p.checks.date === todayStr() ? p.checks.checks : makeEmptyChecks())
    const readonly = submitted

    return `
      <div class="qa-list" data-id="${p.id}">
        ${DAILY_QUESTIONS.map((q, i) => {
          const c = checks[i] || { answer: null, reason: '' }
          const yesActive = c.answer === true ? 'yes-active' : ''
          const noActive = c.answer === false ? 'no-active' : ''
          const disabledCls = readonly ? 'qa-disabled' : ''
          return `
            <div class="qa-item ${disabledCls}" data-qidx="${i}" data-id="${p.id}" style="${i < DAILY_QUESTIONS.length - 1 ? 'border-bottom:1px solid var(--line);' : ''}">
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${q}</span>
                <div class="flex items-center gap-2 shrink-0">
                  <button class="qa-pill yes-btn ${yesActive} ${readonly ? 'qa-readonly' : ''}" data-value="yes" data-qidx="${i}" data-id="${p.id}" ${readonly ? 'disabled' : ''}>是</button>
                  <button class="qa-pill no-btn ${noActive} ${readonly ? 'qa-readonly' : ''}" data-value="no" data-qidx="${i}" data-id="${p.id}" ${readonly ? 'disabled' : ''}>否</button>
                </div>
              </div>
              ${!readonly ? `
                <div class="qa-reason-container" data-qidx="${i}" data-id="${p.id}" style="max-height:${c.answer === false ? '200px' : '0px'}; overflow:hidden; transition:max-height 0.3s ease;">
                  <div style="padding:0 0 var(--s-2) 0;">
                    <textarea class="qa-reason-input" data-qidx="${i}" data-id="${p.id}" rows="1" placeholder="请说明原因..." style="width:100%; resize:vertical; border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg); color:var(--ink); font-size:var(--text-body); padding:var(--s-2);">${escHtml(c.reason || '')}</textarea>
                  </div>
                </div>
              ` : ''}
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function archivedRowHTML(p) {
    return `
      <div class="archived-row flex items-center justify-between px-4 py-2" style="background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm);">
        <div class="flex items-center gap-3">
          <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink);">${escHtml(p.name)}</span>
          <span style="font-size:var(--text-caption); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(p.code)}</span>
          <span style="font-size:var(--text-caption); color:var(--ink-3);">归档于 ${p.archivedAt ? p.archivedAt.slice(0, 10) : '--'}</span>
        </div>
        <button class="unarchive-plan-btn" data-id="${p.id}" style="background:none; border:none; cursor:pointer; color:var(--brand); font-size:var(--text-caption); display:flex; align-items:center; gap:4px;">
          <i data-lucide="rotate-ccw" style="width:12px; height:12px;"></i>
          恢复
        </button>
      </div>
    `
  }

  function bindEvents() {
    // Add plan
    const addBtn = root.querySelector('#add-plan-btn')
    if (addBtn) addBtn.addEventListener('click', () => openPlanDialog())

    // Expand/collapse
    root.querySelectorAll('.plan-card-header').forEach((header) => {
      header.addEventListener('click', () => {
        const card = header.closest('.plan-card')
        if (!card) return
        const id = card.getAttribute('data-id')
        const p = plans.find((pl) => pl.id === id)
        if (p) {
          p.expanded = p.expanded === false ? true : false
          savePlans(plans)
          render()
        }
      })
    })

    // Edit basic info
    root.querySelectorAll('.edit-plan-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-id')
        const p = plans.find((pl) => pl.id === id)
        if (p) openPlanDialog(p)
      })
    })

    // Archive
    root.querySelectorAll('.archive-plan-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-id')
        const p = plans.find((pl) => pl.id === id)
        if (p && confirm(`确认归档 ${p.name}？归档后不会在主列表显示。`)) {
          p.archived = true
          p.archivedAt = new Date().toISOString()
          savePlans(plans)
          render()
          showToast('已归档')
        }
      })
    })

    // Unarchive
    root.querySelectorAll('.unarchive-plan-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const p = plans.find((pl) => pl.id === id)
        if (p) {
          p.archived = false
          p.archivedAt = null
          savePlans(plans)
          render()
          showToast('已恢复')
        }
      })
    })

    // Q&A pills
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

    // Review notes
    root.querySelectorAll('.review-notes-input').forEach((ta) => {
      ta.addEventListener('input', () => {
        const id = ta.getAttribute('data-id')
        const p = plans.find((pl) => pl.id === id)
        if (p) {
          p.reviewNotes = ta.value
          autoSave()
        }
      })
    })

    // Reason inputs
    root.querySelectorAll('.qa-reason-input').forEach((ta) => {
      ta.addEventListener('input', () => {
        const id = ta.getAttribute('data-id')
        const qidx = parseInt(ta.getAttribute('data-qidx'), 10)
        const p = plans.find((pl) => pl.id === id)
        if (p) {
          ensureTodayCheck(p)
          p.checks.checks[qidx].reason = ta.value
          autoSave()
        }
      })
    })

    // Logic valid/invalid
    root.querySelectorAll('.logic-valid-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const p = plans.find((pl) => pl.id === id)
        if (p) {
          p.logicStatus = p.logicStatus === 'valid' ? null : 'valid'
          savePlans(plans)
          render()
        }
      })
    })
    root.querySelectorAll('.logic-invalid-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const p = plans.find((pl) => pl.id === id)
        if (p) {
          p.logicStatus = p.logicStatus === 'invalid' ? null : 'invalid'
          savePlans(plans)
          render()
        }
      })
    })

    // Submit checks
    root.querySelectorAll('.submit-checks-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const p = plans.find((pl) => pl.id === id)
        if (!p) return
        ensureTodayCheck(p)
        if (!p.checks.checks.every((c) => c.answer !== null)) {
          showToast('请完成所有检查项')
          return
        }
        if (p.checks.submitted) return
        p.checks.submitted = true
        p.checks.submittedAt = new Date().toISOString()
        if (!p.history) p.history = []
        p.history.push({
          date: p.checks.date,
          checks: p.checks.checks.map((c) => ({ ...c })),
          notes: p.reviewNotes || '',
          submittedAt: p.checks.submittedAt
        })
        savePlans(plans)
        showToast('检查已提交')
        render()
      })
    })

    // History click
    root.querySelectorAll('.history-item').forEach((item) => {
      item.addEventListener('click', () => {
        const list = item.parentElement
        const id = list.getAttribute('data-id')
        const p = plans.find((pl) => pl.id === id)
        const idx = parseInt(item.getAttribute('data-history-idx'), 10)
        if (p && p.history && p.history[idx]) {
          showHistoryDetail(p.history[idx])
        }
      })
    })

    // Risk control changes
    on(DATA_EVENTS.RISK_CTRL_CHANGED, () => {
      // no need to rerender, data reads on demand
    })
  }

  function ensureTodayCheck(p) {
    const today = todayStr()
    if (!p.checks || p.checks.date !== today) {
      p.checks = {
        date: today,
        checks: makeEmptyChecks(),
        submitted: false,
        submittedAt: null
      }
    }
    if (!p.checks.checks || p.checks.checks.length !== DAILY_QUESTIONS.length) {
      p.checks.checks = makeEmptyChecks()
    }
  }

  function updateCheckAnswer(planId, qidx, answer) {
    const p = plans.find((pl) => pl.id === planId)
    if (!p) return
    ensureTodayCheck(p)
    if (p.checks.submitted) return
    p.checks.checks[qidx].answer = answer
    savePlans(plans)
    render()
  }

  function autoSave() {
    showSaveStatus()
    savePlans(plans)
  }

  let dialogEl = null
  let overlayEl = null

  function openPlanDialog(editItem = null) {
    closeDialog()
    overlayEl = document.createElement('div')
    overlayEl.style.cssText = 'position:fixed; inset:0; z-index:99; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; padding:16px;'
    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeDialog() })

    dialogEl = document.createElement('div')
    dialogEl.style.cssText = `background:var(--bg); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-float); padding:var(--s-5) var(--s-6); width:min(640px, 100%); max-height:92vh; overflow-y:auto;`
    dialogEl.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">${editItem ? '编辑计划' : '新增计划'}</h3>
        <button id="close-plan-dialog" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
          <i data-lucide="x" style="width:16px; height:16px;"></i>
        </button>
      </div>
      <div class="flex flex-col gap-4">
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-3) var(--s-4);">
          <div style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--ink-3); margin-bottom:var(--s-3); display:flex; align-items:center; gap:6px;">
            <i data-lucide="info" style="width:14px; height:14px;"></i>基本信息
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">股票名称 *</label>
              <input type="text" id="plan-name" class="field-input" style="width:100%;" placeholder="例如：兴森科技" value="${editItem ? escHtml(editItem.name) : ''}">
            </div>
            <div>
              <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">股票代码 *</label>
              <input type="text" id="plan-code" class="field-input" style="width:100%;" placeholder="例如：002436" value="${editItem ? escHtml(editItem.code) : ''}">
            </div>
            <div>
              <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">当日收盘价（元）</label>
              <input type="number" id="plan-daily-close" class="field-input" style="width:100%;" placeholder="47.09" step="0.01" value="${editItem ? (editItem.dailyClose || '') : ''}">
            </div>
          </div>
        </div>

        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-3) var(--s-4);">
          <div style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--ink-3); margin-bottom:var(--s-3); display:flex; align-items:center; gap:6px;">
            <i data-lucide="target" style="width:14px; height:14px;"></i>买卖计划
          </div>
          <div style="margin-bottom:var(--s-3);">
            <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">操作类型 *</label>
            <select id="plan-operation" class="field-select" style="width:100%;">
              <option value="buy" ${editItem && editItem.operationType === 'buy' ? 'selected' : ''}>买入</option>
              <option value="sell" ${editItem && editItem.operationType === 'sell' ? 'selected' : ''}>卖出</option>
              <option value="t0" ${editItem && editItem.operationType === 't0' ? 'selected' : ''}>做T</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div id="buy-section" style="border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-3); background:var(--bg);">
              <div style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--state-error); margin-bottom:var(--s-2); display:flex; align-items:center; gap:4px;">
                <i data-lucide="trending-up" style="width:12px; height:12px;"></i>买入
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">买入价</label>
                  <input type="number" id="plan-buy-price" class="field-input buy-field" style="width:100%;" placeholder="47.09" step="0.01" value="${editItem ? (editItem.buyPrice || '') : ''}">
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">股数</label>
                  <input type="number" id="plan-buy-shares" class="field-input buy-field" style="width:100%;" placeholder="1000" step="100" value="${editItem ? (editItem.buyShares || '') : ''}">
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">金额</label>
                  <input type="number" id="plan-buy-amount" class="field-input buy-field" style="width:100%; background:var(--surface-2);" placeholder="自动" step="0.01" readonly value="${editItem ? (editItem.buyAmount || '') : ''}">
                </div>
              </div>
            </div>
            <div id="sell-section" style="border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-3); background:var(--bg);">
              <div style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--state-success); margin-bottom:var(--s-2); display:flex; align-items:center; gap:4px;">
                <i data-lucide="trending-down" style="width:12px; height:12px;"></i>卖出
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">卖出价</label>
                  <input type="number" id="plan-sell-price" class="field-input sell-field" style="width:100%;" placeholder="50.00" step="0.01" value="${editItem ? (editItem.sellPrice || '') : ''}">
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">股数</label>
                  <input type="number" id="plan-sell-shares" class="field-input sell-field" style="width:100%;" placeholder="1000" step="100" value="${editItem ? (editItem.sellShares || '') : ''}">
                </div>
                <div>
                  <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:2px;">金额</label>
                  <input type="number" id="plan-sell-amount" class="field-input sell-field" style="width:100%; background:var(--surface-2);" placeholder="自动" step="0.01" readonly value="${editItem ? (editItem.sellAmount || '') : ''}">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-3) var(--s-4);">
          <div style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--ink-3); margin-bottom:var(--s-3); display:flex; align-items:center; gap:6px;">
            <i data-lucide="shield-alert" style="width:14px; height:14px;"></i>风险收益
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label style="font-size:var(--text-caption); color:var(--state-error); display:block; margin-bottom:4px;">预期收益（元）</label>
              <input type="number" id="plan-expected-nr" class="field-input" style="width:100%;" placeholder="2000" min="0" step="100" value="${editItem && editItem.expectedGainNR ? (editItem.expectedGainNR * R_UNIT) : ''}">
              <span style="font-size:var(--text-caption); color:var(--ink-3);">= <span id="expected-nr-value">0</span>R (<span id="expected-pct-value">0.0</span>%)</span>
            </div>
            <div>
              <label style="font-size:var(--text-caption); color:var(--state-success); display:block; margin-bottom:4px;">最大可接受亏损（元）</label>
              <input type="number" id="plan-maxloss-nr" class="field-input" style="width:100%;" placeholder="1000" min="0" step="100" value="${editItem && editItem.maxLossNR ? (editItem.maxLossNR * R_UNIT) : ''}">
              <span style="font-size:var(--text-caption); color:var(--ink-3);">= <span id="maxloss-nr-value">0</span>R (<span id="maxloss-pct-value">0.0</span>%)</span>
            </div>
            <div>
              <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">风险收益比</label>
              <div id="rr-display" style="font-size:var(--text-h3); font-weight:var(--weight-semibold); padding:var(--s-2) var(--s-3); background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm); text-align:center;">-</div>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 justify-end pt-2">
          <button id="cancel-plan-dialog" class="btn-secondary">取消</button>
          <button id="confirm-plan-dialog" class="btn-primary">${editItem ? '保存' : '添加'}</button>
        </div>
      </div>
    `
    overlayEl.appendChild(dialogEl)
    document.body.appendChild(overlayEl)
    refreshIcons()

    const nrExpInput = dialogEl.querySelector('#plan-expected-nr')
    const nrLossInput = dialogEl.querySelector('#plan-maxloss-nr')
    const rrDisplay = dialogEl.querySelector('#rr-display')
    const expVal = dialogEl.querySelector('#expected-nr-value')
    const lossVal = dialogEl.querySelector('#maxloss-nr-value')
    const expPctVal = dialogEl.querySelector('#expected-pct-value')
    const lossPctVal = dialogEl.querySelector('#maxloss-pct-value')
    const operationSelect = dialogEl.querySelector('#plan-operation')
    const buySection = dialogEl.querySelector('#buy-section')
    const sellSection = dialogEl.querySelector('#sell-section')
    const buyPriceInput = dialogEl.querySelector('#plan-buy-price')
    const buySharesInput = dialogEl.querySelector('#plan-buy-shares')
    const buyAmountInput = dialogEl.querySelector('#plan-buy-amount')
    const sellPriceInput = dialogEl.querySelector('#plan-sell-price')
    const sellSharesInput = dialogEl.querySelector('#plan-sell-shares')
    const sellAmountInput = dialogEl.querySelector('#plan-sell-amount')

    function getTotalAmount() {
      const op = operationSelect.value
      if (op === 'buy') {
        return parseFloat(buyAmountInput.value) || 0
      } else if (op === 'sell') {
        return parseFloat(sellAmountInput.value) || 0
      } else {
        return parseFloat(buyAmountInput.value) + parseFloat(sellAmountInput.value) || 0
      }
    }

    function calcAmount(priceInput, sharesInput, amountInput) {
      const price = parseFloat(priceInput.value) || 0
      const shares = parseFloat(sharesInput.value) || 0
      if (price > 0 && shares > 0) {
        amountInput.value = (price * shares).toFixed(2)
      }
      updateNrMetrics()
    }

    function updateBuyAmount() { calcAmount(buyPriceInput, buySharesInput, buyAmountInput) }
    function updateSellAmount() { calcAmount(sellPriceInput, sellSharesInput, sellAmountInput) }

    function updatePriceFields() {
      const op = operationSelect.value
      const buyFields = dialogEl.querySelectorAll('.buy-field')
      const sellFields = dialogEl.querySelectorAll('.sell-field')
      const buyInputs = [buyPriceInput, buySharesInput]
      const sellInputs = [sellPriceInput, sellSharesInput]

      if (op === 'buy') {
        buySection.style.opacity = '1'
        sellSection.style.opacity = '0.35'
        buyInputs.forEach((el) => { el.disabled = false; el.style.background = '' })
        sellInputs.forEach((el) => { el.disabled = true; el.style.background = 'var(--surface-2)' })
      } else if (op === 'sell') {
        buySection.style.opacity = '0.35'
        sellSection.style.opacity = '1'
        buyInputs.forEach((el) => { el.disabled = true; el.style.background = 'var(--surface-2)' })
        sellInputs.forEach((el) => { el.disabled = false; el.style.background = '' })
      } else {
        buySection.style.opacity = '1'
        sellSection.style.opacity = '1'
        buyInputs.forEach((el) => { el.disabled = false; el.style.background = '' })
        sellInputs.forEach((el) => { el.disabled = false; el.style.background = '' })
      }
      updateNrMetrics()
    }

    function updateNrMetrics() {
      const expAmount = parseFloat(nrExpInput.value) || 0
      const lossAmount = parseFloat(nrLossInput.value) || 0
      const totalAmount = getTotalAmount()
      const expNr = R_UNIT > 0 ? expAmount / R_UNIT : 0
      const lossNr = R_UNIT > 0 ? lossAmount / R_UNIT : 0

      expVal.textContent = expNr.toFixed(1)
      lossVal.textContent = lossNr.toFixed(1)
      expPctVal.textContent = totalAmount > 0 ? ((expAmount / totalAmount) * 100).toFixed(2) : '0.0'
      lossPctVal.textContent = totalAmount > 0 ? ((lossAmount / totalAmount) * 100).toFixed(2) : '0.0'

      if (lossNr > 0 && expNr > 0) {
        const ratio = expNr / lossNr
        rrDisplay.textContent = '1:' + ratio.toFixed(1)
        rrDisplay.style.color = ratio >= 2 ? 'var(--state-success)' : ratio >= 1 ? 'var(--state-warning)' : 'var(--state-error)'
      } else {
        rrDisplay.textContent = '-'
        rrDisplay.style.color = 'var(--ink-3)'
      }
    }

    operationSelect.addEventListener('change', updatePriceFields)
    buyPriceInput.addEventListener('input', updateBuyAmount)
    buySharesInput.addEventListener('input', updateBuyAmount)
    sellPriceInput.addEventListener('input', updateSellAmount)
    sellSharesInput.addEventListener('input', updateSellAmount)
    nrExpInput.addEventListener('input', updateNrMetrics)
    nrLossInput.addEventListener('input', updateNrMetrics)
    updatePriceFields()
    updateNrMetrics()

    dialogEl.querySelector('#close-plan-dialog').addEventListener('click', closeDialog)
    dialogEl.querySelector('#cancel-plan-dialog').addEventListener('click', closeDialog)
    dialogEl.querySelector('#confirm-plan-dialog').addEventListener('click', () => {
      const name = dialogEl.querySelector('#plan-name').value.trim()
      const code = dialogEl.querySelector('#plan-code').value.trim()
      const dailyClose = dialogEl.querySelector('#plan-daily-close').value.trim()
      const operationType = dialogEl.querySelector('#plan-operation').value
      const buyPrice = buyPriceInput.value.trim()
      const buyShares = buySharesInput.value.trim()
      const buyAmount = buyAmountInput.value.trim()
      const sellPrice = sellPriceInput.value.trim()
      const sellShares = sellSharesInput.value.trim()
      const sellAmount = sellAmountInput.value.trim()
      const expectedGainAmount = parseFloat(nrExpInput.value) || 0
      const maxLossAmount = parseFloat(nrLossInput.value) || 0
      const expectedGainNR = R_UNIT > 0 ? +(expectedGainAmount / R_UNIT).toFixed(2) : 0
      const maxLossNR = R_UNIT > 0 ? +(maxLossAmount / R_UNIT).toFixed(2) : 0

      if (!name || !code) { showToast('请填写股票名称和代码'); return }
      if (operationType === 'buy') {
        if (!buyPrice || !buyShares) { showToast('请填写买入价格和股数'); return }
      } else if (operationType === 'sell') {
        if (!sellPrice || !sellShares) { showToast('请填写卖出价格和股数'); return }
      } else {
        if (!buyPrice || !buyShares || !sellPrice || !sellShares) { showToast('做T请填写完整的买卖信息'); return }
      }

      const priceData = {
        buyPrice: parseFloat(buyPrice) || 0,
        buyShares: parseInt(buyShares) || 0,
        buyAmount: parseFloat(buyAmount) || 0,
        sellPrice: parseFloat(sellPrice) || 0,
        sellShares: parseInt(sellShares) || 0,
        sellAmount: parseFloat(sellAmount) || 0,
        dailyClose: parseFloat(dailyClose) || 0
      }

      if (editItem) {
        const idx = plans.findIndex((pl) => pl.id === editItem.id)
        if (idx !== -1) {
          plans[idx] = {
            ...plans[idx],
            name, code, operationType,
            ...priceData,
            expectedGainNR, maxLossNR
          }
        }
      } else {
        const newPlan = {
          id: 'plan_' + Date.now(),
          name, code, operationType,
          ...priceData,
          expectedGainNR, maxLossNR,
          status: 'pending',
          logicStatus: null,
          reviewNotes: '',
          checks: null,
          history: [],
          archived: false,
          createdAt: new Date().toISOString(),
          expanded: true
        }
        plans.push(newPlan)
      }
      savePlans(plans)
      notifyDataChange(DATA_EVENTS.PLANS_CHANGED)
      closeDialog()
      render()
      showToast(editItem ? '已更新' : '已添加')
    })
  }

  function closeDialog() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl)
    overlayEl = null
    dialogEl = null
  }

  let historyDialogEl = null
  let historyOverlayEl = null

  function showHistoryDetail(h) {
    if (historyOverlayEl && historyOverlayEl.parentNode) historyOverlayEl.parentNode.removeChild(historyOverlayEl)
    historyOverlayEl = document.createElement('div')
    historyOverlayEl.style.cssText = 'position:fixed; inset:0; z-index:100; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; padding:16px;'
    historyOverlayEl.addEventListener('click', (e) => { if (e.target === historyOverlayEl) closeHistoryDialog() })

    const score = h.checks ? h.checks.filter((c) => c.answer === true).length : 0
    const total = h.checks ? h.checks.length : 7

    historyDialogEl = document.createElement('div')
    historyDialogEl.style.cssText = `background:var(--bg); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-float); padding:var(--s-5) var(--s-6); width:min(480px, 100%); max-height:90vh; overflow-y:auto;`
    historyDialogEl.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(h.date)} 检查详情</h3>
        <button id="close-history-dialog" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
          <i data-lucide="x" style="width:16px; height:16px;"></i>
        </button>
      </div>
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-3) var(--s-4); margin-bottom:var(--s-3); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:var(--text-body); color:var(--ink-3);">纪律评分</span>
        <span style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:${score >= 6 ? 'var(--state-success)' : score >= 4 ? 'var(--state-warning)' : 'var(--state-error)'};">${score}/${total}</span>
      </div>
      ${h.checks ? h.checks.map((c, i) => `
        <div style="padding:var(--s-2) 0; ${i < h.checks.length - 1 ? 'border-bottom:1px solid var(--line);' : ''}">
          <div class="flex items-center justify-between">
            <span style="font-size:var(--text-body); color:var(--ink-2);">${DAILY_QUESTIONS[i]}</span>
            <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:${c.answer === true ? 'var(--state-success)' : c.answer === false ? 'var(--state-error)' : 'var(--ink-3)'};">${c.answer === true ? '是' : c.answer === false ? '否' : '-'}</span>
          </div>
          ${c.reason ? `<p style="font-size:var(--text-caption); color:var(--ink-3); margin-top:2px; padding-left:var(--s-3);">${escHtml(c.reason)}</p>` : ''}
        </div>
      `).join('') : ''}
      ${h.notes ? `
        <div style="margin-top:var(--s-3); padding:var(--s-3); background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm);">
          <span style="font-size:var(--text-caption); color:var(--ink-3); font-weight:var(--weight-medium); display:block; margin-bottom:4px;">复盘总结</span>
          <p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(h.notes)}</p>
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

  return {
    mount() { render() },
    unmount() {
      closeDialog()
      closeHistoryDialog()
    }
  }
}
