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

const REPORTS_DIR = args.reportsDir || process.env.HOTSPOT_REPORTS_DIR || '/workspace/stock_hotspot/reports'
const PUSH = args.push || false
const DRY = args.dry || false
const OUTPUT_PATH = path.resolve(process.cwd(), 'public/market-hot.json')
const HISTORY_DIR = path.resolve(process.cwd(), 'public/hotspot-history')
const LOGIC_LIBRARY_PATH = path.resolve(process.cwd(), 'public/logic-library.json')

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

// 生成逻辑库：从新闻自动抽取并打标
function generateLogicLibrary(data) {
  // 标签映射规则（简单关键词匹配）
  const tagRules = [
    { id: 'policy', keywords: ['政策', '利好', '扶持', '监管', '通告', '六部门', '国务院', '发改委', '央行'] },
    { id: 'earnings', keywords: ['财报', '业绩', '营收', '净利润', '亏损', '预增', '预亏', '上半年', '年度报告', '半年度'] },
    { id: 'industry', keywords: ['板块', '行业', '走强', '拉升', '异动', 'ETF', '概念', '白酒', '科技', '半导体', '消费', '医药', '地产'] },
    { id: 'reduction', keywords: ['减持', '质押', '回购', '增减持', '持股', '股东', '违规担保'] },
    { id: 'announcement', keywords: ['公告', '中标', '合同', '采购项目', '决议', '董事会', '副总裁', '离任', '辞职', '登记', '注册资本'] },
    { id: 'market', keywords: ['沪指', '创业板指', '涨停', '跌停', '成交额', '北向资金', '大盘', '股市', '总票房', '地震'] },
    { id: 'rotation', keywords: ['轮动', '震荡', '走高', '重挫', '下跌', '上涨', '反弹', '逆势', '板块轮动'] }
  ]

  function classify(text) {
    for (const rule of tagRules) {
      if (rule.keywords.some(k => text.includes(k))) return rule.id
    }
    return 'market'
  }

  function calcConfidence(text) {
    let hits = 0
    for (const rule of tagRules) {
      hits += rule.keywords.filter(k => text.includes(k)).length
    }
    return Math.min(0.95, 0.5 + hits * 0.08)
  }

  const seen = new Set()
  const autoLogic = []
  let idx = 0

  for (const n of data.financeNews || []) {
    if (seen.has(n.title)) continue
    seen.add(n.title)
    const text = (n.title || '') + ' ' + (n.summary || '')
    autoLogic.push({
      id: `auto_${Date.now()}_${idx++}`,
      title: n.title,
      content: n.summary || n.title,
      tag: classify(text),
      stockCode: '',
      confidence: calcConfidence(text),
      createdAt: new Date().toISOString()
    })
  }

  for (const n of data.stockNews || []) {
    if (seen.has(n.title)) continue
    seen.add(n.title)
    const text = (n.title || '') + ' ' + (n.concept || '') + ' ' + (n.stockName || '')
    autoLogic.push({
      id: `auto_${Date.now()}_${idx++}`,
      title: n.title,
      content: `【${n.concept || ''}】${n.stockName || ''} - ${n.title}`,
      tag: classify(text),
      stockCode: n.stockCode || '',
      confidence: calcConfidence(text),
      createdAt: new Date().toISOString()
    })
  }

  // 读取现有逻辑库，合并保留用户主观逻辑
  let existing = { subjective: [], auto: [] }
  if (fs.existsSync(LOGIC_LIBRARY_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(LOGIC_LIBRARY_PATH, 'utf-8'))
    } catch (e) {}
  }

  const result = {
    subjective: existing.subjective || [],
    auto: autoLogic.slice(0, 50),
    updatedAt: new Date().toISOString(),
    date: data.date
  }

  fs.writeFileSync(LOGIC_LIBRARY_PATH, JSON.stringify(result, null, 2), 'utf-8')
  console.log('逻辑库:', LOGIC_LIBRARY_PATH, `(主观 ${result.subjective.length} 条, 自动 ${result.auto.length} 条)`)
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

  // 生成逻辑库 JSON
  generateLogicLibrary(data)

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
          fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data2, null, 2), 'utf-8')
          fs.writeFileSync(historyFile, JSON.stringify(data2, null, 2), 'utf-8')
          generateLogicLibrary(data2)
          // 丢弃 stash 避免冲突
          try { execSync('git stash drop', { stdio: 'ignore' }) } catch (_) {}
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
