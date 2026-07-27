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

const AUTO_TAGS = [
  { id: 'news', label: '网络消息', color: 'var(--brand)', bg: 'var(--brand-bg)' },
  { id: 'announcement', label: '重大公告', color: 'var(--state-success)', bg: 'var(--state-success-bg)' },
  { id: 'reduction', label: '减持', color: 'var(--state-error)', bg: 'var(--state-error-bg)' },
  { id: 'rotation', label: '板块轮动', color: 'var(--state-info)', bg: 'var(--state-info-bg)' },
  { id: 'policy', label: '政策利好', color: 'var(--state-success)', bg: 'var(--state-success-bg)' },
  { id: 'earnings', label: '财报', color: 'var(--state-warning)', bg: 'var(--state-warning-bg)' },
  { id: 'industry', label: '行业动态', color: 'var(--ink)', bg: 'var(--surface-2)' },
  { id: 'market', label: '市场整体', color: 'var(--ink-2)', bg: 'var(--surface)' }
]

function getTagById(tags, id) {
  return tags.find((t) => t.id === id) || tags[tags.length - 1]
}

export function createLogicLibraryPage(root) {
  let activeTab = 'subjective'
  let subjectiveLogic = []
  let autoLogic = []

  function loadData() {
    const saved = lsGetJSON(STORAGE_KEYS.logicLibrary, null) || {}
    subjectiveLogic = saved.subjective || []
    autoLogic = saved.auto || []
  }

  function saveData() {
    lsSetJSON(STORAGE_KEYS.logicLibrary, { subjective: subjectiveLogic, auto: autoLogic })
  }

  function render() {
    loadData()

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">逻辑库</h2>
        ${activeTab === 'subjective' ? `
          <button id="add-subjective-btn" class="flex items-center gap-2 px-4 h-9 whitespace-nowrap" style="background:var(--brand); color:var(--brand-ink); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); transition:background var(--duration-hover) var(--ease-hover); border:none; cursor:pointer;">
            <i data-lucide="plus" style="width:16px; height:16px;"></i>
            添加逻辑
          </button>
        ` : ''}
      </div>

      <div class="flex gap-2 mb-6 p-1" style="background:var(--surface); border-radius:var(--r-md); width:fit-content;">
        <button id="tab-subjective" class="tab-btn px-4 py-2 rounded-md text-body font-medium transition-all" data-tab="subjective" style="${activeTab === 'subjective' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'}">
          <i data-lucide="brain" style="width:14px; height:14px; margin-right:6px;"></i>
          主观逻辑库
        </button>
        <button id="tab-auto" class="tab-btn px-4 py-2 rounded-md text-body font-medium transition-all" data-tab="auto" style="${activeTab === 'auto' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'}">
          <i data-lucide="bot" style="width:14px; height:14px; margin-right:6px;"></i>
          消息逻辑库
        </button>
      </div>

      ${activeTab === 'subjective' ? renderSubjective() : renderAuto()}

      ${activeTab === 'auto' ? `
        <div style="background:var(--surface-2); border-left:3px solid var(--brand); border-radius:0 var(--r-md) var(--r-md) 0; padding:var(--s-4) var(--s-5); margin-top:var(--s-4);">
          <p style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--brand); margin-bottom:var(--s-2); letter-spacing:0.02em;">接入说明</p>
          <p style="font-size:var(--text-body); line-height:var(--leading-body); color:var(--ink-2);">自动消息逻辑库预留大模型接入接口。后期可接入网络爬虫和AI分析，自动抓取新闻、公告等信息并打标入库。</p>
        </div>
      ` : ''}
    `
    refreshIcons()
    bindEvents()
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
          const tag = getTagById(SUBJECTIVE_TAGS, item.tag)
          return `
            <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div class="flex items-center gap-2">
                  <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(item.title)}</span>
                  <span style="font-size:var(--text-caption); color:${tag.color}; background:${tag.bg}; border-radius:var(--r-pill); padding:2px 8px; white-space:nowrap;">${tag.label}</span>
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
    if (autoLogic.length === 0) {
      return `
        <div style="background:var(--surface); border:1px dashed var(--line); border-radius:var(--r-md); padding:var(--s-7) var(--s-5); text-align:center;">
          <i data-lucide="rss" style="width:32px; height:32px; color:var(--ink-3); margin-bottom:var(--s-3);"></i>
          <p style="font-size:var(--text-body); color:var(--ink-3); margin-bottom:var(--s-1);">暂无自动消息</p>
          <p style="font-size:var(--text-caption); color:var(--ink-3);">系统将自动抓取网络消息并分析打标</p>
        </div>
      `
    }

    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${autoLogic.map((item) => {
          const tag = getTagById(AUTO_TAGS, item.tag)
          const confidenceClass = item.confidence >= 0.8 ? 'var(--state-success)' : item.confidence >= 0.5 ? 'var(--state-warning)' : 'var(--state-error)'
          return `
            <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5);">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div class="flex items-center gap-2">
                  <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(item.title)}</span>
                  <span style="font-size:var(--text-caption); color:${tag.color}; background:${tag.bg}; border-radius:var(--r-pill); padding:2px 8px; white-space:nowrap;">${tag.label}</span>
                </div>
                ${item.stockCode ? `<span style="font-size:var(--text-mono); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(item.stockCode)}</span>` : ''}
              </div>
              <p style="font-size:var(--text-body); color:var(--ink-2); line-height:var(--leading-body);">${escHtml(item.content)}</p>
              <div class="flex items-center gap-4 mt-3">
                <div style="font-size:var(--text-caption); color:var(--ink-3);">
                  置信度 <span style="color:${confidenceClass}; font-weight:var(--weight-semibold);">${(item.confidence * 100).toFixed(0)}%</span>
                </div>
                <div style="font-size:var(--text-caption); color:var(--ink-3);">
                  ${formatDate(item.createdAt)}
                </div>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function formatDate(isoString) {
    if (!isoString) return '--'
    const d = new Date(isoString)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  function bindEvents() {
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab')
        render()
      })
    })

    root.querySelector('#add-subjective-btn')?.addEventListener('click', openAddSubjectiveDialog)

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
          <label style="font-size:var(--text-caption); color:var(--ink-3); display:block; margin-bottom:4px;">标签分类</label>
          <div class="flex flex-wrap gap-2">
            ${SUBJECTIVE_TAGS.map((tag) => `
              <label class="flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition-all" style="font-size:var(--text-caption); color:${tag.color}; background:${tag.bg}; border:1px solid transparent;">
                <input type="radio" name="subjective-tag" value="${tag.id}" style="accent-color:${tag.color};">
                ${tag.label}
              </label>
            `).join('')}
          </div>
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
      const tag = dialog.querySelector('input[name="subjective-tag"]:checked')?.value || 'other'

      if (!title) {
        showToast('请填写逻辑标题')
        return
      }

      subjectiveLogic.unshift({
        id: 'logic_' + Date.now(),
        title,
        content: content || '',
        tag,
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