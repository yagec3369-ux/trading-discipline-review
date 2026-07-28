import { refreshIcons } from '../utils/icons.js'
import { showToast, escHtml } from '../utils/ui.js'
import { lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'

const SUBJECTIVE_TAGS = [
  { id: 'news', label: '消息面', color: 'var(--brand)', bg: 'var(--brand-bg)' },
  { id: 'judgment', label: '个人判断', color: 'var(--state-info)', bg: 'var(--state-info-bg)' },
  { id: 'emotion', label: '情绪周期', color: 'var(--state-warning)', bg: 'var(--state-warning-bg)' },
  { id: 'experience', label: '经验总结', color: 'var(--ink)', bg: 'var(--surface-2)' },
  { id: 'other', label: '其他', color: 'var(--ink-3)', bg: 'var(--surface)' }
]

const CONCEPT_TAG_COLORS = [
  { color: 'var(--brand)', bg: 'var(--brand-bg)' },
  { color: 'var(--state-success)', bg: 'var(--state-success-bg)' },
  { color: 'var(--state-warning)', bg: 'var(--state-warning-bg)' },
  { color: 'var(--state-info)', bg: 'var(--state-info-bg)' },
  { color: 'var(--state-error)', bg: 'var(--state-error-bg)' },
  { color: 'var(--ink)', bg: 'var(--surface-2)' },
  { color: 'var(--ink-2)', bg: 'var(--surface)' }
]

function getTagColor(tagName) {
  let hash = 0
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash)
  }
  const idx = Math.abs(hash) % CONCEPT_TAG_COLORS.length
  return CONCEPT_TAG_COLORS[idx]
}

function formatDate(dateStr) {
  if (!dateStr) return '--'
  if (dateStr.length === 10) {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatChange(change) {
  if (!change) return ''
  const pct = Number(change).toFixed(2) + '%'
  if (change > 0) return '<span style="color:var(--state-error); font-weight:var(--weight-semibold);">+' + pct + '</span>'
  if (change < 0) return '<span style="color:var(--state-success); font-weight:var(--weight-semibold);">' + pct + '</span>'
  return pct
}

export function createLogicLibraryPage(root) {
  let activeTab = 'auto'
  let subjectiveLogic = []
  let logicLibraryData = null
  let expandedStocks = new Set()
  let filterText = ''

  function loadData() {
    const saved = lsGetJSON(STORAGE_KEYS.logicLibrary, null) || {}
    subjectiveLogic = saved.subjective || []
  }

  function saveData() {
    lsSetJSON(STORAGE_KEYS.logicLibrary, { subjective: subjectiveLogic })
  }

  async function fetchLogicLibrary() {
    try {
      const base = import.meta.env.BASE_URL || '/'
      const resp = await fetch(base + 'logic-library.json?t=' + Date.now())
      if (!resp.ok) return null
      return await resp.json()
    } catch (e) {
      return null
    }
  }

  async function render() {
    loadData()

    if (activeTab === 'auto' && !logicLibraryData) {
      root.innerHTML = renderLoading()
      refreshIcons()
      logicLibraryData = await fetchLogicLibrary()
      render()
      return
    }

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">逻辑库</h2>
        ${activeTab === 'subjective' ? `
          <button id="add-subjective-btn" class="flex items-center gap-2 px-4 h-9 whitespace-nowrap" style="background:var(--brand); color:var(--brand-ink); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); transition:background var(--duration-hover) var(--ease-hover); border:none; cursor:pointer;">
            <i data-lucide="plus" style="width:16px; height:16px;"></i>
            添加逻辑
          </button>
        ` : `
          <div class="flex items-center gap-2">
            ${logicLibraryData ? `
              <span style="font-size:var(--text-caption); color:var(--ink-3);">
                共 <span style="color:var(--brand); font-weight:var(--weight-semibold);">${logicLibraryData.totalStocks}</span> 只关注股票
              </span>
              <button id="refresh-btn" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:4px; border-radius:var(--r-sm);" title="刷新">
                <i data-lucide="refresh-cw" style="width:16px; height:16px;"></i>
              </button>
            ` : ''}
          </div>
        `}
      </div>

      <div class="flex gap-2 mb-6 p-1" style="background:var(--surface); border-radius:var(--r-md); width:fit-content;">
        <button id="tab-subjective" class="tab-btn px-4 py-2 rounded-md text-body font-medium transition-all" data-tab="subjective" style="${activeTab === 'subjective' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'}">
          <i data-lucide="brain" style="width:14px; height:14px; margin-right:6px;"></i>
          主观逻辑库
        </button>
        <button id="tab-auto" class="tab-btn px-4 py-2 rounded-md text-body font-medium transition-all" data-tab="auto" style="${activeTab === 'auto' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'}">
          <i data-lucide="flame" style="width:14px; height:14px; margin-right:6px;"></i>
          消息逻辑库
        </button>
      </div>

      ${activeTab === 'subjective' ? renderSubjective() : renderAuto()}
    `
    refreshIcons()
    bindEvents()
  }

  function renderLoading() {
    return `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink);">逻辑库</h2>
      </div>
      <div class="flex gap-2 mb-6 p-1" style="background:var(--surface); border-radius:var(--r-md); width:fit-content;">
        <button class="tab-btn px-4 py-2 rounded-md text-body font-medium" style="color:var(--ink-3);"><i data-lucide="brain" style="width:14px; height:14px; margin-right:6px;"></i>主观逻辑库</button>
        <button class="tab-btn px-4 py-2 rounded-md text-body font-medium" style="background:var(--bg); color:var(--ink);"><i data-lucide="flame" style="width:14px; height:14px; margin-right:6px;"></i>消息逻辑库</button>
      </div>
      <div style="text-align:center; padding:var(--s-7);">
        <i data-lucide="loader-2" style="width:24px; height:24px; color:var(--ink-3); animation:spin 1s linear infinite;"></i>
        <p style="font-size:var(--text-body); color:var(--ink-3); margin-top:var(--s-3);">加载逻辑库数据中...</p>
      </div>
      <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
    `
  }

  function renderSubjective() {
    if (subjectiveLogic.length === 0) {
      return `
        <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
          <i data-lucide="brain-circuit" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
          <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无主观逻辑</p>
          <p style="font-size:var(--text-caption); color:var(--ink-3);">点击上方「添加逻辑」录入你的交易判断依据</p>
        </div>
      `
    }

    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${subjectiveLogic.map((item) => {
          return `
            <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div class="flex items-center gap-2">
                  <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(item.title)}</span>
                </div>
                <button class="delete-subjective-btn" data-id="${item.id}" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
                  <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                </button>
              </div>
              <p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(item.content)}</p>
              <div style="font-size:var(--text-caption); color:var(--ink-3); margin-top:var(--s-3);">
                创建于 ${formatDate(item.createdAt)}
              </div>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function renderAuto() {
    if (!logicLibraryData || !logicLibraryData.stocks || logicLibraryData.stocks.length === 0) {
      return `
        <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
          <i data-lucide="flame" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
          <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无关注的股票</p>
          <p style="font-size:var(--text-caption); color:var(--ink-3);">每日更新热点数据后，上榜的概念股会自动加入此处</p>
        </div>
      `
    }

    const stocks = logicLibraryData.stocks
    const filtered = filterText
      ? stocks.filter((s) => s.name.includes(filterText) || s.tags.some((t) => t.includes(filterText)))
      : stocks

    return `
      <div style="margin-bottom:var(--s-4);">
        <div style="display:flex; align-items:center; gap:var(--s-3);">
          <div style="flex:1; position:relative;">
            <i data-lucide="search" style="width:14px; height:14px; position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--ink-3);"></i>
            <input id="filter-input" type="text" placeholder="搜索股票名称或概念..." value="${escHtml(filterText)}" style="width:100%; height:36px; padding:0 12px 0 36px; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); font-size:var(--text-body); color:var(--ink); outline:none; transition:border-color var(--duration-hover) var(--ease-hover);" onfocus="this.style.borderColor='var(--brand)'" onblur="this.style.borderColor='var(--line)'">
          </div>
          <span style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">
            ${filtered.length} 只 / ${stocks.length} 只
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        ${filtered.map((stock) => renderStockCard(stock)).join('')}
      </div>

      <div style="background:var(--surface-2); border-left:3px solid var(--brand); border-radius:0 var(--r-md) var(--r-md) 0; padding:var(--s-4) var(--s-5); margin-top:var(--s-5);">
        <p style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--brand); margin-bottom:var(--s-2); letter-spacing:0.02em;">使用说明</p>
        <p style="font-size:var(--text-body); line-height:var(--leading-body); color:var(--ink-2);">系统根据每日概念排行榜自动梳理关注股票，每次上榜自动打概念标签（去重），并关联当日相关新闻。点击股票行可展开查看历史上榜记录。</p>
      </div>
    `
  }

  function renderStockCard(stock) {
    const isExpanded = expandedStocks.has(stock.name)
    const tagsHtml = stock.tags.map((tag) => {
      const c = getTagColor(tag)
      return `<span style="font-size:var(--text-caption); color:${c.color}; background:${c.bg}; border-radius:var(--r-pill); padding:2px 8px; white-space:nowrap; margin-right:4px; margin-bottom:4px; display:inline-block;">${escHtml(tag)}</span>`
    }).join('')

    const appearancesHtml = isExpanded ? `
      <div style="padding:var(--s-3) var(--s-4); background:var(--surface-2); border-radius:0 0 var(--r-md) var(--r-md); border-top:1px solid var(--line);">
        ${stock.appearances.map((app) => {
          const c = getTagColor(app.concept)
          return `
            <div style="padding:var(--s-3) 0; border-bottom:1px dashed var(--line); display:flex; align-items:flex-start; gap:var(--s-3);">
              <div style="flex-shrink:0; width:72px; text-align:center;">
                <div style="font-size:var(--text-caption); color:var(--ink-3);">${formatDate(app.date)}</div>
                ${app.change ? `<div style="font-size:var(--text-caption); margin-top:2px;">${formatChange(app.change)}</div>` : ''}
              </div>
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:var(--s-2); margin-bottom:var(--s-1);">
                  <span style="font-size:var(--text-caption); color:${c.color}; background:${c.bg}; border-radius:var(--r-pill); padding:2px 8px; white-space:nowrap; font-weight:var(--weight-medium);;">${escHtml(app.concept)}</span>
                  ${app.conceptChange ? `<span style="font-size:var(--text-caption); color:var(--ink-3);">+${app.conceptChange}%</span>` : ''}
                </div>
                ${app.news ? `
                  <div style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">
                    <a href="${escHtml(app.news.link)}" target="_blank" rel="noopener" style="color:var(--ink-2); text-decoration:none; transition:color var(--duration-hover) var(--ease-hover);" onmouseover="this.style.color='var(--brand)'" onmouseout="this.style.color='var(--ink-2)'">
                      ${escHtml(app.news.title)}
                    </a>
                    ${app.news.source ? `<span style="font-size:var(--text-caption); color:var(--ink-3); margin-left:var(--s-2);">— ${escHtml(app.news.source)}</span>` : ''}
                  </div>
                ` : `
                  <div style="font-size:var(--text-body); color:var(--ink-3);">暂无关联新闻</div>
                `}
              </div>
            </div>
          `
        }).join('')}
      </div>
    ` : ''

    const borderTopStyle = stock.appearances.length > 0 && isExpanded ? 'border-radius:var(--r-md) var(--r-md) 0 0;' : 'border-radius:var(--r-md);'

    return `
      <div style="background:var(--surface); border:1px solid var(--line); ${borderTopStyle} overflow:hidden;">
        <div class="stock-card-header" data-stock-name="${escHtml(stock.name)}" style="padding:var(--s-4) var(--s-5); cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:var(--s-3); transition:background var(--duration-hover) var(--ease-hover);">
          <div style="display:flex; align-items:center; gap:var(--s-3); flex:1; min-width:0;">
            <i data-lucide="chevron-right" class="expand-icon ${isExpanded ? 'expanded' : ''}" style="width:16px; height:16px; color:var(--ink-3); transition:transform var(--duration-hover) var(--ease-hover); flex-shrink:0;"></i>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:var(--s-2); margin-bottom:${stock.tags.length > 0 ? 'var(--s-2)' : '0'};">
                <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(stock.name)}</span>
                ${stock.code ? `<span style="font-size:var(--text-mono); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(stock.code)}</span>` : ''}
                <span style="font-size:var(--text-caption); color:var(--brand); background:var(--brand-bg); border-radius:var(--r-pill); padding:2px 8px; font-weight:var(--weight-medium);">${stock.appearances.length}次上榜</span>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${tagsHtml}
              </div>
            </div>
          </div>
        </div>
        ${appearancesHtml}
      </div>
    `
  }

  function bindEvents() {
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab')
        if (activeTab === 'auto') {
          logicLibraryData = null
          render()
        } else {
          render()
        }
      })
    })

    root.querySelector('#add-subjective-btn')?.addEventListener('click', openAddSubjectiveDialog)

    root.querySelector('#refresh-btn')?.addEventListener('click', () => {
      logicLibraryData = null
      render()
      showToast('已刷新')
    })

    root.querySelectorAll('.delete-subjective-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        if (confirm('确认删除这条逻辑？')) {
          subjectiveLogic = subjectiveLogic.filter((item) => item.id !== id)
          saveData()
          render()
          showToast('已删除')
        }
      })
    })

    root.querySelectorAll('.stock-card-header').forEach((header) => {
      header.addEventListener('click', () => {
        const name = header.getAttribute('data-stock-name')
        if (expandedStocks.has(name)) {
          expandedStocks.delete(name)
        } else {
          expandedStocks.add(name)
        }
        render()
      })
    })

    const filterInput = root.querySelector('#filter-input')
    if (filterInput) {
      let debounceTimer = null
      filterInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          filterText = e.target.value
          render()
        }, 200)
      })
    }
  }

  function openAddSubjectiveDialog() {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed; inset:0; z-index:99; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; padding:16px;'
    overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay) })

    const dialog = document.createElement('div')
    dialog.style.cssText = `background:var(--bg); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-float); padding:var(--s-5) var(--s-6); width:min(520px, 100%); max-height:90vh; overflow-y:auto;`
    dialog.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">添加主观逻辑</h3>
        <button id="close-dialog" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
          <i data-lucide="x" style="width:16px; height:16px;"></i>
        </button>
      </div>
      <div class="flex flex-col gap-4">
        <div>
          <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">逻辑标题 *</label>
          <input type="text" id="subjective-title" class="field-input" style="width:100%;" placeholder="例如：半导体板块走强">
        </div>
        <div>
          <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">详细内容</label>
          <textarea id="subjective-content" rows="4" class="field-input" style="width:100%; resize:vertical;" placeholder="详细描述你的判断依据..."></textarea>
        </div>
        <div class="flex items-center gap-2 justify-end pt-2">
          <button id="cancel-dialog" class="btn-secondary">取消</button>
          <button id="confirm-dialog" class="btn-primary">添加</button>
        </div>
      </div>
    `
    overlay.appendChild(dialog)
    document.body.appendChild(overlay)
    refreshIcons()

    dialog.querySelector('#close-dialog').addEventListener('click', () => document.body.removeChild(overlay))
    dialog.querySelector('#cancel-dialog').addEventListener('click', () => document.body.removeChild(overlay))
    dialog.querySelector('#confirm-dialog').addEventListener('click', () => {
      const title = dialog.querySelector('#subjective-title').value.trim()
      const content = dialog.querySelector('#subjective-content').value.trim()

      if (!title) {
        showToast('请填写逻辑标题')
        return
      }

      subjectiveLogic.unshift({
        id: 'logic_' + Date.now(),
        title,
        content: content || '',
        createdAt: new Date().toISOString()
      })
      saveData()
      document.body.removeChild(overlay)
      render()
      showToast('逻辑已添加')
    })
  }

  return {
    mount() { render() },
    unmount() {}
  }
}
