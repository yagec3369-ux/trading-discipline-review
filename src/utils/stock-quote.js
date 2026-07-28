// 股票实时行情获取 — 使用东方财富 push2 API (JSONP, 无 CORS 限制)

/**
 * 根据股票代码生成东方财富 secid
 * 6开头 → 上海 (1.xxxxxx)
 * 0/3开头 → 深圳 (0.xxxxxx)
 * 8/4开头 → 北交所 (0.xxxxxx)
 */
function toSecid(code) {
  if (!code) return null
  const c = String(code).replace(/^(sh|sz|bj)/i, '').trim()
  if (!/^\d{6}$/.test(c)) return null
  if (c.startsWith('6')) return '1.' + c
  if (c.startsWith('0') || c.startsWith('3') || c.startsWith('8') || c.startsWith('4')) return '0.' + c
  return '0.' + c
}

let _jsonpCounter = 0

/**
 * JSONP 请求
 */
function jsonp(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const cbName = '__stock_quote_cb_' + (++_jsonpCounter)
    const script = document.createElement('script')
    let timer = null
    let done = false

    function cleanup() {
      if (timer) clearTimeout(timer)
      delete window[cbName]
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    window[cbName] = (data) => {
      done = true
      cleanup()
      resolve(data)
    }

    timer = setTimeout(() => {
      if (!done) {
        cleanup()
        reject(new Error('请求超时'))
      }
    }, timeout)

    script.onerror = () => {
      if (!done) {
        cleanup()
        reject(new Error('网络错误'))
      }
    }

    script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'cb=' + cbName
    document.head.appendChild(script)
  })
}

/**
 * 获取单只股票现价
 * @param {string} code 股票代码，如 "002436"
 * @returns {Promise<{price:number,name:string,changePct:number}|null>}
 */
export async function fetchStockQuote(code) {
  const secid = toSecid(code)
  if (!secid) return null

  const fields = 'f43,f57,f58,f170'
  const url = 'https://push2.eastmoney.com/api/qt/stock/get?fields=' + fields + '&secid=' + secid
  try {
    const resp = await jsonp(url)
    if (!resp || !resp.data) return null
    const d = resp.data
    // f43: 现价(分)，f170: 涨跌幅(%)
    const price = d.f43 != null ? d.f43 / 100 : null
    const name = d.f58 || ''
    const changePct = d.f170 != null ? d.f170 : 0
    if (price == null) return null
    return { price, name, changePct }
  } catch (e) {
    console.warn('[stock-quote] 获取行情失败:', code, e.message)
    return null
  }
}

/**
 * 批量获取多只股票现价
 * @param {string[]} codes 股票代码数组
 * @returns {Promise<Object>} { code: {price, name, changePct} }
 */
export async function fetchStockQuotes(codes) {
  const results = {}
  const validCodes = [...new Set(codes.filter(Boolean))]
  // 并行请求，最多同时 8 个
  const batchSize = 8
  for (let i = 0; i < validCodes.length; i += batchSize) {
    const batch = validCodes.slice(i, i + batchSize)
    const promises = batch.map(async (code) => {
      const quote = await fetchStockQuote(code)
      if (quote) results[code] = quote
    })
    await Promise.all(promises)
  }
  return results
}
