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

if (!REPORTS_DIR) {
  console.error('错误: 请通过 --reportsDir 指定 workbuddy reports 文件夹路径')
  console.error('示例: node scripts/sync-hotspot/sync.js --reportsDir="C:\\Users\\admin\\WorkBuddy\\2026-05-13-task-7\\stock_hotspot\\reports" --push')
  process.exit(1)
}

if (!fs.existsSync(REPORTS_DIR)) {
  console.error('错误: 文件夹不存在:', REPORTS_DIR)
  process.exit(1)
}

function findLatestHotFile(dir) {
  const files = fs.readdirSync(dir)
    .filter((f) => /^热点数据_[\d]{8}\.xlsx$/.test(f))
    .sort()
    .reverse()
  if (files.length === 0) {
    console.error('错误: 未找到 热点数据_YYYYMMDD.xlsx 文件')
    process.exit(1)
  }
  return path.join(dir, files[0])
}

function parseExcel(filePath) {
  const wb = xlsx.readFile(filePath)

  const concepts = parseConceptSheet(wb, '热点概念榜')
  const financeNews = parseNewsSheet(wb, '财经新闻', 'finance')
  const stockNews = parseNewsSheet(wb, '个股新闻', 'stock')

  const dateMatch = path.basename(filePath).match(/(\d{8})/)
  const dateStr = dateMatch
    ? dateMatch[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
    : new Date().toISOString().slice(0, 10)

  return {
    concepts,
    financeNews,
    stockNews,
    date: dateStr,
    updatedAt: new Date().toISOString()
  }
}

function parseConceptSheet(wb, sheetName) {
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
  return rows
    .filter((r) => r['概念名称'] || r['概念名称 '])
    .map((r, i) => {
      const netStr = String(r['净额'] || r['净额 '] || '0').trim()
      const net = parseFloat(netStr) || 0
      const netColor = net < 0 ? 'var(--state-success)' : 'var(--state-error)'
      const inflowVal = parseFloat(r['流入资金'] || r['流入资金 '] || 0) || 0
      const outflowVal = parseFloat(r['流出资金'] || r['流出资金 '] || 0) || 0

      return {
        name: String(r['概念名称'] || r['概念名称 '] || '').trim(),
        index: parseFloat(r['概念指数'] || r['概念指数 '] || 0) || 0,
        changePercent: parseFloat(r['涨跌幅'] || r['涨跌幅 '] || 0) || 0,
        inflow: inflowVal + '亿',
        outflow: outflowVal + '亿',
        netAmount: (net >= 0 ? '+' : '') + net.toFixed(2) + '亿',
        netColor,
        stockCount: parseInt(r['成份股数量'] || r['成份股数量 '] || 0, 10) || 0,
        leadingStock: String(r['领涨股'] || r['领涨股 '] || '').trim(),
        leadingCode: '',
        leadingChange: parseFloat(r['领涨股涨跌幅'] || r['领涨股涨跌幅 '] || 0) || 0,
        leadingPrice: parseFloat(r['领涨股价'] || r['领涨股价 '] || 0) || 0
      }
    })
}

function parseNewsSheet(wb, sheetName, type) {
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
  return rows
    .filter((r) => r['新闻标题'] || r['新闻标题 '] || r['标题'])
    .map((r) => {
      if (type === 'stock') {
        return {
          stockName: String(r['领涨股'] || r['领涨股 '] || r['股票名称'] || '').trim(),
          stockCode: '',
          concept: String(r['概念'] || r['概念 '] || '').trim(),
          title: String(r['新闻标题'] || r['新闻标题 '] || r['标题'] || '').trim(),
          time: String(r['发布时间'] || r['发布时间 '] || r['时间'] || '').trim(),
          source: String(r['文章来源'] || r['文章来源 '] || r['来源'] || '').trim(),
          link: String(r['新闻链接'] || r['新闻链接 '] || r['链接'] || '#').trim()
        }
      }
      return {
        title: String(r['新闻标题'] || r['新闻标题 '] || r['标题'] || '').trim(),
        summary: '',
        time: String(r['发布时间'] || r['发布时间 '] || r['时间'] || '').trim(),
        source: String(r['文章来源'] || r['文章来源 '] || r['来源'] || '').trim(),
        link: String(r['新闻链接'] || r['新闻链接 '] || r['链接'] || '#').trim()
      }
    })
}

function main() {
  const latestFile = findLatestHotFile(REPORTS_DIR)
  console.log('读取文件:', latestFile)

  const data = parseExcel(latestFile)
  console.log(`解析完成: 概念 ${data.concepts.length} 条, 财经新闻 ${data.financeNews.length} 条, 个股新闻 ${data.stockNews.length} 条`)
  console.log('数据日期:', data.date)

  if (DRY) {
    console.log('\n[dry-run] 输出 JSON 预览 (前 3 条概念):')
    console.log(JSON.stringify(data.concepts.slice(0, 3), null, 2))
    return
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8')
  console.log('已写入:', OUTPUT_PATH)

  if (PUSH) {
    try {
      execSync('git add public/market-hot.json', { stdio: 'inherit' })
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
