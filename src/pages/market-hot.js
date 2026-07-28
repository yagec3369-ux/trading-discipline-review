// 大盘热点页面 — 新闻热点（概念排行+个股新闻融合）、财经新闻

import { refreshIcons } from '../utils/icons.js'
import { showToast, escHtml } from '../utils/ui.js'
import { lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'

function getStockUrl(code, name) {
  if (code) {
    const prefix = code.substring(0, 3)
    let market = 'sh'
    if (['000', '001', '002', '003', '300', '301'].includes(prefix)) market = 'sz'
    else if (['600', '601', '603', '605', '688'].includes(prefix)) market = 'sh'
    else if (['8xx', '4xx', '83', '87', '43', '88', '89'].some((p) => code.startsWith(p))) market = 'bj'
    return 'https://quote.eastmoney.com/' + market + code + '.html'
  }
  return 'https://so.eastmoney.com/web/s?keyword=' + encodeURIComponent(name)
}

const R_UNIT = 1000

const SAMPLE_CONCEPTS = [
  {
    name: '半导体',
    index: 12845.32,
    changePercent: 5.82,
    inflow: '12.3亿',
    outflow: '8.1亿',
    netAmount: '+4.2亿',
    netColor: 'var(--state-error)',
    stockCount: 86,
    leadingStock: '中际旭创',
    leadingCode: '300308',
    leadingChange: 9.98,
    leadingPrice: 156.80
  },
  {
    name: '人工智能',
    index: 4521.67,
    changePercent: 4.35,
    inflow: '9.8亿',
    outflow: '6.2亿',
    netAmount: '+3.6亿',
    netColor: 'var(--state-error)',
    stockCount: 124,
    leadingStock: '科大讯飞',
    leadingCode: '002230',
    leadingChange: 8.52,
    leadingPrice: 52.30
  },
  {
    name: 'CPO概念',
    index: 2389.45,
    changePercent: 3.76,
    inflow: '6.5亿',
    outflow: '4.1亿',
    netAmount: '+2.4亿',
    netColor: 'var(--state-error)',
    stockCount: 32,
    leadingStock: '新易盛',
    leadingCode: '300502',
    leadingChange: 7.43,
    leadingPrice: 89.20
  },
  {
    name: '汽车芯片',
    index: 5678.90,
    changePercent: 2.91,
    inflow: '4.2亿',
    outflow: '3.1亿',
    netAmount: '+1.1亿',
    netColor: 'var(--state-error)',
    stockCount: 45,
    leadingStock: '兆易创新',
    leadingCode: '603986',
    leadingChange: 6.21,
    leadingPrice: 98.50
  },
  {
    name: '数据要素',
    index: 3456.12,
    changePercent: 1.85,
    inflow: '3.1亿',
    outflow: '2.6亿',
    netAmount: '+0.5亿',
    netColor: 'var(--state-error)',
    stockCount: 58,
    leadingStock: '易华录',
    leadingCode: '300212',
    leadingChange: 4.32,
    leadingPrice: 26.80
  },
  {
    name: '光伏设备',
    index: 8765.43,
    changePercent: -1.23,
    inflow: '2.8亿',
    outflow: '5.2亿',
    netAmount: '-2.4亿',
    netColor: 'var(--state-success)',
    stockCount: 67,
    leadingStock: '阳光电源',
    leadingCode: '300274',
    leadingChange: 1.02,
    leadingPrice: 75.60
  },
  {
    name: '房地产',
    index: 2134.56,
    changePercent: -2.45,
    inflow: '1.5亿',
    outflow: '4.3亿',
    netAmount: '-2.8亿',
    netColor: 'var(--state-success)',
    stockCount: 89,
    leadingStock: '万科A',
    leadingCode: '000002',
    leadingChange: -0.85,
    leadingPrice: 8.92
  },
  {
    name: '白酒概念',
    index: 9876.54,
    changePercent: -3.12,
    inflow: '1.2亿',
    outflow: '6.5亿',
    netAmount: '-5.3亿',
    netColor: 'var(--state-success)',
    stockCount: 42,
    leadingStock: '贵州茅台',
    leadingCode: '600519',
    leadingChange: -2.15,
    leadingPrice: 1685.00
  }
]

const SAMPLE_FINANCE_NEWS = [
  {
    title: '央行下调存款准备金率0.5个百分点 释放约1万亿流动性',
    summary: '中国人民银行决定于2026年8月15日下调金融机构存款准备金率0.5个百分点，此次降准预计释放长期资金约1万亿元。',
    time: '2026-07-27 09:15',
    source: '央行官网',
    link: '#'
  },
  {
    title: '半导体板块持续走强 行业景气度迎来拐点',
    summary: '受AI算力需求爆发和国产替代加速双重驱动，半导体板块近期持续走强。',
    time: '2026-07-27 10:32',
    source: '证券时报',
    link: '#'
  },
  {
    title: '国务院发布促进民间投资若干措施 鼓励民企参与重大工程',
    summary: '国务院办公厅发布《关于进一步促进民间投资若干措施的通知》。',
    time: '2026-07-27 11:08',
    source: '新华社',
    link: '#'
  },
  {
    title: '北向资金净流入超80亿 外资连续3日加仓A股',
    summary: '今日北向资金净流入82.3亿元，连续第3个交易日加仓A股。',
    time: '2026-07-27 14:20',
    source: '财联社',
    link: '#'
  },
  {
    title: '新能源汽车6月销量同比增长35% 渗透率突破40%',
    summary: '中汽协数据显示，6月新能源汽车销量达108.5万辆，同比增长35%。',
    time: '2026-07-27 15:45',
    source: '中汽协',
    link: '#'
  }
]

const SAMPLE_STOCK_NEWS = [
  { stockName: '中际旭创', stockCode: '300308', concept: '半导体', title: '中际旭创上半年净利润预增超200% 800G光模块需求爆发', time: '2026-07-27 09:30', source: '公司公告', link: '#', change: 9.98 },
  { stockName: '科大讯飞', stockCode: '002230', concept: '人工智能', title: '科大讯飞星火大模型V4.5发布 多项核心指标超越GPT-4', time: '2026-07-27 10:15', source: '科技日报', link: '#', change: 8.52 },
  { stockName: '新易盛', stockCode: '300502', concept: 'CPO概念', title: '新易盛获海外大客户1.6T光模块订单 产能已排至2027年', time: '2026-07-27 11:22', source: '券商研报', link: '#', change: 7.43 },
  { stockName: '兆易创新', stockCode: '603986', concept: '汽车芯片', title: '兆易创新车规级MCU量产 已导入多家头部车企供应链', time: '2026-07-27 13:48', source: '界面新闻', link: '#', change: 6.21 },
  { stockName: '阳光电源', stockCode: '300274', concept: '光伏设备', title: '阳光电源储能业务出海加速 海外订单占比超60%', time: '2026-07-27 14:35', source: '财联社', link: '#', change: 1.02 },
  { stockName: '贵州茅台', stockCode: '600519', concept: '白酒概念', title: '贵州茅台半年报：营收同比增长12% 批价企稳信号显现', time: '2026-07-27 16:00', source: '公司公告', link: '#', change: -2.15 }
]

function fmtChange(val) {
  const color = val > 0 ? 'var(--state-error)' : val < 0 ? 'var(--state-success)' : 'var(--ink-3)'
  const prefix = val > 0 ? '+' : ''
  return { text: prefix + (val || 0).toFixed(2) + '%', color }
}

// 按概念匹配个股新闻
function matchStockNews(concept, stockNews) {
  if (!stockNews || stockNews.length === 0) return []
  return stockNews.filter((n) => {
    if (n.concept && concept.name && n.concept === concept.name) return true
    if (n.stockName && concept.leadingStock && n.stockName === concept.leadingStock) return true
    return false
  })
}

// 渲染融合页面：概念排行 + 可折叠个股新闻
function renderConceptWithNews(concepts, stockNews) {
  const data = concepts || SAMPLE_CONCEPTS
  const newsData = stockNews || SAMPLE_STOCK_NEWS

  return `
    <div class="mb-4 flex items-center gap-2">
      <i data-lucide="flame" style="width:18px; height:18px; color:var(--state-error);"></i>
      <span style="font-size:var(--text-body); color:var(--ink-3);">点击概念行展开个股新闻 · 共 ${data.length} 个概念</span>
    </div>
    <div class="flex flex-col gap-2">
      ${data.map((c, i) => {
        const change = fmtChange(c.changePercent)
        const leadChange = fmtChange(c.leadingChange)
        const rankColor = i < 3 ? 'var(--state-error)' : 'var(--ink-3)'
        const relatedNews = matchStockNews(c, newsData)
        const hasNews = relatedNews.length > 0
        return `
          <div class="concept-row" data-idx="${i}" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); overflow:hidden; transition:border-color 0.15s;">
            <div class="concept-header" data-idx="${i}" style="display:flex; align-items:center; gap:var(--s-3); padding:var(--s-3) var(--s-4); cursor:${hasNews ? 'pointer' : 'default'}; user-select:none;${hasNews ? '' : 'opacity:0.85;'}">
              <span style="font-weight:var(--weight-bold); color:${rankColor}; font-size:var(--text-body-l); min-width:28px; text-align:center;">${i + 1}</span>
              <span style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink); min-width:100px;">${escHtml(c.name)}</span>
              <span style="font-variant-numeric:tabular-nums; color:var(--ink-2); font-size:var(--text-caption); min-width:80px;">${c.index.toFixed(2)}</span>
              <span style="font-variant-numeric:tabular-nums; font-weight:var(--weight-semibold); color:${change.color}; font-size:var(--text-body); min-width:70px;">${change.text}</span>
              <span style="font-variant-numeric:tabular-nums; color:${c.netColor}; font-size:var(--text-caption); min-width:80px;">净额 ${escHtml(c.netAmount)}</span>
              <span style="color:var(--ink-2); font-size:var(--text-caption); min-width:90px;">领涨: ${escHtml(c.leadingStock)} <span style="color:${leadChange.color}; font-weight:var(--weight-medium);">${leadChange.text}</span></span>
              <span style="color:var(--ink-3); font-size:var(--text-caption); min-width:60px;">${c.stockCount}只</span>
              ${hasNews ? `<span class="expand-icon" data-idx="${i}" style="margin-left:auto; color:var(--ink-3); display:inline-flex; align-items:center; gap:4px; font-size:var(--text-caption);"><i data-lucide="chevron-down" style="width:16px; height:16px;"></i>${relatedNews.length}条新闻</span>` : `<span style="margin-left:auto; color:var(--ink-3); font-size:var(--text-caption);">无新闻</span>`}
            </div>
            <div class="concept-news" data-idx="${i}" style="display:none; border-top:1px solid var(--line); padding:var(--s-2) var(--s-4); background:var(--bg);">
              ${relatedNews.map((n) => {
                const nChange = fmtChange(n.change ?? n.leadingChange ?? 0)
                const link = n.link && n.link !== '#' ? n.link : '#'
                return `
                  <div style="display:flex; align-items:center; gap:var(--s-3); padding:var(--s-2) 0; border-bottom:1px solid var(--line);">
                    <div style="display:flex; flex-direction:column; min-width:100px;">
                      <a href="${getStockUrl(escHtml(n.stockCode), escHtml(n.stockName))}" target="_blank" rel="noopener" class="stock-name-link" data-stock-code="${escHtml(n.stockCode)}" data-stock-name="${escHtml(n.stockName)}" title="在东方财富查看 ${escHtml(n.stockName)} 的K线图" style="font-size:var(--text-body); font-weight:var(--weight-bold); color:var(--brand); text-decoration:none; cursor:pointer;">${escHtml(n.stockName)}</a>
                      <span style="font-size:11px; color:${nChange.color}; font-weight:var(--weight-medium);">${nChange.text}</span>
                    </div>
                    ${link !== '#' ? `<a href="${escHtml(link)}" target="_blank" rel="noopener" style="flex:1; font-size:var(--text-body); color:var(--ink); text-decoration:none; line-height:1.4;${'text-decoration:none;'}" onmouseenter="this.style.color='var(--brand)'" onmouseleave="this.style.color='var(--ink)'">${escHtml(n.title)} <i data-lucide="external-link" style="width:11px; height:11px; display:inline; vertical-align:middle;"></i></a>` : `<span style="flex:1; font-size:var(--text-body); color:var(--ink-2); line-height:1.4;">${escHtml(n.title)}</span>`}
                    <div style="display:flex; flex-direction:column; align-items:flex-end; min-width:120px;">
                      <span style="font-size:11px; color:var(--ink-3);">${escHtml(n.time)}</span>
                      <span style="font-size:11px; color:var(--ink-2);">${escHtml(n.source)}</span>
                    </div>
                  </div>
                `
              }).join('')}
            </div>
          </div>
        `
      }).join('')}
    </div>
  `
}

function renderFinanceNews(news) {
  const data = news || SAMPLE_FINANCE_NEWS
  return `
    <div class="flex flex-col gap-4">
      ${data.map((n) => `
        <a href="${escHtml(n.link)}" target="_blank" rel="noopener" style="display:block; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5); text-decoration:none; transition:border-color 0.15s;" onmouseenter="this.style.borderColor='var(--brand)'" onmouseleave="this.style.borderColor='var(--line)'">
          <div class="flex items-start justify-between gap-3 mb-2">
            <h4 style="font-size:var(--text-body-l); font-weight:var(--weight-semibold); color:var(--ink); line-height:1.4; flex:1;">${escHtml(n.title)}</h4>
            <i data-lucide="external-link" style="width:14px; height:14px; color:var(--ink-3); flex-shrink:0; margin-top:4px;"></i>
          </div>
          ${n.summary ? `<div style="background:var(--brand-bg); border-left:3px solid var(--brand); border-radius:0 var(--r-sm) var(--r-sm) 0; padding:var(--s-2) var(--s-3); margin-bottom:var(--s-3);"><p style="font-size:var(--text-body); line-height:1.6; color:var(--brand); font-weight:var(--weight-medium);">${escHtml(n.summary)}</p></div>` : ''}
          <div class="flex items-center gap-3">
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:inline-flex; align-items:center; gap:4px;">
              <i data-lucide="clock" style="width:12px; height:12px;"></i>
              ${escHtml(n.time)}
            </span>
            <span style="font-size:var(--text-caption); color:var(--ink-3); display:inline-flex; align-items:center; gap:4px;">
              <i data-lucide="newspaper" style="width:12px; height:12px;"></i>
              ${escHtml(n.source)}
            </span>
          </div>
        </a>
      `).join('')}
    </div>
  `
}

function renderIndices(data) {
  if (!data || data.length === 0) return '<div style="padding:var(--s-8); text-align:center; color:var(--ink-3);">暂无数据</div>'
  return `
    <div class="mb-4 flex items-center gap-2">
      <i data-lucide="bar-chart-3" style="width:18px; height:18px; color:var(--brand);"></i>
      <span style="font-size:var(--text-body); color:var(--ink-3);">主要指数行情 · 共 ${data.length} 条</span>
    </div>
    <div class="overflow-x-auto">
      <table style="width:100%; border-collapse:collapse; font-size:var(--text-caption);">
        <thead>
          <tr style="background:var(--surface); color:var(--ink-3);">
            <th style="padding:var(--s-3); text-align:left; border-bottom:1px solid var(--line);">指数名称</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">最新价</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">涨跌额</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">涨跌幅</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">成交额</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((d) => {
            const ch = fmtChange(d.change)
            return `
              <tr style="border-bottom:1px solid var(--line);" onmouseenter="this.style.background='var(--surface)'" onmouseleave="this.style.background='var(--bg)'">
                <td style="padding:var(--s-3); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(d.name)}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink);">${d.price.toFixed(2)}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:${d.changeColor};">${d.changeAmount >= 0 ? '+' : ''}${d.changeAmount.toFixed(2)}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; font-weight:var(--weight-semibold); color:${ch.color};">${ch.text}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink-2);">${escHtml(d.turnover || d.volume || '--')}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderSentiment(data) {
  if (!data || data.length === 0) return '<div style="padding:var(--s-8); text-align:center; color:var(--ink-3);">暂无数据</div>'
  return `
    <div class="mb-4 flex items-center gap-2">
      <i data-lucide="activity" style="width:18px; height:18px; color:var(--brand);"></i>
      <span style="font-size:var(--text-body); color:var(--ink-3);">市场情绪指标 · 共 ${data.length} 条</span>
    </div>
    <div class="flex flex-col gap-3">
      ${data.map((d) => `
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-3) var(--s-4); display:flex; align-items:center; gap:var(--s-4);">
          <div style="min-width:140px;">
            <div style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(d.name)}</div>
            ${d.description ? `<div style="font-size:11px; color:var(--ink-3); margin-top:2px;">${escHtml(d.description)}</div>` : ''}
          </div>
          <div style="font-size:var(--text-h3); font-weight:var(--weight-bold); color:${d.changeColor}; font-variant-numeric:tabular-nums;">${escHtml(d.value)}</div>
          ${d.change ? `<div style="font-size:var(--text-caption); color:${d.changeColor}; font-weight:var(--weight-medium);">${escHtml(d.change)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `
}

function renderLimitList(data, type) {
  if (!data || data.length === 0) return '<div style="padding:var(--s-8); text-align:center; color:var(--ink-3);">暂无数据</div>'
  const title = type === 'up' ? '涨停' : '跌停'
  const icon = type === 'up' ? 'trending-up' : 'trending-down'
  const color = type === 'up' ? 'var(--state-error)' : 'var(--state-success)'
  return `
    <div class="mb-4 flex items-center gap-2">
      <i data-lucide="${icon}" style="width:18px; height:18px; color:${color};"></i>
      <span style="font-size:var(--text-body); color:var(--ink-3);">${title}明细 · 共 ${data.length} 只</span>
    </div>
    <div class="overflow-x-auto">
      <table style="width:100%; border-collapse:collapse; font-size:var(--text-caption);">
        <thead>
          <tr style="background:var(--surface); color:var(--ink-3);">
            <th style="padding:var(--s-3); text-align:left; border-bottom:1px solid var(--line);">股票名称</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">最新价</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">涨跌幅</th>
            <th style="padding:var(--s-3); text-align:center; border-bottom:1px solid var(--line);">连板</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">成交额</th>
            <th style="padding:var(--s-3); text-align:left; border-bottom:1px solid var(--line);">原因/题材</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((d) => {
            const ch = fmtChange(d.change)
            return `
              <tr style="border-bottom:1px solid var(--line);" onmouseenter="this.style.background='var(--surface)'" onmouseleave="this.style.background='var(--bg)'">
                <td style="padding:var(--s-3); font-weight:var(--weight-semibold); color:var(--ink);">
                  ${escHtml(d.name)}
                  ${d.industry ? `<div style="font-size:11px; color:var(--ink-3); font-weight:var(--weight-normal);">${escHtml(d.industry)}</div>` : ''}
                </td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink);">${d.price.toFixed(2)}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; font-weight:var(--weight-bold); color:${ch.color};">${ch.text}</td>
                <td style="padding:var(--s-3); text-align:center; color:${color}; font-weight:var(--weight-semibold);">${escHtml(d.times || '--')}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink-2);">${escHtml(d.turnover || '--')}</td>
                <td style="padding:var(--s-3); color:var(--ink-2);">${escHtml(d.reason || '--')}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderETF(data) {
  if (!data || data.length === 0) return '<div style="padding:var(--s-8); text-align:center; color:var(--ink-3);">暂无数据</div>'
  return `
    <div class="mb-4 flex items-center gap-2">
      <i data-lucide="layers" style="width:18px; height:18px; color:var(--brand);"></i>
      <span style="font-size:var(--text-body); color:var(--ink-3);">ETF行情 · 共 ${data.length} 只</span>
    </div>
    <div class="overflow-x-auto">
      <table style="width:100%; border-collapse:collapse; font-size:var(--text-caption);">
        <thead>
          <tr style="background:var(--surface); color:var(--ink-3);">
            <th style="padding:var(--s-3); text-align:left; border-bottom:1px solid var(--line);">名称</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">最新价</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">涨跌幅</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">成交额</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">净流入</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((d) => {
            const ch = fmtChange(d.change)
            return `
              <tr style="border-bottom:1px solid var(--line);" onmouseenter="this.style.background='var(--surface)'" onmouseleave="this.style.background='var(--bg)'">
                <td style="padding:var(--s-3); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(d.name)}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink);">${d.price.toFixed(3)}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; font-weight:var(--weight-semibold); color:${ch.color};">${ch.text}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink-2);">${escHtml(d.turnover || '--')}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink-2);">${escHtml(d.netAmount || '--')}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderIndustryFlow(data) {
  if (!data || data.length === 0) return '<div style="padding:var(--s-8); text-align:center; color:var(--ink-3);">暂无数据</div>'
  return `
    <div class="mb-4 flex items-center gap-2">
      <i data-lucide="git-branch" style="width:18px; height:18px; color:var(--brand);"></i>
      <span style="font-size:var(--text-body); color:var(--ink-3);">行业资金流向 · 共 ${data.length} 条</span>
    </div>
    <div class="overflow-x-auto">
      <table style="width:100%; border-collapse:collapse; font-size:var(--text-caption);">
        <thead>
          <tr style="background:var(--surface); color:var(--ink-3);">
            <th style="padding:var(--s-3); text-align:left; border-bottom:1px solid var(--line);">行业</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">涨跌幅</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">流入</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">流出</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">净额</th>
            <th style="padding:var(--s-3); text-align:left; border-bottom:1px solid var(--line);">领涨股</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((d) => {
            const ch = fmtChange(d.changePercent)
            return `
              <tr style="border-bottom:1px solid var(--line);" onmouseenter="this.style.background='var(--surface)'" onmouseleave="this.style.background='var(--bg)'">
                <td style="padding:var(--s-3); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(d.name)}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; font-weight:var(--weight-medium); color:${ch.color};">${ch.text}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--state-error);">${escHtml(d.inflow || '--')}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--state-success);">${escHtml(d.outflow || '--')}</td>
                <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; font-weight:var(--weight-semibold); color:${d.netColor};">${escHtml(d.netAmount)}</td>
                <td style="padding:var(--s-3); color:var(--ink-2);">${escHtml(d.leadingStock || '--')}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderFundScale(data) {
  if (!data || data.length === 0) return '<div style="padding:var(--s-8); text-align:center; color:var(--ink-3);">暂无数据</div>'
  return `
    <div class="mb-4 flex items-center gap-2">
      <i data-lucide="pie-chart" style="width:18px; height:18px; color:var(--brand);"></i>
      <span style="font-size:var(--text-body); color:var(--ink-3);">基金规模变化 · 共 ${data.length} 条</span>
    </div>
    <div class="overflow-x-auto">
      <table style="width:100%; border-collapse:collapse; font-size:var(--text-caption);">
        <thead>
          <tr style="background:var(--surface); color:var(--ink-3);">
            <th style="padding:var(--s-3); text-align:left; border-bottom:1px solid var(--line);">基金名称</th>
            <th style="padding:var(--s-3); text-align:left; border-bottom:1px solid var(--line);">类型</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">最新规模</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">规模变化</th>
            <th style="padding:var(--s-3); text-align:right; border-bottom:1px solid var(--line);">变化率</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((d) => `
            <tr style="border-bottom:1px solid var(--line);" onmouseenter="this.style.background='var(--surface)'" onmouseleave="this.style.background='var(--bg)'">
              <td style="padding:var(--s-3); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(d.name)}${d.code ? `<span style="color:var(--ink-3); font-weight:var(--weight-normal); margin-left:4px;">${escHtml(d.code)}</span>` : ''}</td>
              <td style="padding:var(--s-3); color:var(--ink-2);">${escHtml(d.type || '--')}</td>
              <td style="padding:var(--s-3); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink);">${escHtml(d.scaleStr || '--')}</td>
              <td style="padding:var(--s-3); text-align:right; color:${d.changeColor || 'var(--ink-2)'}; font-weight:var(--weight-medium);">${escHtml(d.change || '--')}</td>
              <td style="padding:var(--s-3); text-align:right; font-weight:var(--weight-bold); color:${d.changeColor || 'var(--ink-3)'}; font-variant-numeric:tabular-nums;">${d.changePct ? (d.changePct > 0 ? '+' : '') + d.changePct.toFixed(2) + '%' : '--'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

const HISTORY_KEY = 'td_market_hot_history'
const REMOTE_HISTORY_CACHE = {}

function loadHistory() {
  return lsGetJSON(HISTORY_KEY, {})
}

function saveHistory(history) {
  lsSetJSON(HISTORY_KEY, history)
}

function saveToHistory(data) {
  if (!data || !data.date) return
  const history = loadHistory()
  history[data.date] = data
  const dates = Object.keys(history).sort().reverse()
  if (dates.length > 90) {
    dates.slice(90).forEach((d) => delete history[d])
  }
  saveHistory(history)
}

function getLocalHistoryDates() {
  const history = loadHistory()
  return Object.keys(history).sort().reverse()
}

function getLocalHistoryData(date) {
  const history = loadHistory()
  return history[date] || null
}

async function fetchRemoteHistoryIndex() {
  try {
    const base = import.meta.env.BASE_URL || '/'
    const url = base + 'hotspot-history/index.json?t=' + Date.now()
    const resp = await fetch(url)
    if (!resp.ok) return []
    const data = await resp.json()
    return Array.isArray(data) ? data : []
  } catch (e) {
    return []
  }
}

async function fetchRemoteHistoryData(date) {
  if (REMOTE_HISTORY_CACHE[date]) return REMOTE_HISTORY_CACHE[date]
  try {
    const base = import.meta.env.BASE_URL || '/'
    const url = base + 'hotspot-history/' + date + '.json?t=' + Date.now()
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    REMOTE_HISTORY_CACHE[date] = data
    saveToHistory(data)
    return data
  } catch (e) {
    return null
  }
}

async function getAllHistoryDates() {
  const localDates = getLocalHistoryDates()
  const remoteDates = await fetchRemoteHistoryIndex()
  const merged = [...new Set([...localDates, ...remoteDates])]
  return merged.sort().reverse()
}

async function getHistoryDataByDate(date) {
  const local = getLocalHistoryData(date)
  if (local) return local
  return await fetchRemoteHistoryData(date)
}

export function createMarketHotPage(root) {
  let activeTab = 'rank'
  let currentData = null
  let currentViewDate = null
  let remoteFetching = false
  let autoFetchTimer = null
  let expandedRows = new Set()
  let lastFetchedAt = null
  let historyDatesCache = []
  let loadingHistory = false

  async function fetchRemoteData() {
    if (remoteFetching) return
    remoteFetching = true
    try {
      const base = import.meta.env.BASE_URL || '/'
      const url = base + 'market-hot.json?t=' + Date.now()
      const resp = await fetch(url)
      if (!resp.ok) return
      const data = await resp.json()
      if (data && (data.concepts?.length || data.financeNews?.length || data.stockNews?.length)) {
        currentData = data
        currentViewDate = data.date || todayStr()
        lastFetchedAt = new Date()
        saveToHistory(data)
        await refreshHistoryDates()
        render()
      }
    } catch (e) {
    } finally {
      remoteFetching = false
    }
  }

  function startAutoFetch() {
    stopAutoFetch()
    fetchRemoteData()
    autoFetchTimer = setInterval(fetchRemoteData, 5 * 60 * 1000)
  }

  function stopAutoFetch() {
    if (autoFetchTimer) {
      clearInterval(autoFetchTimer)
      autoFetchTimer = null
    }
  }

  async function refreshHistoryDates() {
    if (loadingHistory) return
    loadingHistory = true
    try {
      historyDatesCache = await getAllHistoryDates()
    } finally {
      loadingHistory = false
    }
  }

  function loadLatestFromHistory() {
    const dates = getLocalHistoryDates()
    if (dates.length > 0) {
      const data = getLocalHistoryData(dates[0])
      if (data) {
        currentData = data
        currentViewDate = dates[0]
      }
    }
    historyDatesCache = getLocalHistoryDates()
    refreshHistoryDates().then(() => render())
  }

  async function switchToDate(date) {
    const data = await getHistoryDataByDate(date)
    if (data) {
      currentData = data
      currentViewDate = date
      render()
      showToast('已切换到 ' + date + ' 的数据')
    } else {
      showToast('该日期暂无数据')
    }
  }

  function switchToLatest() {
    if (lastFetchedAt && currentData) {
      currentViewDate = currentData.date || todayStr()
      render()
      return
    }
    fetchRemoteData()
  }

  function getConcepts() {
    const src = currentData
    return src?.concepts?.length > 0 ? src.concepts : SAMPLE_CONCEPTS
  }
  function getFinanceNews() {
    const src = currentData
    const news = src?.financeNews?.length > 0 ? src.financeNews : SAMPLE_FINANCE_NEWS
    // 前端去重保险：按标题去重
    const seen = new Set()
    return news.filter((n) => {
      const key = n.title || ''
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  function getStockNews() {
    const src = currentData
    const news = src?.stockNews?.length > 0 ? src.stockNews : SAMPLE_STOCK_NEWS
    // 前端去重保险：按 股票名+标题 去重
    const seen = new Set()
    return news.filter((n) => {
      const key = (n.stockName || '') + '|' + (n.title || '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  function getIndices() {
    const src = currentData
    return src?.indices?.length > 0 ? src.indices : []
  }
  function getSentiment() {
    const src = currentData
    return src?.sentiment?.length > 0 ? src.sentiment : []
  }
  function getLimitUp() {
    const src = currentData
    return src?.limitUp?.length > 0 ? src.limitUp : []
  }
  function getLimitDown() {
    const src = currentData
    return src?.limitDown?.length > 0 ? src.limitDown : []
  }
  function getETF() {
    const src = currentData
    return src?.etf?.length > 0 ? src.etf : []
  }
  function getIndustryFlow() {
    const src = currentData
    return src?.industryFlow?.length > 0 ? src.industryFlow : []
  }
  function getFundScale() {
    const src = currentData
    return src?.fundScale?.length > 0 ? src.fundScale : []
  }
  function getDataDate() {
    return currentViewDate || null
  }
  function hasData() {
    const src = currentData
    return !!(src && (src.concepts?.length || src.financeNews?.length || src.stockNews?.length))
  }
  function isViewingLatest() {
    if (!currentData || !currentData.date || !lastFetchedAt) return false
    return currentViewDate === currentData.date
  }

  function render() {
    const concepts = getConcepts()
    const financeNews = getFinanceNews()
    const stockNews = getStockNews()
    const dataDate = getDataDate()
    const hasValidData = hasData()
    const viewingLatest = isViewingLatest()
    const historyDates = historyDatesCache.length > 0 ? historyDatesCache : getLocalHistoryDates()
    const fetchTimeStr = lastFetchedAt
      ? lastFetchedAt.getHours().toString().padStart(2, '0') + ':' + lastFetchedAt.getMinutes().toString().padStart(2, '0')
      : null

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div class="flex items-center gap-3 flex-wrap">
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">大盘热点</h2>
          <span style="font-size:var(--text-caption); color:var(--brand); background:var(--brand-muted); padding:2px 8px; border-radius:var(--r-pill); display:inline-flex; align-items:center; gap:4px;">
            <i data-lucide="wifi" style="width:10px; height:10px;"></i>
            自动同步
          </span>
          ${viewingLatest && fetchTimeStr ? '<span style="font-size:var(--text-caption); color:var(--ink-3);">上次更新 ' + fetchTimeStr + '</span>' : ''}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          ${historyDates.length > 0 ? `
            <div class="flex items-center gap-2">
              <label style="font-size:var(--text-caption); color:var(--ink-3); white-space:nowrap;">历史数据</label>
              <select id="history-select" style="background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:4px 8px; font-size:var(--text-caption); color:var(--ink); outline:none; cursor:pointer; font-family:var(--font-primary);">
                <option value="latest" ${viewingLatest ? 'selected' : ''}>最新数据</option>
                ${historyDates.map((d) => `<option value="${escHtml(d)}" ${currentViewDate === d ? 'selected' : ''}>${escHtml(d)}</option>`).join('')}
              </select>
            </div>
          ` : ''}
          <span style="font-size:var(--text-caption); color:var(--ink-3); display:inline-flex; align-items:center; gap:4px;">
            <i data-lucide="calendar" style="width:12px; height:12px;"></i>
            ${dataDate ? dataDate : '示例数据'}
          </span>
          <button id="refresh-btn" class="flex items-center gap-2 px-3 h-8" style="background:var(--surface); color:var(--ink); border:1px solid var(--line); border-radius:var(--r-md); font-size:var(--text-caption); font-weight:var(--weight-medium); cursor:pointer;">
            <i data-lucide="refresh-cw" style="width:14px; height:14px;"></i>
            刷新
          </button>
        </div>
      </div>

      <div class="mb-6" style="overflow-x:auto;">
        <div class="flex gap-2 p-1" style="background:var(--surface); border-radius:var(--r-md); width:fit-content;">
          <button id="tab-rank" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="rank" style="${activeTab === 'rank' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'} white-space:nowrap; flex-shrink:0;">
            <i data-lucide="trending-up" style="width:14px; height:14px; margin-right:6px;"></i>
            新闻热点
          </button>
          <button id="tab-finance" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="finance" style="${activeTab === 'finance' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'} white-space:nowrap; flex-shrink:0;">
            <i data-lucide="newspaper" style="width:14px; height:14px; margin-right:6px;"></i>
            财经新闻
          </button>
          <button id="tab-indices" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="indices" style="${activeTab === 'indices' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'} white-space:nowrap; flex-shrink:0;">
            <i data-lucide="bar-chart-3" style="width:14px; height:14px; margin-right:6px;"></i>
            指数行情
          </button>
          <button id="tab-sentiment" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="sentiment" style="${activeTab === 'sentiment' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'} white-space:nowrap; flex-shrink:0;">
            <i data-lucide="activity" style="width:14px; height:14px; margin-right:6px;"></i>
            市场情绪
          </button>
          <button id="tab-limitUp" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="limitUp" style="${activeTab === 'limitUp' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'} white-space:nowrap; flex-shrink:0;">
            <i data-lucide="chevrons-up" style="width:14px; height:14px; margin-right:6px;"></i>
            涨停明细
          </button>
          <button id="tab-limitDown" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="limitDown" style="${activeTab === 'limitDown' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'} white-space:nowrap; flex-shrink:0;">
            <i data-lucide="chevrons-down" style="width:14px; height:14px; margin-right:6px;"></i>
            跌停明细
          </button>
          <button id="tab-etf" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="etf" style="${activeTab === 'etf' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'} white-space:nowrap; flex-shrink:0;">
            <i data-lucide="layers" style="width:14px; height:14px; margin-right:6px;"></i>
            ETF
          </button>
          <button id="tab-industryFlow" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="industryFlow" style="${activeTab === 'industryFlow' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'} white-space:nowrap; flex-shrink:0;">
            <i data-lucide="git-branch" style="width:14px; height:14px; margin-right:6px;"></i>
            行业资金
          </button>
          <button id="tab-fundScale" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="fundScale" style="${activeTab === 'fundScale' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'} white-space:nowrap; flex-shrink:0;">
            <i data-lucide="pie-chart" style="width:14px; height:14px; margin-right:6px;"></i>
            基金规模
          </button>
        </div>
      </div>

      ${activeTab === 'rank' ? renderConceptWithNews(concepts, stockNews) : ''}
      ${activeTab === 'finance' ? renderFinanceNews(financeNews) : ''}
      ${activeTab === 'indices' ? renderIndices(getIndices()) : ''}
      ${activeTab === 'sentiment' ? renderSentiment(getSentiment()) : ''}
      ${activeTab === 'limitUp' ? renderLimitList(getLimitUp(), 'up') : ''}
      ${activeTab === 'limitDown' ? renderLimitList(getLimitDown(), 'down') : ''}
      ${activeTab === 'etf' ? renderETF(getETF()) : ''}
      ${activeTab === 'industryFlow' ? renderIndustryFlow(getIndustryFlow()) : ''}
      ${activeTab === 'fundScale' ? renderFundScale(getFundScale()) : ''}
    `
    refreshIcons()
    bindEvents()
  }

  function bindEvents() {
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab')
        expandedRows.clear()
        render()
      })
    })

    root.querySelectorAll('.stock-name-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const code = link.getAttribute('data-stock-code') || ''
        const name = link.getAttribute('data-stock-name') || ''
        const url = getStockUrl(code, name)
        window.open(url, '_blank', 'noopener')
      })
      link.addEventListener('mouseenter', () => {
        link.style.textDecoration = 'underline'
      })
      link.addEventListener('mouseleave', () => {
        link.style.textDecoration = 'none'
      })
    })

    // 概念行折叠/展开
    root.querySelectorAll('.concept-header').forEach((header) => {
      header.addEventListener('click', () => {
        const idx = header.getAttribute('data-idx')
        const newsEl = root.querySelector(`.concept-news[data-idx="${idx}"]`)
        const iconEl = header.querySelector('.expand-icon [data-lucide]')
        if (!newsEl) return
        if (newsEl.style.display === 'none') {
          newsEl.style.display = 'block'
          if (iconEl) iconEl.setAttribute('data-lucide', 'chevron-up')
          expandedRows.add(idx)
        } else {
          newsEl.style.display = 'none'
          if (iconEl) iconEl.setAttribute('data-lucide', 'chevron-down')
          expandedRows.delete(idx)
        }
        refreshIcons()
      })
    })

    const refreshBtn = root.querySelector('#refresh-btn')
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      fetchRemoteData()
      showToast('正在刷新...')
    })

    const historySelect = root.querySelector('#history-select')
    if (historySelect) {
      historySelect.addEventListener('change', () => {
        const value = historySelect.value
        if (value === 'latest') {
          switchToLatest()
        } else {
          switchToDate(value)
        }
      })
    }
  }

  function todayStr() {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  return {
    mount() {
      loadLatestFromHistory()
      render()
      startAutoFetch()
    },
    unmount() {
      stopAutoFetch()
    }
  }
}
