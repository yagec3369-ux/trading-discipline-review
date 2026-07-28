// 读取 workbuddy 生成的热点 Excel，转成网页端可用的 JSON，推送到 GitHub
// 用法: node scripts/sync-hotspot/sync.js --reportsDir="C:\Users\admin\WorkBuddy\..." [--push] [--dry]

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import xlsx from 'xlsx'

const args = process.argv.slice(2).reduce((acc, arg) => {
  const match = arg.match(/^--(.+?)=(.+)$/)
  if (match) acc[match[1]] = match[2]
  else acc[arg.replace(/^--/, '')] = true
  return acc
}, {})

const REPORTS_DIR = args.reportsDir || process.env.HOTSPOT_REPORTS_DIR || ''
const PUSH = args.push || false
const DRY = args.dry || false
const OUTPUT_PATH = path.resolve(process.cwd(), 'public/market-hot.json')
const HISTORY_DIR = path.resolve(process.cwd(), 'public/hotspot-history')

if (!REPORTS_DIR) {
  console.error('错误: 请通过 --reportsDir 指定 workbuddy reports 文件夹路径')
  console.error('示例: node scripts/sync-hotspot/sync.js --reportsDir="C:\\Users\\admin\\WorkBuddy\\2026-05-13-task-7\\stock_hotspot\\reports" --push')
  process.exit(1)
}

if (!fs.existsSync(REPORTS_DIR)) {
  console.error('错误: 文件夹不存在:', REPORTS_DIR)
  process.exit(1)
}

// 通用工具：取列值（兼容列名带尾空格）
function col(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== '') return String(row[n]).trim()
  }
  return ''
}
function colNum(row, ...names) {
  const v = col(row, ...names)
  return parseFloat(v) || 0
}
function colInt(row, ...names) {
  const v = col(row, ...names)
  return parseInt(v, 10) || 0
}

function findLatestHotFile(dir) {
  const files = fs.readdirSync(dir)
    .filter((f) => /[\d]{8}.*\.xlsx$/.test(f) || /热点.*\.xlsx$/.test(f))
    .sort()
    .reverse()
  if (files.length === 0) {
    console.error('错误: 未找到热点数据 xlsx 文件')
    process.exit(1)
  }
  return path.join(dir, files[0])
}

function parseExcel(filePath) {
  const wb = xlsx.readFile(filePath)
  console.log('Sheet 列表:', wb.SheetNames.join(', '))

  const concepts = parseSheet(wb, '热点概念榜', parseConcept)
  const financeNewsRaw = parseSheet(wb, '财经新闻', (r) => parseNews(r, 'finance'))
  const stockNewsRaw = parseSheet(wb, '个股新闻', (r) => parseNews(r, 'stock'))
  const financeNews = dedupNews(financeNewsRaw)
  const stockNews = dedupNews(stockNewsRaw)
  if (financeNewsRaw.length !== financeNews.length) {
    console.log(`  [去重] 财经新闻 ${financeNewsRaw.length} → ${financeNews.length} 条`)
  }
  if (stockNewsRaw.length !== stockNews.length) {
    console.log(`  [去重] 个股新闻 ${stockNewsRaw.length} → ${stockNews.length} 条`)
  }
  const indices = parseSheet(wb, '指数行情', parseIndex)
  const sentiment = parseSheet(wb, '市场情绪', parseSentiment)
  const limitUp = parseSheet(wb, '涨停明细', (r) => parseLimit(r, 'up'))
  const limitDown = parseSheet(wb, '跌停明细', (r) => parseLimit(r, 'down'))
  const etf = parseSheet(wb, 'ETF成交额', parseETF)
  const industryFlow = parseSheet(wb, '行业资金流', parseIndustryFlow)
  const fundScale = parseSheet(wb, '基金规模变化', parseFundScale)

  // 构建 股票名→{code, change} 映射，填充缺失的股票代码和涨跌幅
  const infoMap = buildStockInfoMap(wb)

  const dateMatch = path.basename(filePath).match(/(\d{8})/)
  const dateStr = dateMatch
    ? dateMatch[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
    : new Date().toISOString().slice(0, 10)

  const data = {
    concepts,
    financeNews,
    stockNews,
    indices,
    sentiment,
    limitUp,
    limitDown,
    etf,
    industryFlow,
    fundScale,
    date: dateStr,
    updatedAt: new Date().toISOString()
  }

  fillStockInfo(data, infoMap)

  return data
}

// 从"概念领涨股Top3"等 sheet 构建 股票名→{code, change} 映射
function buildStockInfoMap(wb) {
  const map = new Map()
  // 尝试匹配 "概念领涨股Top3" 及类似 sheet
  const aliases = ['概念领涨股Top3', '领涨股Top3', '领涨股', '概念领涨', '领涨股排行', 'Top3', 'top3']
  let matched = false
  for (const s of wb.SheetNames) {
    const sLower = s.toLowerCase()
    if (aliases.some((a) => sLower.includes(a.toLowerCase()) || a.toLowerCase().includes(sLower))) {
      const sheet = wb.Sheets[s]
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
      console.log(`  [匹配] 领涨股 sheet → "${s}", ${rows.length} 行`)
      console.log(`  [列名] ${Object.keys(rows[0] || {}).join(', ')}`)
      let rowMatched = false
      for (const r of rows) {
        rowMatched = false
        // 宽格式：每行可能有多只股票（领涨股1/领涨股2/领涨股3）
        for (let i = 1; i <= 3; i++) {
          const name = col(r, `领涨股${i}`, `股票${i}`, `个股${i}`, i === 1 ? '领涨股' : '', i === 1 ? '股票名称' : '', i === 1 ? '名称' : '')
          const code = col(r, `领涨股${i}代码`, `股票${i}代码`, `代码${i}`, i === 1 ? '股票代码' : '', i === 1 ? '代码' : '')
          const change = colNum(r, `领涨股${i}涨跌幅`, `股票${i}涨跌幅`, `涨跌幅${i}`, i === 1 ? '涨跌幅' : '', i === 1 ? '涨幅' : '')
          if (name && code) {
            map.set(name, { code, change })
            rowMatched = true
          }
        }
        // 兜底：本行未匹配到，直接找所有含"名称"和"代码"的列对
        if (!rowMatched) {
          const keys = Object.keys(r)
          const nameKeys = keys.filter((k) => /名称|股票|个股|领涨/.test(k))
          const codeKeys = keys.filter((k) => /代码|证券代码/.test(k))
          for (const nk of nameKeys) {
            for (const ck of codeKeys) {
              if (r[nk] && r[ck]) {
                const nm = String(r[nk]).trim()
                const cd = String(r[ck]).trim()
                // 尝试找对应的涨跌幅列
                const suffix = nk.replace(/.*名称|.*股票|.*个股|.*领涨/, '').replace(/[^0-9]/g, '')
                const ckSuffix = ck.replace(/.*代码|.*证券代码/, '').replace(/[^0-9]/g, '')
                const changeKey = suffix ? `涨跌幅${suffix}` : '涨跌幅'
                const chg = colNum(r, changeKey, '涨跌幅', '涨幅')
                if (!map.has(nm)) {
                  map.set(nm, { code: cd, change: chg })
                }
              }
            }
          }
        }
      }
      matched = true
      break
    }
  }
  if (!matched) {
    console.log('  [跳过] 未找到"概念领涨股Top3"类 sheet')
  }
  // 也从涨停/跌停明细中补充映射
  for (const sheetName of ['涨停明细', '跌停明细']) {
    const aliases2 = SHEET_ALIASES[sheetName] || []
    const allNames = [sheetName, ...aliases2]
    let actualName = null
    for (const s of wb.SheetNames) {
      const sLower = s.toLowerCase()
      if (allNames.some((n) => sLower.includes(n.toLowerCase()) || n.toLowerCase().includes(sLower))) {
        actualName = s
        break
      }
    }
    const sheet = wb.Sheets[actualName || sheetName]
    if (sheet) {
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
      for (const r of rows) {
        const name = col(r, '股票名称', '名称')
        const code = col(r, '股票代码', '代码')
        const change = colNum(r, '涨跌幅', '涨幅', '跌幅')
        if (name && code && !map.has(name)) {
          map.set(name, { code, change })
        }
      }
    }
  }
  console.log(`  [映射] 股票名→信息映射共 ${map.size} 条`)
  return map
}

// 用映射填充缺失的股票代码和涨跌幅
function fillStockInfo(data, infoMap) {
  if (!infoMap || infoMap.size === 0) return data
  let filledCode = 0, filledChange = 0, filledLeadCode = 0
  // 填充 stockNews 的 stockCode 和 change
  for (const n of data.stockNews) {
    if (n.stockName && infoMap.has(n.stockName)) {
      const info = infoMap.get(n.stockName)
      if (!n.stockCode && info.code) {
        n.stockCode = info.code
        filledCode++
      }
      if (n.change === undefined && info.change) {
        n.change = info.change
        filledChange++
      }
    }
  }
  // 填充 concepts 的 leadingCode
  for (const c of data.concepts) {
    if (!c.leadingCode && c.leadingStock && infoMap.has(c.leadingStock)) {
      const info = infoMap.get(c.leadingStock)
      if (info.code) {
        c.leadingCode = info.code
        filledLeadCode++
      }
    }
  }
  if (filledCode > 0) console.log(`  [填充] 个股新闻 stockCode ${filledCode} 条`)
  if (filledChange > 0) console.log(`  [填充] 个股新闻 涨跌幅 ${filledChange} 条`)
  if (filledLeadCode > 0) console.log(`  [填充] 概念 leadingCode ${filledLeadCode} 条`)
  return data
}

// 按标题去重（个股新闻同时按股票名+标题去重）
function dedupNews(news) {
  if (!Array.isArray(news) || news.length === 0) return []
  const seen = new Set()
  return news.filter((n) => {
    const key = n.stockName ? (n.stockName + '|' + n.title) : n.title
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// 通用 sheet 解析
const SHEET_ALIASES = {
  '热点概念榜': ['热点概念', '概念排行', '概念榜', '概念'],
  '财经新闻': ['财经', '新闻'],
  '个股新闻': ['个股', '股票新闻'],
  '指数行情': ['指数', '大盘指数', '主要指数'],
  '市场情绪': ['情绪', '市场情绪指标', '情绪指标'],
  '涨停明细': ['涨停', '涨停板', '涨停股'],
  '跌停明细': ['跌停', '跌停板', '跌停股'],
  'ETF': ['ETF成交额', 'ETF净值排行', 'etf', 'ETF基金', 'etf成交额'],
  'ETF成交额': ['ETF净值排行', 'etf', 'ETF基金'],
  '行业资金流': ['行业资金', '资金流向', '行业资金流向', '资金流', '行业流向'],
  '基金规模变化': ['基金规模', '规模变化', '基金变化']
}

function parseSheet(wb, sheetName, mapFn) {
  // 模糊匹配 sheet 名（含别名）
  const aliases = SHEET_ALIASES[sheetName] || []
  const allNames = [sheetName, ...aliases]
  let actualName = null
  for (const s of wb.SheetNames) {
    const sLower = s.toLowerCase()
    if (allNames.some((n) => sLower.includes(n.toLowerCase()) || n.toLowerCase().includes(sLower))) {
      actualName = s
      break
    }
  }
  const sheet = wb.Sheets[actualName || sheetName]
  if (!sheet) {
    console.log(`  [跳过] sheet "${sheetName}" 不存在 (已有sheets: ${wb.SheetNames.join(', ')})`)
    return []
  }
  console.log(`  [匹配] "${sheetName}" → "${actualName}"`)
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
  const result = rows.filter((r) => {
    // 过滤空行：至少有一个非空字段
    return Object.values(r).some((v) => v !== '' && v !== null && v !== undefined)
  }).map(mapFn).filter(Boolean)
  console.log(`  [OK] "${sheetName}": ${result.length} 条`)
  return result
}

function parseConcept(r) {
  if (!col(r, '概念名称')) return null
  const net = colNum(r, '净额')
  const inflowVal = colNum(r, '流入资金')
  const outflowVal = colNum(r, '流出资金')
  return {
    name: col(r, '概念名称'),
    index: colNum(r, '概念指数'),
    changePercent: colNum(r, '涨跌幅'),
    inflow: inflowVal + '亿',
    outflow: outflowVal + '亿',
    netAmount: (net >= 0 ? '+' : '') + net.toFixed(2) + '亿',
    netColor: net < 0 ? 'var(--state-success)' : 'var(--state-error)',
    stockCount: colInt(r, '成份股数量', '股票数量', '数量'),
    leadingStock: col(r, '领涨股'),
    leadingCode: col(r, '领涨股代码', '代码'),
    leadingChange: colNum(r, '领涨股涨跌幅'),
    leadingPrice: colNum(r, '领涨股价')
  }
}

function parseNews(r, type) {
  const title = col(r, '新闻标题', '标题')
  if (!title) return null
  if (type === 'stock') {
    return {
      stockName: col(r, '领涨股', '股票名称', '股票'),
      stockCode: col(r, '股票代码', '代码'),
      concept: col(r, '概念', '板块'),
      title,
      time: col(r, '发布时间', '时间'),
      source: col(r, '文章来源', '来源'),
      link: col(r, '新闻链接', '链接') || '#',
      change: colNum(r, '涨跌幅')
    }
  }
  return {
    title,
    summary: col(r, '摘要', '内容', '摘要内容'),
    time: col(r, '发布时间', '时间'),
    source: col(r, '文章来源', '来源'),
    link: col(r, '新闻链接', '链接') || '#'
  }
}

function parseIndex(r) {
  const name = col(r, '指数名称', '名称', '指数')
  if (!name) return null
  const change = colNum(r, '涨跌幅', '涨幅')
  return {
    name,
    code: col(r, '指数代码', '代码'),
    price: colNum(r, '最新价', '收盘价', '价格'),
    change,
    changeAmount: colNum(r, '涨跌额', '涨跌'),
    volume: col(r, '成交量', '成交额'),
    turnover: col(r, '成交额', '金额'),
    changeColor: change < 0 ? 'var(--state-success)' : 'var(--state-error)'
  }
}

function parseSentiment(r) {
  const name = col(r, '指标名称', '指标', '名称', '项目')
  if (!name) return null
  const value = col(r, '数值', '值', '当前值')
  const numVal = parseFloat(value) || 0
  return {
    name,
    value,
    numVal,
    change: col(r, '涨跌', '变化', '增减'),
    description: col(r, '说明', '描述', '备注'),
    changeColor: numVal < 0 ? 'var(--state-success)' : 'var(--state-error)'
  }
}

function parseLimit(r, type) {
  const name = col(r, '股票名称', '名称')
  if (!name) return null
  const change = colNum(r, '涨跌幅', '涨幅', '跌幅')
  return {
    name,
    code: col(r, '股票代码', '代码'),
    price: colNum(r, '最新价', '价格', '收盘价'),
    change,
    changeAmount: colNum(r, '涨跌额', '涨跌'),
    turnover: col(r, '成交额', '金额', '换手率'),
    times: col(r, '涨停次数', '跌停次数', '连板数', '次数'),
    reason: col(r, '涨停原因', '跌停原因', '原因', '涨停题材'),
    industry: col(r, '所属行业', '行业'),
    changeColor: type === 'down' ? 'var(--state-success)' : 'var(--state-error)'
  }
}

function parseETF(r) {
  const name = col(r, '名称', 'ETF名称', '基金名称', '基金简称')
  if (!name) return null
  const change = colNum(r, '涨跌幅', '涨幅')
  return {
    name,
    code: col(r, '代码', '基金代码', 'ETF代码'),
    price: colNum(r, '最新价', '价格', '净值', '单位净值'),
    change,
    turnover: col(r, '成交额', '金额', '成交金额'),
    netAmount: col(r, '净流入', '净额', '资金净流入', '主力净流入'),
    changeColor: change < 0 ? 'var(--state-success)' : 'var(--state-error)'
  }
}

function parseFundScale(r) {
  const name = col(r, '基金名称', '基金简称', '名称')
  if (!name) return null
  const scale = colNum(r, '最新规模', '规模', '基金规模')
  return {
    name,
    code: col(r, '基金代码', '代码'),
    scale,
    scaleStr: col(r, '最新规模', '规模', '基金规模'),
    change: col(r, '规模变化', '变化', '变动'),
    changePct: colNum(r, '变化率', '涨跌幅', '变化幅度'),
    type: col(r, '基金类型', '类型'),
    changeColor: colNum(r, '变化率', '涨跌幅', '变化幅度') < 0 ? 'var(--state-success)' : 'var(--state-error)'
  }
}

function parseIndustryFlow(r) {
  const name = col(r, '行业名称', '行业', '板块名称', '名称')
  if (!name) return null
  const net = colNum(r, '净额', '净流入', '资金净额')
  return {
    name,
    changePercent: colNum(r, '涨跌幅', '涨幅'),
    inflow: col(r, '流入资金', '流入', '主力净流入'),
    outflow: col(r, '流出资金', '流出', '主力净流出'),
    netAmount: (net >= 0 ? '+' : '') + net.toFixed(2) + '亿',
    net,
    netColor: net < 0 ? 'var(--state-success)' : 'var(--state-error)',
    leadingStock: col(r, '领涨股', '领涨'),
    leadingChange: colNum(r, '领涨股涨跌幅', '领涨幅')
  }
}

function main() {
  const latestFile = findLatestHotFile(REPORTS_DIR)
  console.log('读取文件:', latestFile)

  const data = parseExcel(latestFile)
  console.log('\n解析完成:')
  console.log(`  概念 ${data.concepts.length} 条, 财经新闻 ${data.financeNews.length} 条, 个股新闻 ${data.stockNews.length} 条`)
  console.log(`  指数行情 ${data.indices.length} 条, 市场情绪 ${data.sentiment.length} 条`)
  console.log(`  涨停 ${data.limitUp.length} 条, 跌停 ${data.limitDown.length} 条`)
  console.log(`  ETF ${data.etf.length} 条, 行业资金流 ${data.industryFlow.length} 条`)
  console.log(`  基金规模 ${data.fundScale.length} 条`)
  console.log('数据日期:', data.date)

  if (DRY) {
    console.log('\n[dry-run] 输出 JSON 预览:')
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v) && v.length > 0) {
        console.log(`\n${k} (前2条):`)
        console.log(JSON.stringify(v.slice(0, 2), null, 2))
      }
    }
    return
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8')
  console.log('\n已写入:', OUTPUT_PATH)

  // 保存每日历史数据
  const historyFile = path.join(HISTORY_DIR, data.date + '.json')
  fs.mkdirSync(HISTORY_DIR, { recursive: true })
  fs.writeFileSync(historyFile, JSON.stringify(data, null, 2), 'utf-8')
  console.log('历史数据:', historyFile)

  // 生成历史日期索引
  const historyIndexFile = path.join(HISTORY_DIR, 'index.json')
  let historyIndex = []
  if (fs.existsSync(historyIndexFile)) {
    try {
      historyIndex = JSON.parse(fs.readFileSync(historyIndexFile, 'utf-8'))
    } catch (e) {}
  }
  if (!historyIndex.includes(data.date)) {
    historyIndex.push(data.date)
    historyIndex.sort().reverse()
    fs.writeFileSync(historyIndexFile, JSON.stringify(historyIndex, null, 2), 'utf-8')
    console.log('历史索引已更新')
  }

  if (PUSH) {
    try {
      execSync('git add public/market-hot.json public/hotspot-history/', { stdio: 'inherit' })
      execSync(`git commit -m "chore: 更新热点数据 ${data.date}"`, { stdio: 'inherit' })
      execSync('git push origin main', { stdio: 'inherit' })
      console.log('\n已推送到 GitHub!')
    } catch (e) {
      console.error('git 操作失败:', e.message)
      process.exit(1)
    }
  } else {
    console.log('\n提示: 加上 --push 参数可自动提交并推送')
  }
}

main()
