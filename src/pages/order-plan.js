// 下单计划 page — basic info, trigger conditions, logic validation, execution notes.

import { refreshIcons } from '../utils/icons.js'
import { showToast, showSaveStatus, escHtml } from '../utils/ui.js'
import { lsGet, lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'

const ALL_FIELDS = [
  'stock-name','stock-code','current-price','motive-type','emotion-state','wave-mode',
  'buy-logic','sell-logic','take-profit','stop-loss','max-loss','expected-gain',
  'plan-amount','plan-shares','trigger-detail','invalidate-condition','exec-notes-ta','invalidation-reason'
]

// 仓位上限基数：从风控页读取（默认 12000），用于仓位占比计算
function getTotalFund() {
  const v = lsGet(STORAGE_KEYS.riskCtrl + 'total_fund', '12000')
  const n = parseFloat(v)
  return isNaN(n) || n <= 0 ? 12000 : n
}

export function createOrderPlanPage(root) {
  let logicStatus = null // 'valid' | 'invalid' | null

  function getVal(id) {
    const el = root.querySelector('#' + id)
    return el ? el.value : ''
  }
  function setVal(id, v) {
    const el = root.querySelector('#' + id)
    if (el) el.value = v
  }

  function render() {
    root.innerHTML = `
      <!-- Section 1: Basic info -->
      <section class="mb-8">
        <div class="flex items-center gap-3 mb-4">
          <i data-lucide="info" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">基本信息</h2>
        </div>
        <div id="basic-info-form" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label for="stock-name" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">股票名称</label>
              <input type="text" id="stock-name" placeholder="例如：兴森科技" class="field-input" style="font-size:var(--text-body);">
            </div>
            <div>
              <label for="stock-code" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">股票代码</label>
              <input type="text" id="stock-code" placeholder="例如：002436" class="field-input" style="font-size:var(--text-body);">
            </div>
            <div>
              <label for="current-price" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">当前价格（元）</label>
              <input type="number" id="current-price" placeholder="47.09" class="field-input" style="font-size:var(--text-body);">
            </div>
            <div>
              <label for="motive-type" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">买入动机类型</label>
              <select id="motive-type" class="field-select" style="font-size:var(--text-body);">
                <option value="">请选择</option>
                <option value="plan">计划内操作</option>
                <option value="fomo">怕错过 (FOMO)</option>
                <option value="revenge">报复性交易</option>
                <option value="recovery">急于回本</option>
                <option value="greed">贪婪追涨</option>
                <option value="fear">恐慌杀跌</option>
              </select>
            </div>
            <div>
              <label for="emotion-state" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">情绪状态</label>
              <select id="emotion-state" class="field-select" style="font-size:var(--text-body);">
                <option value="">请选择</option>
                <option value="calm">平静</option>
                <option value="anxious">焦虑</option>
                <option value="excited">兴奋</option>
                <option value="frustrated">沮丧</option>
                <option value="confident">自信</option>
              </select>
            </div>
            <div>
              <label for="wave-mode" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">波段模式</label>
              <select id="wave-mode" class="field-select" style="font-size:var(--text-body);">
                <option value="10-20">10-20天波段</option>
                <option value="20-60">20-60天波段</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Trigger conditions -->
      <section class="mb-8">
        <div class="flex items-center gap-3 mb-4 flex-wrap">
          <i data-lucide="crosshair" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">触发条件</h2>
          <span style="font-size:var(--text-caption); color:var(--ink-3); background:var(--surface); padding:2px 8px; border-radius:var(--r-pill);">自动计算</span>
        </div>
        <div id="trigger-conditions" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div class="sm:col-span-2">
              <label for="buy-logic" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">买入逻辑</label>
              <textarea id="buy-logic" rows="3" placeholder="从逻辑库选择或手动输入买入逻辑（可核验的事实依据）..." class="field-input" style="font-size:var(--text-body); line-height:var(--leading-body); resize:vertical;"></textarea>
              <div class="mt-1 flex items-center gap-2" style="position:relative;">
                <button id="pick-logic-btn" style="font-size:var(--text-caption); color:var(--brand); background:none; border:none; cursor:pointer; display:flex; align-items:center; gap:4px; padding:0; font-family:var(--font-primary);">
                  <i data-lucide="bookmark" style="width:12px; height:12px;"></i>
                  从逻辑库选择
                </button>
                <div id="logic-popover" class="hidden" style="position:absolute; left:0; top:100%; margin-top:4px; z-index:50; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-md); box-shadow:var(--shadow-float); padding:var(--s-3); min-width:280px; max-width:400px; max-height:240px; overflow-y:auto; display:none;">
                  <div id="logic-popover-empty" style="font-size:var(--text-caption); color:var(--ink-3); padding:var(--s-2) var(--s-3);">请先在逻辑库中添加判断逻辑</div>
                  <div id="logic-entries" class="flex flex-col gap-2"></div>
                </div>
              </div>
            </div>
            <div class="sm:col-span-2">
              <label for="sell-logic" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">卖出逻辑</label>
              <textarea id="sell-logic" rows="3" placeholder="退出条件、止盈触发逻辑..." class="field-input" style="font-size:var(--text-body); line-height:var(--leading-body); resize:vertical;"></textarea>
            </div>
            <div class="sm:col-span-2">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label for="take-profit" style="font-size:var(--text-caption); color:var(--ink-3); display:flex; align-items:center; gap:var(--s-2); margin-bottom:var(--s-1);">止盈位（元）<span id="tp-pct" style="font-size:var(--text-caption); color:var(--price-up); font-weight:var(--weight-medium); background:var(--price-up-bg); padding:1px 6px; border-radius:var(--r-pill);">--</span></label>
                  <input type="number" id="take-profit" placeholder="52.00" class="field-input" style="font-size:var(--text-body);">
                </div>
                <div>
                  <label for="expected-gain" style="font-size:var(--text-caption); color:var(--ink-3); display:flex; align-items:center; gap:var(--s-2); margin-bottom:var(--s-1);">预期收益（元）<span id="eg-pct" style="font-size:var(--text-caption); color:var(--price-up); font-weight:var(--weight-medium); background:var(--price-up-bg); padding:1px 6px; border-radius:var(--r-pill);">--</span></label>
                  <input type="number" id="expected-gain" placeholder="1000" class="field-input" style="font-size:var(--text-body);">
                </div>
              </div>
            </div>
            <div class="sm:col-span-2">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label for="stop-loss" style="font-size:var(--text-caption); color:var(--ink-3); display:flex; align-items:center; gap:var(--s-2); margin-bottom:var(--s-1);">止损位（元）<span id="sl-pct" style="font-size:var(--text-caption); color:var(--price-down); font-weight:var(--weight-medium); background:var(--price-down-bg); padding:1px 6px; border-radius:var(--r-pill);">--</span></label>
                  <input type="number" id="stop-loss" placeholder="43.00" class="field-input" style="font-size:var(--text-body);">
                </div>
                <div>
                  <label for="max-loss" style="font-size:var(--text-caption); color:var(--ink-3); display:flex; align-items:center; gap:var(--s-2); margin-bottom:var(--s-1);">最大可接受亏损（元）<span id="ml-pct" style="font-size:var(--text-caption); color:var(--price-down); font-weight:var(--weight-medium); background:var(--price-down-bg); padding:1px 6px; border-radius:var(--r-pill);">--</span></label>
                  <input type="number" id="max-loss" placeholder="500" value="500" class="field-input" style="font-size:var(--text-body);">
                </div>
              </div>
            </div>
            <div>
              <label for="plan-amount" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">计划买入金额（元）</label>
              <input type="number" id="plan-amount" placeholder="45000" class="field-input" style="font-size:var(--text-body);">
            </div>
            <div>
              <label for="plan-shares" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">计划买入仓位（股数）</label>
              <input type="number" id="plan-shares" placeholder="1000" class="field-input" style="font-size:var(--text-body);">
            </div>
            <div class="sm:col-span-2">
              <div id="auto-metrics" class="flex flex-wrap items-center gap-3 sm:gap-6 p-3" style="background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm);">
                <div class="flex items-center gap-2">
                  <span style="font-size:var(--text-caption); color:var(--ink-3);">风险收益比</span>
                  <span id="rr-ratio" style="font-size:var(--text-h3); font-weight:var(--weight-semibold);">-</span>
                </div>
                <div style="width:1px; height:24px; background:var(--line);"></div>
                <div class="flex items-center gap-2">
                  <span style="font-size:var(--text-caption); color:var(--ink-3);">仓位占比</span>
                  <span id="position-pct" style="font-size:var(--text-h3); font-weight:var(--weight-semibold);">-</span>
                </div>
                <div style="width:1px; height:24px; background:var(--line);"></div>
                <div class="flex items-center gap-2">
                  <span style="font-size:var(--text-caption); color:var(--ink-3);">合规检查</span>
                  <span id="compliance-badge" style="font-size:var(--text-caption); font-weight:var(--weight-medium); padding:2px 8px; border-radius:var(--r-pill); background:var(--surface-2); color:var(--ink-3);">待填写</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 3: Logic validation -->
      <section class="mb-8">
        <div class="flex items-center gap-3 mb-4">
          <i data-lucide="scale" style="width:20px; height:20px; color:var(--brand); flex-shrink:0;"></i>
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">逻辑判断</h2>
        </div>
        <div id="logic-validation" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <span style="font-size:var(--text-caption); font-weight:var(--weight-medium); color:var(--brand);">当前买入逻辑</span>
              <button id="refresh-logic-btn" style="font-size:var(--text-caption); color:var(--brand); background:none; border:none; cursor:pointer; display:flex; align-items:center; gap:4px; font-family:var(--font-primary);">
                <i data-lucide="refresh-cw" style="width:12px; height:12px;"></i>
                同步触发条件
              </button>
            </div>
            <div id="logic-display" style="background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-3) var(--s-4); font-size:var(--text-body); color:var(--ink-2); min-height:60px; line-height:var(--leading-body);">
              （请先在触发条件中填写买入逻辑）
            </div>
          </div>
          <div class="mb-4">
            <span style="font-size:var(--text-caption); font-weight:var(--weight-medium); color:var(--ink-3); display:block; margin-bottom:var(--s-2);">逻辑有效性判断</span>
            <div class="flex flex-col gap-2">
              ${[
                { id: 'check-verifiable', text: '逻辑是否可被事实核验？（非"感觉会涨"类主观判断）' },
                { id: 'check-match', text: '是否与逻辑库中的历史判断一致？' },
                { id: 'check-invalidate', text: '能否明确写出逻辑失效的条件？' }
              ].map(c => `
                <div class="flex items-center gap-3 p-3" style="background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm);">
                  <span id="${c.id}" style="width:20px;height:20px;border-radius:50%;background:var(--surface-2);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i data-lucide="help-circle" style="width:12px; height:12px; color:var(--ink-3);"></i>
                  </span>
                  <span style="font-size:var(--text-body); color:var(--ink-2);">${c.text}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="flex gap-3">
            <button id="logic-valid-btn" style="background:var(--state-success); color:white; font-weight:var(--weight-medium); border:none; border-radius:var(--r-sm); padding:var(--s-2) var(--s-4); cursor:pointer; font-family:var(--font-primary); font-size:var(--text-body); display:flex; align-items:center; gap:var(--s-1);">
              <i data-lucide="check" style="width:14px; height:14px;"></i>
              逻辑有效
            </button>
            <button id="logic-invalid-btn" style="background:var(--state-error); color:white; font-weight:var(--weight-medium); border:none; border-radius:var(--r-sm); padding:var(--s-2) var(--s-4); cursor:pointer; font-family:var(--font-primary); font-size:var(--text-body); display:flex; align-items:center; gap:var(--s-1);">
              <i data-lucide="x" style="width:14px; height:14px;"></i>
              逻辑失效
            </button>
          </div>
          <div id="invalidation-record" class="mt-4" style="display:none;">
            <label for="invalidation-reason" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">失效原因记录</label>
            <textarea id="invalidation-reason" rows="3" placeholder="记录为什么判断逻辑已失效..." class="field-input" style="font-size:var(--text-body); line-height:var(--leading-body); resize:vertical;"></textarea>
          </div>
        </div>
      </section>

      <!-- Section 4: Execution notes -->
      <section class="mb-8">
        <div class="flex items-center gap-3 mb-4">
          <i data-lucide="file-text" style="width:20px; height:20px; color:var(--ink-3); flex-shrink:0;"></i>
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">执行说明</h2>
        </div>
        <div id="exec-notes" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5) var(--s-6);">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div class="sm:col-span-2">
              <label for="trigger-detail" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">买入触发条件（具体执行标准）</label>
              <textarea id="trigger-detail" rows="2" placeholder="当...价格达到...成交量突破...时执行买入" class="field-input" style="font-size:var(--text-body); line-height:var(--leading-body); resize:vertical;"></textarea>
            </div>
            <div class="sm:col-span-2">
              <label for="invalidate-condition" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">逻辑失效条件</label>
              <textarea id="invalidate-condition" rows="2" placeholder="当...发生时，买入逻辑不再成立，必须退出" class="field-input" style="font-size:var(--text-body); line-height:var(--leading-body); resize:vertical;"></textarea>
            </div>
            <div class="sm:col-span-2">
              <label for="exec-notes-ta" style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:var(--s-1);">执行备注</label>
              <textarea id="exec-notes-ta" rows="3" placeholder="补充说明、分批建仓计划、特殊注意事项..." class="field-input" style="font-size:var(--text-body); line-height:var(--leading-body); resize:vertical;"></textarea>
            </div>
          </div>
          <div class="mt-4 flex justify-between items-center gap-3 flex-wrap">
            <span id="plan-status" style="font-size:var(--text-caption); color:var(--ink-3); background:var(--surface); padding:2px 8px; border-radius:var(--r-pill);">草稿</span>
            <div class="flex items-center gap-2 flex-wrap">
              <button id="save-plan-btn" style="background:var(--surface); color:var(--ink); font-weight:var(--weight-medium); border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-3) var(--s-5); cursor:pointer; font-family:var(--font-primary); font-size:var(--text-body); display:flex; align-items:center; gap:var(--s-2);">
                <i data-lucide="save" style="width:16px; height:16px;"></i>
                保存草稿
              </button>
              <button id="submit-plan-btn" style="background:var(--brand); color:var(--brand-ink); font-weight:var(--weight-medium); border:none; border-radius:var(--r-sm); padding:var(--s-3) var(--s-5); cursor:pointer; font-family:var(--font-primary); font-size:var(--text-body); display:flex; align-items:center; gap:var(--s-2);">
                <i data-lucide="send" style="width:16px; height:16px;"></i>
                提交计划
              </button>
            </div>
          </div>
        </div>
        <div class="mt-4" style="background:var(--surface-2); border-left:3px solid var(--brand); border-radius:0 var(--r-md) var(--r-md) 0; padding:var(--s-4) var(--s-5);">
          <p style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--brand); margin-bottom:var(--s-2);">核验启发</p>
          <p style="font-size:var(--text-body); line-height:var(--leading-body); color:var(--ink-2);">你的买入逻辑是否每一条都可以被事实核验？"感觉会涨""跌多了应该反弹"不是可核验逻辑。用一句话写出你预期市场会发生什么事来证明你是对的。</p>
        </div>
      </section>
    `
    refreshIcons()
    bindEvents()
    loadSaved()
    calcMetrics()
  }

  function calcMetrics() {
    const maxLoss = parseFloat(getVal('max-loss')) || 0
    const expGain = parseFloat(getVal('expected-gain')) || 0
    const currentPrice = parseFloat(getVal('current-price')) || 0
    const planShares = parseInt(getVal('plan-shares')) || 0
    const takeProfit = parseFloat(getVal('take-profit')) || 0
    const stopLoss = parseFloat(getVal('stop-loss')) || 0

    const rrEl = root.querySelector('#rr-ratio')
    const posEl = root.querySelector('#position-pct')
    const compEl = root.querySelector('#compliance-badge')
    const tpEl = root.querySelector('#tp-pct')
    const slEl = root.querySelector('#sl-pct')
    const egEl = root.querySelector('#eg-pct')
    const mlEl = root.querySelector('#ml-pct')

    // Risk-reward ratio
    if (maxLoss > 0 && expGain > 0) {
      const ratio = expGain / maxLoss
      rrEl.textContent = '1:' + ratio.toFixed(1)
      rrEl.style.color = ratio >= 2 ? 'var(--state-success)' : ratio >= 1 ? 'var(--state-warning)' : 'var(--state-error)'
    } else {
      rrEl.textContent = '-'
      rrEl.style.color = 'var(--ink-3)'
    }

    // Position percentage
    if (currentPrice > 0 && planShares > 0) {
      const pct = (currentPrice * planShares) / getTotalFund() * 100
      posEl.textContent = pct.toFixed(1) + '%'
    } else {
      posEl.textContent = '-'
    }

    // Percentage badges
    if (currentPrice > 0) {
      if (takeProfit > 0) {
        const tpPct = ((takeProfit - currentPrice) / currentPrice * 100).toFixed(1)
        tpEl.textContent = (tpPct >= 0 ? '+' : '') + tpPct + '%'
      } else tpEl.textContent = '--'
      if (stopLoss > 0) {
        const slPct = ((stopLoss - currentPrice) / currentPrice * 100).toFixed(1)
        slEl.textContent = (slPct >= 0 ? '+' : '') + slPct + '%'
      } else slEl.textContent = '--'
      if (expGain > 0 && planShares > 0) {
        const egPct = (expGain / (currentPrice * planShares) * 100).toFixed(1)
        egEl.textContent = '+' + egPct + '%'
      } else egEl.textContent = '--'
      if (maxLoss > 0 && planShares > 0) {
        const mlPct = (maxLoss / (currentPrice * planShares) * 100).toFixed(1)
        mlEl.textContent = '-' + mlPct + '%'
      } else mlEl.textContent = '--'
    } else {
      tpEl.textContent = '--'; slEl.textContent = '--'; egEl.textContent = '--'; mlEl.textContent = '--'
    }

    // Compliance check
    const stockName = getVal('stock-name')
    const stockCode = getVal('stock-code')
    const motive = getVal('motive-type')
    const emotion = getVal('emotion-state')
    const allFilled = stockName !== '' && stockCode !== '' && currentPrice > 0 && motive !== '' && emotion !== '' && stopLoss !== '' && takeProfit !== '' && maxLoss > 0 && expGain > 0 && planShares > 0
    const ratioVal = (maxLoss > 0 && expGain > 0) ? expGain / maxLoss : 0
    const posPct = (currentPrice > 0 && planShares > 0) ? (currentPrice * planShares) / getTotalFund() * 100 : 0
    const reasons = []
    if (!allFilled) reasons.push('字段未填完')
    if (ratioVal < 2 && allFilled) reasons.push('风险收益比不足2')
    if (posPct > 20 && allFilled) reasons.push('仓位超过20%')

    if (allFilled && ratioVal >= 2 && posPct <= 20) {
      compEl.textContent = '合规'
      compEl.style.background = 'var(--state-success-bg)'
      compEl.style.color = 'var(--state-success)'
    } else if (!allFilled) {
      compEl.textContent = '待填写'
      compEl.style.background = 'var(--surface-2)'
      compEl.style.color = 'var(--ink-3)'
    } else {
      compEl.textContent = '不合规: ' + reasons.join(', ')
      compEl.style.background = 'var(--state-error-bg)'
      compEl.style.color = 'var(--state-error)'
    }
  }

  function setCheckIcons(state) {
    const targetBg = state === 'valid' ? 'var(--state-success-bg)' : state === 'invalid' ? 'var(--state-error-bg)' : 'var(--surface-2)'
    ;['check-verifiable', 'check-match', 'check-invalidate'].forEach((cid) => {
      const el = root.querySelector('#' + cid)
      if (el) el.style.background = targetBg
    })
  }

  function autoSave() {
    showSaveStatus()
    const data = {}
    ALL_FIELDS.forEach((id) => { data[id] = getVal(id) })
    data._logicStatus = logicStatus
    data._savedAt = new Date().toISOString()
    lsSetJSON(STORAGE_KEYS.actionPlan, data)
  }

  function loadSaved() {
    const saved = lsGetJSON(STORAGE_KEYS.actionPlan, null)
    if (!saved) return
    try {
      ALL_FIELDS.forEach((id) => {
        if (saved[id] !== undefined && saved[id] !== null) setVal(id, saved[id])
      })
      const validBtn = root.querySelector('#logic-valid-btn')
      const invalidBtn = root.querySelector('#logic-invalid-btn')
      const invalidationRecord = root.querySelector('#invalidation-record')
      if (saved._logicStatus === 'valid') {
        logicStatus = 'valid'
        setCheckIcons('valid')
        invalidationRecord.style.display = 'none'
        validBtn.style.opacity = '1'
        invalidBtn.style.opacity = '0.5'
      } else if (saved._logicStatus === 'invalid') {
        logicStatus = 'invalid'
        setCheckIcons('invalid')
        invalidationRecord.style.display = 'block'
        validBtn.style.opacity = '0.5'
        invalidBtn.style.opacity = '1'
      }
      if (saved._savedAt) {
        const statusEl = root.querySelector('#plan-status')
        statusEl.textContent = '已保存'
        statusEl.style.color = 'var(--state-success)'
        statusEl.style.background = 'var(--state-success-bg)'
      }
    } catch (e) {}
  }

  function bindEvents() {
    // Auto-calc on metric fields
    ;['max-loss','expected-gain','current-price','plan-shares','motive-type','emotion-state','stop-loss','take-profit','stock-name','stock-code'].forEach((id) => {
      const el = root.querySelector('#' + id)
      if (el) {
        el.addEventListener('input', () => { calcMetrics(); autoSave() })
        el.addEventListener('change', () => { calcMetrics(); autoSave() })
      }
    })

    // Auto-save on all fields
    ALL_FIELDS.forEach((id) => {
      const el = root.querySelector('#' + id)
      if (el) {
        el.addEventListener('input', autoSave)
        el.addEventListener('change', autoSave)
      }
    })

    // Logic library popover
    const popover = root.querySelector('#logic-popover')
    const popoverEmpty = root.querySelector('#logic-popover-empty')
    const entriesContainer = root.querySelector('#logic-entries')
    const pickBtn = root.querySelector('#pick-logic-btn')

    function renderLogicEntries() {
      const entries = lsGetJSON(STORAGE_KEYS.logicLibrary, []) || []
      entriesContainer.innerHTML = ''
      if (!entries.length) {
        popoverEmpty.style.display = 'block'
        return
      }
      popoverEmpty.style.display = 'none'
      entries.forEach((entry, idx) => {
        const btn = document.createElement('button')
        btn.className = 'logic-entry-btn'
        btn.style.cssText = 'width:100%; text-align:left; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-2) var(--s-3); cursor:pointer; font-family:var(--font-primary); font-size:var(--text-caption); color:var(--ink-2); line-height:var(--leading-caption);'
        let label = entry.title || ('逻辑 ' + (idx + 1))
        if (entry.content) label += ': ' + entry.content
        btn.textContent = label.length > 80 ? label.substring(0, 80) + '...' : label
        btn.addEventListener('click', () => {
          if (entry.content) {
            setVal('buy-logic', entry.content)
            autoSave()
          }
          closePopover()
        })
        entriesContainer.appendChild(btn)
      })
    }
    function openPopover() {
      renderLogicEntries()
      popover.classList.remove('hidden')
      popover.style.display = 'block'
    }
    function closePopover() {
      popover.classList.add('hidden')
      popover.style.display = 'none'
    }
    pickBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (popover.classList.contains('hidden')) openPopover()
      else closePopover()
    })
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== pickBtn) closePopover()
    })

    // Sync logic button
    const refreshBtn = root.querySelector('#refresh-logic-btn')
    refreshBtn.addEventListener('click', () => {
      const logicText = getVal('buy-logic')
      const display = root.querySelector('#logic-display')
      if (logicText.trim()) {
        display.textContent = logicText
        display.style.color = 'var(--ink)'
      }
    })

    // Logic validation
    const validBtn = root.querySelector('#logic-valid-btn')
    const invalidBtn = root.querySelector('#logic-invalid-btn')
    const invalidationRecord = root.querySelector('#invalidation-record')
    validBtn.addEventListener('click', () => {
      logicStatus = 'valid'
      setCheckIcons('valid')
      invalidationRecord.style.display = 'none'
      validBtn.style.opacity = '1'
      invalidBtn.style.opacity = '0.5'
      autoSave()
    })
    invalidBtn.addEventListener('click', () => {
      logicStatus = 'invalid'
      setCheckIcons('invalid')
      invalidationRecord.style.display = 'block'
      validBtn.style.opacity = '0.5'
      invalidBtn.style.opacity = '1'
      autoSave()
    })

    // Save plan
    const saveBtn = root.querySelector('#save-plan-btn')
    saveBtn.addEventListener('click', () => {
      autoSave()
      const statusEl = root.querySelector('#plan-status')
      statusEl.textContent = '已保存'
      statusEl.style.color = 'var(--state-success)'
      statusEl.style.background = 'var(--state-success-bg)'
      showToast('草稿已保存')
    })

    // Submit plan to execution list
    const submitBtn = root.querySelector('#submit-plan-btn')
    submitBtn.addEventListener('click', () => {
      const stockName = getVal('stock-name')
      if (!stockName.trim()) {
        showToast('请先填写股票名称')
        return
      }
      // Collect form data with camelCase keys for execution page
      const plan = {
        id: 'plan_' + Date.now(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        operatedAt: null,
        stockName: getVal('stock-name'),
        stockCode: getVal('stock-code'),
        currentPrice: getVal('current-price'),
        motiveType: getVal('motive-type'),
        emotionState: getVal('emotion-state'),
        waveMode: getVal('wave-mode'),
        buyLogic: getVal('buy-logic'),
        sellLogic: getVal('sell-logic'),
        takeProfit: getVal('take-profit'),
        stopLoss: getVal('stop-loss'),
        maxLoss: getVal('max-loss'),
        expectedGain: getVal('expected-gain'),
        planAmount: getVal('plan-amount'),
        planShares: getVal('plan-shares'),
        triggerDetail: getVal('trigger-detail'),
        invalidateCondition: getVal('invalidate-condition'),
        execNotes: getVal('exec-notes-ta'),
        invalidationReason: getVal('invalidation-reason'),
        logicStatus: logicStatus
      }
      const plans = lsGetJSON(STORAGE_KEYS.plans, []) || []
      plans.push(plan)
      lsSetJSON(STORAGE_KEYS.plans, plans)
      autoSave()
      showToast('计划已提交到「执行情况」')
    })
  }

  return {
    mount() { render() },
    unmount() {}
  }
}
