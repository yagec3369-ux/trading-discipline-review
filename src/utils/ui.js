// Toast notifications + auto-save status helpers

let toastContainer = null

function ensureContainer() {
  if (toastContainer) return toastContainer
  toastContainer = document.getElementById('toast-container')
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'toast-container'
    toastContainer.style.cssText =
      'position:fixed; top:80px; left:50%; transform:translateX(-50%); z-index:100; pointer-events:none;'
    document.body.appendChild(toastContainer)
  }
  return toastContainer
}

export function showToast(msg) {
  const container = ensureContainer()
  const el = document.createElement('div')
  el.className = 'toast-msg'
  el.textContent = msg
  container.appendChild(el)
  requestAnimationFrame(() => el.classList.add('visible'))
  setTimeout(() => {
    el.classList.remove('visible')
    setTimeout(() => {
      el.style.display = 'none'
      if (el.parentNode) el.parentNode.removeChild(el)
    }, 220)
  }, 2000)
}

// Auto-save status indicator (the "已保存" badge in header)
let saveTimer = null
export function showSaveStatus() {
  const el = document.getElementById('auto-save-status')
  if (!el) return
  el.textContent = '保存中...'
  el.style.color = 'var(--state-warning)'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    el.textContent = '已保存'
    el.style.color = 'var(--state-success)'
  }, 600)
}

// HTML escape helper for safe innerHTML injection
export function escHtml(s) {
  if (s === null || s === undefined) return ''
  const d = document.createElement('div')
  d.textContent = String(s)
  return d.innerHTML
}
