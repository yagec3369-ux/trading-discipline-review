// GitHub Gist sync — auto upload/pull localStorage data

const GIST_ID_KEY = 'td_gist_id'
const GIST_TOKEN_KEY = 'td_gist_token'
const GIST_FILENAME = 'trading-data.json'

export function getGistToken() {
  return localStorage.getItem(GIST_TOKEN_KEY) || ''
}

export function setGistToken(token) {
  localStorage.setItem(GIST_TOKEN_KEY, token)
}

export function getGistId() {
  return localStorage.getItem(GIST_ID_KEY) || ''
}

export function setGistId(id) {
  localStorage.setItem(GIST_ID_KEY, id)
}

// Export all localStorage data as JSON
function exportAllData() {
  const data = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('td_') && key !== GIST_TOKEN_KEY && key !== GIST_ID_KEY) {
      try {
        data[key] = JSON.parse(localStorage.getItem(key))
      } catch {
        data[key] = localStorage.getItem(key)
      }
    }
  }
  return data
}

// Import data into localStorage
function importAllData(data) {
  if (!data || typeof data !== 'object') return
  // Clear old data first (except token/gist id)
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key && key.startsWith('td_') && key !== GIST_TOKEN_KEY && key !== GIST_ID_KEY) {
      localStorage.removeItem(key)
    }
  }
  // Import new data
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object') {
      localStorage.setItem(key, JSON.stringify(value))
    } else {
      localStorage.setItem(key, String(value))
    }
  }
}

// Create a new Gist or update existing one
export async function syncToGist() {
  const token = getGistToken()
  if (!token) throw new Error('未配置Token')

  const data = exportAllData()
  const gistId = getGistId()

  const url = gistId
    ? `https://api.github.com/gists/${gistId}`
    : 'https://api.github.com/gists'

  const body = {
    description: 'Trading Discipline Review Data',
    public: false,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(data, null, 2)
      }
    }
  }

  const res = await fetch(url, {
    method: gistId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}`)
  }

  const result = await res.json()
  if (!gistId && result.id) {
    setGistId(result.id)
  }

  return result
}

// Pull data from Gist
export async function pullFromGist() {
  const token = getGistToken()
  const gistId = getGistId()
  if (!token) throw new Error('未配置Token')
  if (!gistId) throw new Error('未找到Gist ID，请先上传')

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `token ${token}`
    }
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}`)
  }

  const result = await res.json()
  const file = result.files[GIST_FILENAME]
  if (!file) throw new Error('Gist中没有数据文件')

  const data = JSON.parse(file.content)
  importAllData(data)

  return result
}

// Check if sync is configured
export function isSyncConfigured() {
  return !!getGistToken()
}

// Clear sync config
export function clearSyncConfig() {
  localStorage.removeItem(GIST_TOKEN_KEY)
  localStorage.removeItem(GIST_ID_KEY)
}