// 股票实时行情获取 — 使用腾讯 qt.gtimg.cn API（fetch 无 CORS 限制，支持批量）

/**
 * 6位代码 → 腾讯接口前缀
 * 6开头 → sh / 0,1开头 → sz / 8,4开头 → bj
 */
function toTencentSymbol(code) {
  if (!code) return null
  const c = String(code).replace(/^(sh|sz|bj)/i, '').trim()
  if (!/^\d{6}$/.test(c)) return null
  if (c.startsWith('5') || c.startsWith('6') || c.startsWith('9')) return 'sh' + c
  if (c.startsWith('0') || c.startsWith('1') || c.startsWith('2') || c.startsWith('3')) return 'sz' + c
  return 'bj' + c
}

/**
 * 解析腾讯行情单条返回：字段说明
 * 格式示例：v_sz002436="51~兴森科技~002436~27.69~30.77~..."
 * 字段索引（~分隔）：
 *   [1] 名称 / [2] 代码 / [3] 现价 / [4] 昨收 / [32] 涨跌幅%
 */
function parseTencentLine(rawLine) {
  if (!rawLine) return null
  const eq = rawLine.indexOf('=')
  if (eq < 0) return null
  const quoted = rawLine.substring(eq + 1).trim().replace(/^"|"[;]?$/g, '')
  if (!quoted) return null
  const parts = quoted.split('~')
  if (parts.length < 33) return null
  const name = parts[1] || ''
  const code = parts[2] || ''
  const price = parseFloat(parts[3])
  const changePct = parseFloat(parts[32])
  if (isNaN(price) || price <= 0) return null
  return { price, name, changePct: isNaN(changePct) ? 0 : changePct }
}

/**
 * 获取单只股票现价
 * @param {string} code 股票代码，如 "002436"
 * @returns {Promise<{price:number,name:string,changePct:number}|null>}
 */
export async function fetchStockQuote(code) {
  const results = await fetchStockQuotes([code])
  return results[code] || null
}

/**
 * 批量获取多只股票现价
 * @param {string[]} codes 股票代码数组
 * @returns {Promise<Object>} { code: {price, name, changePct} }
 */
export async function fetchStockQuotes(codes) {
  const results = {}
  const valid = []
  for (const c of codes) {
    if (!c) continue
    const sym = toTencentSymbol(c)
    if (sym) valid.push({ raw: c, sym })
  }
  if (valid.length === 0) return results

  // 腾讯接口支持批量：用逗号拼接符号列表
  const queryStr = valid.map((v) => v.sym).join(',')
  const url = 'https://qt.gtimg.cn/q=' + encodeURIComponent(queryStr)

  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    // 腾讯接口返回 GBK 编码，中文需要转 UTF-8
    let text
    try {
      const buf = await resp.arrayBuffer()
      const dec = new TextDecoder('gbk')
      text = dec.decode(buf)
    } catch (_) {
      text = await resp.text()
    }
    // 按行解析（每行一个 symbol = 一条记录
    const lines = text.split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      const parsed = parseTencentLine(line)
      if (!parsed) continue
      // 找到原始代码映射
      const hit = valid.find((v) => v.sym && line.startsWith('v_' + v.sym + '='))
      const key = hit ? hit.raw : parsed.code
      if (key) results[key] = parsed
    }
  } catch (e) {
    console.warn('[stock-quote] 腾讯行情获取失败:', url, e.message)
  }
  return results
}
