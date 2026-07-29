// 数据管理 page — clear data, cloud sync via GitHub Gist, export/import JSON.

import { refreshIcons } from '../utils/icons.js'
import { showSaveStatus, escHtml } from '../utils/ui.js'
import { STORAGE_KEYS } from '../utils/storage.js'
import {
  getGistToken,
  setGistToken,
  getGistId,
  setGistId,
  syncToGist,
  pullFromGist
} from '../utils/sync.js'

function getSyncToken() {
  return getGistToken()
}
function getSyncGistId() {
  return getGistId()
}

const ALL_TD_KEYS = Object.values(STORAGE_KEYS) // 数组
// 额外保护的云同步 key（独立于 STORAGE_KEYS，需要保留）
const SYNC_ONLY_KEYS = ['td_gist_token', 'td_gist_id']

function listTdKeys() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('td_')) keys.push(k)
  }
  return keys
}

function exportJSON() {
  const data = {}
  listTdKeys().forEach((k) => {
    let v
    try {
      v = JSON.parse(localStorage.getItem(k))
    } catch {
      v = localStorage.getItem(k)
    }
    data[k] = v
  })
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'tdr-backup-' + new Date().toISOString().slice(0, 10) + '.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || '{}'))
        if (!obj || typeof obj !== 'object') throw new Error('文件格式错误')
        resolve(obj)
      } catch (e) {
        reject(e)
      }
    }
    reader.readAsText(file)
  })
}

export function createDataManagementPage(root) {
  let fileInputEl = null

  function render() {
    root.innerHTML = `
      <!-- 数据清除 -->
      <section class="mb-6">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">
          清除数据
        </h3>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5);">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p style="font-size:var(--text-body); color:var(--ink); font-weight:var(--weight-medium);">清除所有本地数据</p>
              <p style="font-size:var(--text-caption); color:var(--ink-3); margin-top:2px;">删除所有本地存储的交易记录、持仓、计划等数据，恢复初始状态。云同步 Token 和 Gist ID 会保留，可随时拉取恢复。</p>
            </div>
            <button id="clear-data-btn" class="shrink-0 px-4 h-9" style="background:var(--state-error); color:white; border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-semibold); border:none; cursor:pointer;">
              清除数据
            </button>
          </div>
        </div>
      </section>

      <!-- 导入 / 导出 -->
      <section class="mb-6">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">
          数据导入 / 导出
        </h3>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5);">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p style="font-size:var(--text-body-l); color:var(--ink); font-weight:var(--weight-medium); margin-bottom:var(--s-2);">导出为 JSON 备份</p>
              <p style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:var(--s-4);">将当前所有本地数据打包成 JSON 文件，建议定期备份或迁移到其他设备使用。</p>
              <button id="export-btn" class="btn-secondary">
                <i data-lucide="download" style="width:14px; height:14px;"></i>
                <span>导出 JSON</span>
              </button>
            </div>
            <div>
              <p style="font-size:var(--text-body-l); color:var(--ink); font-weight:var(--weight-medium); margin-bottom:var(--s-2);">从 JSON 导入</p>
              <p style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:var(--s-4);">导入会覆盖当前所有业务数据（云同步 Token/Gist ID 除外）。请谨慎操作，导入前建议先导出备份。</p>
              <label for="import-file-input" class="btn-primary inline-flex cursor-pointer">
                <i data-lucide="upload" style="width:14px; height:14px;"></i>
                <span>选择 JSON 文件导入</span>
              </label>
              <input type="file" id="import-file-input" accept="application/json,.json" hidden>
            </div>
          </div>
        </div>
      </section>

      <!-- 云同步 -->
      <section>
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink); margin-bottom:var(--s-4);">
          云同步 (GitHub Gist)
        </h3>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-5);">
          <p style="font-size:var(--text-caption); color:var(--ink-3); margin-bottom:var(--s-4);">
            配置 Token 后可多设备同步数据。需 <a href="https://github.com/settings/tokens/new" target="_blank" style="color:var(--brand);">创建 Token</a> 并勾选 gist 权限。多设备同步时，另一台设备需填写相同的 Gist ID。
          </p>
          <div class="flex flex-col gap-2 mb-4">
            <div class="flex items-center gap-2">
              <label style="font-size:var(--text-caption); color:var(--ink-3); width:60px; flex-shrink:0;">Token</label>
              <input type="text" id="sync-token-input" placeholder="ghp_xxx..." value="${escHtml(getSyncToken())}" style="flex:1; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-2) var(--s-3); font-size:var(--text-body); font-family:var(--font-mono);">
            </div>
            <div class="flex items-center gap-2">
              <label style="font-size:var(--text-caption); color:var(--ink-3); width:60px; flex-shrink:0;">Gist ID</label>
              <input type="text" id="sync-gist-id-input" placeholder="首次上传后自动生成，多设备同步需手动填写" value="${escHtml(getSyncGistId() || '')}" style="flex:1; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm); padding:var(--s-2) var(--s-3); font-size:var(--text-body); font-family:var(--font-mono);">
            </div>
            <div class="flex justify-end">
              <button id="save-sync-btn" class="shrink-0 px-4 h-9" style="background:var(--surface-2); color:var(--ink); border:1px solid var(--line); border-radius:var(--r-md); font-size:var(--text-body); font-weight:var(--weight-medium); cursor:pointer;">
                保存
              </button>
            </div>
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
  }

  function bindEvents() {
    // 清除数据
    root.querySelector('#clear-data-btn')?.addEventListener('click', () => {
      if (!confirm('确认清除所有数据？此操作不可撤销。')) return
      if (!confirm('再次确认：将删除所有交易记录、持仓、计划、逻辑库等数据。云同步Token和Gist ID会保留，可随时拉取恢复。')) return
      const preserved = {}
      SYNC_ONLY_KEYS.forEach((k) => {
        preserved[k] = localStorage.getItem(k)
      })
      listTdKeys().forEach((k) => {
        if (!SYNC_ONLY_KEYS.includes(k)) localStorage.removeItem(k)
      })
      Object.entries(preserved).forEach(([k, v]) => {
        if (v != null) localStorage.setItem(k, v)
      })
      location.reload()
    })

    // 导出
    root.querySelector('#export-btn')?.addEventListener('click', () => {
      try {
        exportJSON()
        showSaveStatus('已导出备份文件')
      } catch (e) {
        showSaveStatus('导出失败: ' + e.message, 'error')
      }
    })

    // 导入
    fileInputEl = root.querySelector('#import-file-input')
    fileInputEl?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (!confirm('将使用 JSON 内容覆盖当前业务数据（Token/Gist ID 除外），确认继续？')) {
        e.target.value = ''
        return
      }
      try {
        const obj = await importJSON(file)
        const keysToWrite = Object.keys(obj).filter(
          (k) => k.startsWith('td_') && !SYNC_ONLY_KEYS.includes(k)
        )
        // 删除当前非 sync key，避免残留
        listTdKeys().forEach((k) => {
          if (!SYNC_ONLY_KEYS.includes(k)) localStorage.removeItem(k)
        })
        keysToWrite.forEach((k) => {
          const v = obj[k]
          if (v === null || v === undefined) return
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
        })
        showSaveStatus('导入完成：' + keysToWrite.length + ' 项数据')
        setTimeout(() => location.reload(), 600)
      } catch (err) {
        showSaveStatus('导入失败: ' + err.message, 'error')
      } finally {
        if (fileInputEl) fileInputEl.value = ''
      }
    })

    // 云同步保存配置
    root.querySelector('#save-sync-btn')?.addEventListener('click', () => {
      const tokenInput = root.querySelector('#sync-token-input')
      const gistIdInput = root.querySelector('#sync-gist-id-input')
      const token = tokenInput?.value?.trim() || ''
      const gistId = gistIdInput?.value?.trim() || ''
      if (!token) {
        showSaveStatus('请输入Token', 'error')
        return
      }
      setGistToken(token)
      if (gistId) {
        setGistId(gistId)
      }
      showSaveStatus('配置已保存')
    })

    // 云同步上传
    root.querySelector('#sync-upload-btn')?.addEventListener('click', async () => {
      const statusEl = root.querySelector('#sync-status')
      statusEl.textContent = '上传中...'
      statusEl.style.color = 'var(--ink-3)'
      try {
        await syncToGist()
        statusEl.textContent = '上传成功 ✓'
        statusEl.style.color = 'var(--state-success)'
      } catch (err) {
        statusEl.textContent = '上传失败: ' + err.message
        statusEl.style.color = 'var(--state-error)'
      }
    })

    // 云同步拉取
    root.querySelector('#sync-download-btn')?.addEventListener('click', async () => {
      const statusEl = root.querySelector('#sync-status')
      statusEl.textContent = '拉取中...'
      statusEl.style.color = 'var(--ink-3)'
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

  return {
    mount() {
      render()
    },
    unmount() {
      fileInputEl = null
    }
  }
}
