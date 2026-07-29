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

const REPORTS_DIR = args.reportsDir || process.env.HOTSPOT_REPORTS_DIR || path.resolve(process.cwd(), 'stock_hotspot/reports')
const PUSH = args.push || false
const DRY = args.dry || false
const OUTPUT_PATH = path.resolve(process.cwd(), 'public/market-hot.json')
const LOGIC_LIBRARY_PATH = path.resolve(process.cwd(), 'public/logic-library.json')
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
  const financeNews = parseSheet(wb, '财经新闻', (r) => parseNews(r, 'finance'))
  const stockNews = parseSheet(wb, '个股新闻', (r) => parseNews(r, 'stock'))
  const indices = parseSheet(wb, '指数行情', parseIndex)
  const sentiment = parseSheet(wb, '市场情绪', parseSentiment)
  const limitUp = parseSheet(wb, '涨停明细', (r) => parseLimit(r, 'up'))
  const limitDown = parseSheet(wb, '跌停明细', (r) => parseLimit(r, 'down'))
  const etf = parseSheet(wb, 'ETF', parseETF)
  const industryFlow = parseSheet(wb, '行业资金流', parseIndustryFlow)

  const dateMatch = path.basename(filePath).match(/(\d{8})/)
  const dateStr = dateMatch
    ? dateMatch[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
    : new Date().toISOString().slice(0, 10)

  return {
    concepts,
    financeNews,
    stockNews,
    indices,
    sentiment,
    limitUp,
    limitDown,
    etf,
    industryFlow,
    date: dateStr,
    updatedAt: new Date().toISOString()
  }
}

// 通用 sheet 解析
function parseSheet(wb, sheetName, mapFn) {
  // 模糊匹配 sheet 名
  const actualName = wb.SheetNames.find((s) => s.includes(sheetName) || sheetName.includes(s))
  const sheet = wb.Sheets[actualName || sheetName]
  if (!sheet) {
    console.log(`  [跳过] sheet "${sheetName}" 不存在`)
    return []
  }
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
  const name = col(r, '名称', 'ETF名称', '基金名称')
  if (!name) return null
  const change = colNum(r, '涨跌幅', '涨幅')
  return {
    name,
    code: col(r, '代码', '基金代码'),
    price: colNum(r, '最新价', '价格', '净值'),
    change,
    turnover: col(r, '成交额', '金额'),
    netAmount: col(r, '净流入', '净额', '资金净流入'),
    changeColor: change < 0 ? 'var(--state-success)' : 'var(--state-error)'
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

// 自动打标：根据新闻关键词推断逻辑标签（综合两版本规则）
function tagLogicItem(title, content, stockCode) {
  const text = (title + ' ' + content + ' ' + (stockCode || '')).toLowerCase()
  // reduction
  if (/减持|套现|股东.*减|减持计划|质押|回购|增减持|持股|违规担保/.test(text)) return { tag: 'reduction', confidence: 0.9 }
  // policy
  if (/政策|利好|国务院|证监会|央行|部委|发布.*政策|扶持|监管|通告|六部门|发改委/.test(text)) return { tag: 'policy', confidence: 0.88 }
  // earnings
  if (/财报|业绩|净利润|营收|亏损|盈利|季报|年报|半年报|预增|预亏|上半年|年度报告|半年度/.test(text)) return { tag: 'earnings', confidence: 0.88 }
  // announcement
  if (/公告|重大事项|停牌|复牌|收购|重组|并购|签署.*协议|中标|合同|采购项目|决议|董事会|副总裁|离任|辞职|登记|注册资本/.test(text)) return { tag: 'announcement', confidence: 0.82 }
  // rotation
  if (/板块|轮动|领涨|领跌|主线|热点|题材|概念|风格切换|震荡|走高|重挫|下跌|上涨|反弹|逆势|异动|拉升|走强/.test(text)) return { tag: 'rotation', confidence: 0.78 }
  // industry
  if (/行业|产业|赛道|光伏|半导体|新能源|医药|消费|地产|军工|AI|人工智能|芯片|白酒|科技|ETF/.test(text)) return { tag: 'industry', confidence: 0.72 }
  // market
  if (/大盘|指数|沪指|深成指|创业板|A股|港股|美股|市场整体|估值|涨停|跌停|成交额|北向资金|股市|总票房|地震/.test(text)) return { tag: 'market', confidence: 0.7 }
  return { tag: 'news', confidence: 0.6 }
}

// 生成逻辑库数据：读取现有 → 追加新条目 → 去重合并
function buildLogicLibrary(data) {
  let existing = { subjective: [], auto: [] }
  if (fs.existsSync(LOGIC_LIBRARY_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(LOGIC_LIBRARY_PATH, 'utf-8'))
    } catch (e) {
      existing = { subjective: [], auto: [] }
    }
  }
  if (!Array.isArray(existing.subjective)) existing.subjective = []
  if (!Array.isArray(existing.auto)) existing.auto = []

  const existingKeys = new Set(existing.auto.map((i) => i.title + '|' + (i.createdAt || '').slice(0, 10)))
  const today = data.date
  const newItems = []

  // 从财经新闻生成
  data.financeNews.forEach((n, idx) => {
    const key = n.title + '|' + today
    if (existingKeys.has(key)) return
    const { tag, confidence } = tagLogicItem(n.title, n.summary || '', '')
    newItems.push({
      id: 'auto_' + Date.now() + '_' + idx + '_f',
      title: n.title,
      content: n.summary || n.title,
      tag,
      confidence: Math.min(1, confidence + 0.05),
      source: n.source || '',
      link: n.link || '#',
      createdAt: new Date().toISOString()
    })
  })

  // 从个股新闻生成（带股票代码）
  data.stockNews.forEach((n, idx) => {
    const key = n.title + '|' + today
    if (existingKeys.has(key)) return
    const { tag, confidence } = tagLogicItem(n.title, n.concept || '', n.stockCode || '')
    const stockContext = [n.stockName, n.stockCode, n.concept].filter(Boolean).join(' / ')
    newItems.push({
      id: 'auto_' + Date.now() + '_' + idx + '_s',
      title: n.title,
      content: stockContext ? `${stockContext} — ${n.title}` : n.title,
      tag,
      stockCode: n.stockCode || '',
      confidence,
      change: n.change || 0,
      source: n.source || '',
      link: n.link || '#',
      createdAt: new Date().toISOString()
    })
  })

  // 合并：新的在前，旧的在后，按 title+日期 去重
  const merged = [...newItems, ...existing.auto]
  const seen = new Set()
  const auto = merged.filter((i) => {
    const k = i.title + '|' + (i.createdAt || '').slice(0, 10)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return {
    subjective: existing.subjective,
    auto,
    updatedAt: new Date().toISOString(),
    date: data.date
  }
}

function writeAllOutputs(data, latestFile) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8')
  console.log('已写入:', OUTPUT_PATH)

  const logicLib = buildLogicLibrary(data)
  fs.writeFileSync(LOGIC_LIBRARY_PATH, JSON.stringify(logicLib, null, 2), 'utf-8')
  console.log(`已写入 logic-library.json (主观 ${logicLib.subjective.length} 条 / 消息 ${logicLib.auto.length} 条):`, LOGIC_LIBRARY_PATH)

  const historyFile = path.join(HISTORY_DIR, data.date + '.json')
  fs.mkdirSync(HISTORY_DIR, { recursive: true })
  fs.writeFileSync(historyFile, JSON.stringify(data, null, 2), 'utf-8')
  console.log('历史数据:', historyFile)

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
  console.log('数据日期:', data.date)

  if (DRY) {
    console.log('\n[dry-run] 输出 JSON 预览:')
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v) && v.length > 0) {
        console.log(`\n${k} (前2条):`)
        console.log(JSON.stringify(v.slice(0, 2), null, 2))
      }
    }
    const logic = buildLogicLibrary(data)
    console.log(`\nlogic-library: subjective ${logic.subjective.length} 条, auto ${logic.auto.length} 条`)
    return
  }

  // 先写入所有产出（如果 git stash pop 出现冲突会再重新生成一次覆盖）
  writeAllOutputs(data, latestFile)

  if (PUSH) {
    try {
      console.log('\n--- git add (先暂存所有生成文件) ---')
      execSync('git add public/market-hot.json public/hotspot-history/ public/logic-library.json package.json package-lock.json scripts/sync-hotspot/sync.js 2>/dev/null || true', { stdio: 'inherit' })

      console.log('\n--- git stash -u (暂存所有改动+未跟踪) ---')
      const stashBefore = execSync('git stash list | wc -l', { encoding: 'utf-8' }).trim()
      try {
        execSync('git stash -u', { stdio: 'inherit' })
      } catch (e) {
        console.log('  (无可 stash 的改动，继续)')
      }
      const stashAfter = execSync('git stash list | wc -l', { encoding: 'utf-8' }).trim()
      const stashed = stashBefore !== stashAfter

      console.log('\n--- git pull --rebase ---')
      execSync('git pull --rebase origin main', { stdio: 'inherit' })

      if (stashed) {
        console.log('\n--- git stash pop (恢复本地改动) ---')
        try {
          execSync('git stash pop', { stdio: 'inherit' })
        } catch (e) {
          console.warn('  ⚠️  stash pop 出现冲突，将以本地重新生成的文件为准')
          // 强制使用重新生成的文件：直接重新运行解析部分
          const data2 = parseExcel(latestFile)
          writeAllOutputs(data2, latestFile)
          // 丢弃 stash 避免后续冲突
          try { execSync('git stash drop 2>/dev/null || true', { stdio: 'ignore' }) } catch (_) {}
        }
      } else {
        console.log('\n--- (无需恢复 stash) ---')
      }

      console.log('\n--- git add & commit ---')
      execSync('git add public/market-hot.json public/hotspot-history/ public/logic-library.json package.json package-lock.json scripts/sync-hotspot/sync.js', { stdio: 'inherit' })
      const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim()
      if (status) {
        execSync(`git commit -m "chore: 更新热点数据 ${data.date}"`, { stdio: 'inherit' })
      } else {
        console.log('  (没有需要提交的新变更)')
      }

      console.log('\n--- git push ---')
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
