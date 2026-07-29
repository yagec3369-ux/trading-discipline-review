// 基于现有的 market-hot.json 生成测试用 Excel
import fs from 'node:fs'
import path from 'node:path'
import xlsx from 'xlsx'

const jsonPath = path.resolve(process.cwd(), 'public/market-hot.json')
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
const today = new Date()
const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
const outPath = `/workspace/stock_hotspot/reports/热点数据_${dateStr}.xlsx`

const wb = xlsx.utils.book_new()

// 热点概念榜
const conceptsRows = data.concepts.map((c, i) => ({
  '序号': i + 1,
  '概念名称': c.name,
  '概念指数': c.index,
  '涨跌幅': c.changePercent,
  '流入资金': parseFloat(c.inflow) || 0,
  '流出资金': parseFloat(c.outflow) || 0,
  '净额': parseFloat(c.netAmount) || 0,
  '成份股数量': c.stockCount,
  '领涨股': c.leadingStock,
  '领涨股代码': c.leadingCode,
  '领涨股涨跌幅': c.leadingChange,
  '领涨股价': c.leadingPrice
}))
const ws1 = xlsx.utils.json_to_sheet(conceptsRows)
xlsx.utils.book_append_sheet(wb, ws1, '热点概念榜')

// 财经新闻
const financeRows = data.financeNews.map((n) => ({
  '新闻标题': n.title,
  '摘要': n.summary,
  '发布时间': n.time,
  '文章来源': n.source,
  '新闻链接': n.link
}))
const ws2 = xlsx.utils.json_to_sheet(financeRows)
xlsx.utils.book_append_sheet(wb, ws2, '财经新闻')

// 个股新闻
const stockRows = data.stockNews.map((n) => ({
  '股票名称': n.stockName,
  '股票代码': n.stockCode,
  '概念': n.concept,
  '新闻标题': n.title,
  '发布时间': n.time,
  '文章来源': n.source,
  '新闻链接': n.link,
  '涨跌幅': n.change
}))
const ws3 = xlsx.utils.json_to_sheet(stockRows)
xlsx.utils.book_append_sheet(wb, ws3, '个股新闻')

// 指数行情 (可选)
if (data.indices && data.indices.length > 0) {
  const indexRows = data.indices.map((r) => ({
    '指数名称': r.name,
    '指数代码': r.code,
    '最新价': r.price,
    '涨跌幅': r.change,
    '涨跌额': r.changeAmount,
    '成交量': r.volume,
    '成交额': r.turnover
  }))
  const ws4 = xlsx.utils.json_to_sheet(indexRows)
  xlsx.utils.book_append_sheet(wb, ws4, '指数行情')
}

// 市场情绪 (可选)
if (data.sentiment && data.sentiment.length > 0) {
  const sentimentRows = data.sentiment.map((r) => ({
    '指标名称': r.name,
    '数值': r.value,
    '涨跌': r.change,
    '说明': r.description
  }))
  const ws5 = xlsx.utils.json_to_sheet(sentimentRows)
  xlsx.utils.book_append_sheet(wb, ws5, '市场情绪')
}

// 涨停明细 (可选)
if (data.limitUp && data.limitUp.length > 0) {
  const limitUpRows = data.limitUp.map((r) => ({
    '股票名称': r.name,
    '股票代码': r.code,
    '最新价': r.price,
    '涨跌幅': r.change,
    '涨跌额': r.changeAmount,
    '成交额': r.turnover,
    '涨停次数': r.times,
    '涨停原因': r.reason,
    '所属行业': r.industry
  }))
  const ws6 = xlsx.utils.json_to_sheet(limitUpRows)
  xlsx.utils.book_append_sheet(wb, ws6, '涨停明细')
}

// 跌停明细 (可选)
if (data.limitDown && data.limitDown.length > 0) {
  const limitDownRows = data.limitDown.map((r) => ({
    '股票名称': r.name,
    '股票代码': r.code,
    '最新价': r.price,
    '涨跌幅': r.change,
    '涨跌额': r.changeAmount,
    '成交额': r.turnover,
    '跌停次数': r.times,
    '跌停原因': r.reason,
    '所属行业': r.industry
  }))
  const ws7 = xlsx.utils.json_to_sheet(limitDownRows)
  xlsx.utils.book_append_sheet(wb, ws7, '跌停明细')
}

// ETF (可选)
if (data.etf && data.etf.length > 0) {
  const etfRows = data.etf.map((r) => ({
    '名称': r.name,
    '代码': r.code,
    '最新价': r.price,
    '涨跌幅': r.change,
    '成交额': r.turnover,
    '净流入': r.netAmount
  }))
  const ws8 = xlsx.utils.json_to_sheet(etfRows)
  xlsx.utils.book_append_sheet(wb, ws8, 'ETF')
}

// 行业资金流 (可选)
if (data.industryFlow && data.industryFlow.length > 0) {
  const industryFlowRows = data.industryFlow.map((r) => ({
    '行业名称': r.name,
    '涨跌幅': r.changePercent,
    '流入资金': r.inflow,
    '流出资金': r.outflow,
    '净额': r.netAmount,
    '领涨股': r.leadingStock,
    '领涨股涨跌幅': r.leadingChange
  }))
  const ws9 = xlsx.utils.json_to_sheet(industryFlowRows)
  xlsx.utils.book_append_sheet(wb, ws9, '行业资金流')
}

xlsx.writeFile(wb, outPath)
console.log('生成测试 Excel:', outPath)
