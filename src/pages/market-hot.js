// 大盘热点页面 — 新闻热点排行榜、财经新闻、个股新闻

import { refreshIcons } from '../utils/icons.js'
import { showToast, escHtml } from '../utils/ui.js'
import { lsGetJSON, lsSetJSON, STORAGE_KEYS } from '../utils/storage.js'

const R_UNIT = 1000

function loadHotData() {
  return lsGetJSON('td_market_hot_data', null)
}

function saveHotData(data) {
  lsSetJSON('td_market_hot_data', data)
}

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

// 示例数据：财经新闻
const SAMPLE_FINANCE_NEWS = [
  {
    title: '央行下调存款准备金率0.5个百分点 释放约1万亿流动性',
    summary: '中国人民银行决定于2026年8月15日下调金融机构存款准备金率0.5个百分点，此次降准预计释放长期资金约1万亿元。专家表示，此举将有助于降低金融机构资金成本，增强金融机构信贷投放能力，支持实体经济恢复发展。',
    time: '2026-07-27 09:15',
    source: '央行官网',
    link: '#'
  },
  {
    title: '半导体板块持续走强 行业景气度迎来拐点',
    summary: '受AI算力需求爆发和国产替代加速双重驱动，半导体板块近期持续走强。多家券商研报指出，当前半导体行业库存周期基本见底，下游需求回暖，2026年下半年有望迎来业绩拐点，建议关注设备、材料、设计等细分领域龙头企业。',
    time: '2026-07-27 10:32',
    source: '证券时报',
    link: '#'
  },
  {
    title: '国务院发布促进民间投资若干措施 鼓励民企参与重大工程',
    summary: '国务院办公厅发布《关于进一步促进民间投资若干措施的通知》，提出鼓励民间资本参与国家重大工程和补短板项目，支持民营企业参与新型基础设施、新型城镇化等领域建设，将进一步激发民间投资活力。',
    time: '2026-07-27 11:08',
    source: '新华社',
    link: '#'
  },
  {
    title: '北向资金净流入超80亿 外资连续3日加仓A股',
    summary: '今日北向资金净流入82.3亿元，连续第3个交易日加仓A股。从行业配置看，外资主要加仓半导体、人工智能、新能源等科技成长板块，减仓消费、地产等传统板块。分析师认为，外资持续流入显示对A股长期价值的认可。',
    time: '2026-07-27 14:20',
    source: '财联社',
    link: '#'
  },
  {
    title: '新能源汽车6月销量同比增长35% 渗透率突破40%',
    summary: '中汽协数据显示，6月新能源汽车销量达108.5万辆，同比增长35%，渗透率首次突破40%。其中比亚迪、理想、蔚来等品牌表现亮眼。随着充电基础设施完善和补贴政策持续，预计下半年新能源车销量将继续保持高速增长。',
    time: '2026-07-27 15:45',
    source: '中汽协',
    link: '#'
  }
]

// 示例数据：个股新闻
const SAMPLE_STOCK_NEWS = [
  {
    stockName: '中际旭创',
    stockCode: '300308',
    concept: '半导体',
    title: '中际旭创上半年净利润预增超200% 800G光模块需求爆发',
    time: '2026-07-27 09:30',
    source: '公司公告',
    link: '#'
  },
  {
    stockName: '科大讯飞',
    stockCode: '002230',
    concept: '人工智能',
    title: '科大讯飞星火大模型V4.5发布 多项核心指标超越GPT-4',
    time: '2026-07-27 10:15',
    source: '科技日报',
    link: '#'
  },
  {
    stockName: '新易盛',
    stockCode: '300502',
    concept: 'CPO概念',
    title: '新易盛获海外大客户1.6T光模块订单 产能已排至2027年',
    time: '2026-07-27 11:22',
    source: '券商研报',
    link: '#'
  },
  {
    stockName: '兆易创新',
    stockCode: '603986',
    concept: '汽车芯片',
    title: '兆易创新车规级MCU量产 已导入多家头部车企供应链',
    time: '2026-07-27 13:48',
    source: '界面新闻',
    link: '#'
  },
  {
    stockName: '阳光电源',
    stockCode: '300274',
    concept: '光伏设备',
    title: '阳光电源储能业务出海加速 海外订单占比超60%',
    time: '2026-07-27 14:35',
    source: '财联社',
    link: '#'
  },
  {
    stockName: '贵州茅台',
    stockCode: '600519',
    concept: '白酒概念',
    title: '贵州茅台半年报：营收同比增长12% 批价企稳信号显现',
    time: '2026-07-27 16:00',
    source: '公司公告',
    link: '#'
  }
]

function fmtChange(val) {
  const color = val > 0 ? 'var(--state-error)' : val < 0 ? 'var(--state-success)' : 'var(--ink-3)'
  const prefix = val > 0 ? '+' : ''
  return { text: prefix + val.toFixed(2) + '%', color }
}

function renderConceptRank(concepts) {
  const data = concepts || SAMPLE_CONCEPTS
  return `
    <div class="mb-4 flex items-center gap-2">
      <i data-lucide="flame" style="width:18px; height:18px; color:var(--state-error);"></i>
      <span style="font-size:var(--text-body); color:var(--ink-3);">按涨幅排序 · 共 ${data.length} 条</span>
    </div>
    <div class="overflow-x-auto">
      <table style="width:100%; border-collapse:separate; border-spacing:0; font-size:var(--text-caption);">
        <thead>
          <tr style="background:var(--surface); color:var(--ink-3);">
            <th style="padding:var(--s-3); text-align:left; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">排名</th>
            <th style="padding:var(--s-3); text-align:left; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">概念名称</th>
            <th style="padding:var(--s-3); text-align:right; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">概念指数</th>
            <th style="padding:var(--s-3); text-align:right; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">涨跌幅</th>
            <th style="padding:var(--s-3); text-align:right; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">流入资金</th>
            <th style="padding:var(--s-3); text-align:right; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">流出资金</th>
            <th style="padding:var(--s-3); text-align:right; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">净额</th>
            <th style="padding:var(--s-3); text-align:right; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">成份股</th>
            <th style="padding:var(--s-3); text-align:left; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">领涨股</th>
            <th style="padding:var(--s-3); text-align:right; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">领涨幅</th>
            <th style="padding:var(--s-3); text-align:right; font-weight:var(--weight-medium); border-bottom:1px solid var(--line); white-space:nowrap;">领涨价</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((c, i) => {
            const change = fmtChange(c.changePercent)
            const leadChange = fmtChange(c.leadingChange)
            const rankColor = i < 3 ? 'var(--state-error)' : 'var(--ink-3)'
            return `
              <tr style="background:var(--bg); transition:background 0.15s;" onmouseenter="this.style.background='var(--surface)'" onmouseleave="this.style.background='var(--bg)'">
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line);">
                  <span style="font-weight:var(--weight-bold); color:${rankColor}; font-size:var(--text-body);">${i + 1}</span>
                </td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); white-space:nowrap;">
                  <span style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--ink);">${escHtml(c.name)}</span>
                </td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink-2); white-space:nowrap;">${c.index.toFixed(2)}</td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; font-weight:var(--weight-semibold); color:${change.color}; white-space:nowrap;">${change.text}</td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; color:var(--state-error); white-space:nowrap;">${escHtml(c.inflow)}</td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; color:var(--state-success); white-space:nowrap;">${escHtml(c.outflow)}</td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; font-weight:var(--weight-semibold); color:${c.netColor}; white-space:nowrap;">${escHtml(c.netAmount)}</td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); text-align:right; color:var(--ink-2); white-space:nowrap;">${c.stockCount}只</td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); white-space:nowrap;">
                  <div style="display:flex; flex-direction:column;">
                    <span style="font-size:var(--text-body); font-weight:var(--weight-medium); color:var(--ink);">${escHtml(c.leadingStock)}</span>
                    <span style="font-size:11px; color:var(--ink-3); font-family:var(--font-mono);">${escHtml(c.leadingCode)}</span>
                  </div>
                </td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; font-weight:var(--weight-semibold); color:${leadChange.color}; white-space:nowrap;">${leadChange.text}</td>
                <td style="padding:var(--s-3); border-bottom:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; color:var(--ink); white-space:nowrap;">${c.leadingPrice.toFixed(2)}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
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
          <div style="background:var(--brand-bg); border-left:3px solid var(--brand); border-radius:0 var(--r-sm) var(--r-sm) 0; padding:var(--s-2) var(--s-3); margin-bottom:var(--s-3);">
            <p style="font-size:var(--text-body); line-height:1.6; color:var(--brand); font-weight:var(--weight-medium);">${escHtml(n.summary)}</p>
          </div>
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

function renderStockNews(news) {
  const data = news || SAMPLE_STOCK_NEWS
  return `
    <div class="flex flex-col gap-3">
      ${data.map((n) => {
        const change = fmtChange(0) // placeholder
        return `
          <a href="${escHtml(n.link)}" target="_blank" rel="noopener" style="display:block; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--s-4) var(--s-5); text-decoration:none; transition:border-color 0.15s;" onmouseenter="this.style.borderColor='var(--brand)'" onmouseleave="this.style.borderColor='var(--line)'">
            <div class="flex items-center gap-3 mb-3 flex-wrap">
              <span style="font-size:var(--text-body); font-weight:var(--weight-bold); color:var(--brand);">${escHtml(n.stockName)}</span>
              <span style="font-size:var(--text-caption); color:var(--ink-3); font-family:var(--font-mono);">${escHtml(n.stockCode)}</span>
              <span class="inline-flex items-center px-2 py-0.5" style="font-size:11px; border-radius:var(--r-sm); background:var(--brand-bg); color:var(--brand); font-weight:var(--weight-medium);">${escHtml(n.concept)}</span>
            </div>
            <div class="flex items-start justify-between gap-2 mb-3">
              <h4 style="font-size:var(--text-body); font-weight:var(--weight-semibold); color:var(--ink); line-height:1.5; flex:1;">${escHtml(n.title)}</h4>
              <i data-lucide="external-link" style="width:14px; height:14px; color:var(--ink-3); flex-shrink:0; margin-top:3px;"></i>
            </div>
            <div class="flex items-center gap-4 flex-wrap">
              <span style="font-size:var(--text-caption); color:var(--ink-3); display:inline-flex; align-items:center; gap:4px;">
                <i data-lucide="clock" style="width:12px; height:12px;"></i>
                ${escHtml(n.time)}
              </span>
              <span style="font-size:var(--text-caption); color:var(--ink-2); font-weight:var(--weight-medium); display:inline-flex; align-items:center; gap:4px;">
                <i data-lucide="radio" style="width:12px; height:12px;"></i>
                来源：${escHtml(n.source)}
              </span>
            </div>
          </a>
        `
      }).join('')}
    </div>
  `
}

export function createMarketHotPage(root) {
  let activeTab = 'rank'
  let importedData = loadHotData()
  let remoteData = null
  let remoteFetching = false
  let autoFetchTimer = null

  // 自动从仓库 fetch 远程数据
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
        remoteData = data
        render()
      }
    } catch (e) {
      // 静默失败，不影响页面
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

  function getConcepts() {
    const src = remoteData || importedData
    return src?.concepts?.length > 0 ? src.concepts : SAMPLE_CONCEPTS
  }
  function getFinanceNews() {
    const src = remoteData || importedData
    return src?.financeNews?.length > 0 ? src.financeNews : SAMPLE_FINANCE_NEWS
  }
  function getStockNews() {
    const src = remoteData || importedData
    return src?.stockNews?.length > 0 ? src.stockNews : SAMPLE_STOCK_NEWS
  }
  function getDataDate() {
    const src = remoteData || importedData
    return src?.date || null
  }
  function hasImportedData() {
    const src = remoteData || importedData
    return !!(src && (src.concepts?.length || src.financeNews?.length || src.stockNews?.length))
  }
  function isRemoteData() {
    return !!remoteData
  }

  function render() {
    const concepts = getConcepts()
    const financeNews = getFinanceNews()
    const stockNews = getStockNews()
    const dataDate = getDataDate()
    const isImported = hasImportedData()
    const isRemote = isRemoteData()

    root.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <h2 style="font-size:var(--text-h2); font-weight:var(--weight-semibold); color:var(--ink); letter-spacing:-0.015em;">大盘热点</h2>
          ${isRemote ? '<span style="font-size:var(--text-caption); color:var(--brand); background:var(--brand-muted); padding:2px 8px; border-radius:var(--r-pill); display:inline-flex; align-items:center; gap:4px;"><i data-lucide="wifi" style="width:10px; height:10px;"></i>自动同步</span>' : isImported ? '<span style="font-size:var(--text-caption); color:var(--state-success); background:var(--state-success-bg); padding:2px 8px; border-radius:var(--r-pill);">已导入数据</span>' : ''}
        </div>
        <div class="flex items-center gap-3">
          <span style="font-size:var(--text-caption); color:var(--ink-3); display:inline-flex; align-items:center; gap:4px;">
            <i data-lucide="info" style="width:12px; height:12px;"></i>
            ${dataDate ? '数据日期: ' + dataDate : '示例数据'}
          </span>
          <button id="import-data-btn" class="flex items-center gap-2 px-3 h-8" style="background:var(--surface); color:var(--ink); border:1px solid var(--line); border-radius:var(--r-md); font-size:var(--text-caption); font-weight:var(--weight-medium); cursor:pointer;">
            <i data-lucide="upload" style="width:14px; height:14px;"></i>
            导入数据
          </button>
          ${isImported ? `
            <button id="clear-data-btn" class="flex items-center gap-2 px-3 h-8" style="background:var(--surface); color:var(--state-error); border:1px solid var(--line); border-radius:var(--r-md); font-size:var(--text-caption); font-weight:var(--weight-medium); cursor:pointer;">
              <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
              清空
            </button>
          ` : ''}
        </div>
      </div>

      <div class="flex gap-2 mb-6 p-1" style="background:var(--surface); border-radius:var(--r-md); width:fit-content;">
        <button id="tab-rank" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="rank" style="${activeTab === 'rank' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'}">
          <i data-lucide="trending-up" style="width:14px; height:14px; margin-right:6px;"></i>
          新闻热点
        </button>
        <button id="tab-finance" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="finance" style="${activeTab === 'finance' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'}">
          <i data-lucide="newspaper" style="width:14px; height:14px; margin-right:6px;"></i>
          财经新闻
        </button>
        <button id="tab-stock" class="tab-btn px-4 py-2 rounded-md font-medium transition-all" data-tab="stock" style="${activeTab === 'stock' ? 'background:var(--bg); color:var(--ink); box-shadow:var(--shadow-sm);' : 'color:var(--ink-3);'}">
          <i data-lucide="file-text" style="width:14px; height:14px; margin-right:6px;"></i>
          个股新闻
        </button>
      </div>

      ${activeTab === 'rank' ? renderConceptRank(concepts) : ''}
      ${activeTab === 'finance' ? renderFinanceNews(financeNews) : ''}
      ${activeTab === 'stock' ? renderStockNews(stockNews) : ''}

      <div style="background:var(--surface-2); border-left:3px solid var(--brand); border-radius:0 var(--r-md) var(--r-md) 0; padding:var(--s-4) var(--s-5); margin-top:var(--s-6);">
        <p style="font-size:var(--text-caption); font-weight:var(--weight-semibold); color:var(--brand); margin-bottom:var(--s-2); letter-spacing:0.02em;">数据说明</p>
        <p style="font-size:var(--text-body); line-height:var(--leading-body); color:var(--ink-2);">点击「导入数据」按钮，粘贴 MCP 服务器生成的热点数据 JSON，即可展示真实行情。数据格式：<code style="background:var(--bg); padding:2px 6px; border-radius:var(--r-sm); font-size:var(--text-caption);">{'{ concepts: [...], financeNews: [...], stockNews: [...] }'}</code></p>
      </div>
    `
    refreshIcons()
    bindEvents()
  }

  function bindEvents() {
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab')
        render()
      })
    })

    const importBtn = root.querySelector('#import-data-btn')
    if (importBtn) importBtn.addEventListener('click', openImportDialog)

    const clearBtn = root.querySelector('#clear-data-btn')
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (confirm('确认清空导入的数据？将恢复为示例数据。')) {
        importedData = null
        saveHotData(null)
        render()
        showToast('已清空')
      }
    })
  }

  let importDialogEl = null
  let importOverlayEl = null

  function openImportDialog() {
    closeImportDialog()
    importOverlayEl = document.createElement('div')
    importOverlayEl.style.cssText = 'position:fixed; inset:0; z-index:99; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; padding:16px;'
    importOverlayEl.addEventListener('click', (e) => { if (e.target === importOverlayEl) closeImportDialog() })

    importDialogEl = document.createElement('div')
    importDialogEl.style.cssText = `background:var(--bg); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-float); padding:var(--s-5) var(--s-6); width:min(640px, 100%); max-height:90vh; overflow-y:auto;`
    importDialogEl.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 style="font-size:var(--text-h3); font-weight:var(--weight-semibold); color:var(--ink);">导入大盘热点数据</h3>
        <button id="close-import-dialog" style="background:none; border:none; cursor:pointer; color:var(--ink-3); padding:2px;">
          <i data-lucide="x" style="width:16px; height:16px;"></i>
        </button>
      </div>
      <div style="margin-bottom:var(--s-4); padding:var(--s-3); background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm);">
        <p style="font-size:var(--text-caption); color:var(--ink-2); line-height:var(--leading-body);">
          <strong style="color:var(--brand);">使用方法：</strong>
          运行 MCP 服务器的 <code style="background:var(--bg); padding:1px 4px; border-radius:3px;">run_hotspot_report()</code> 获取报告，将返回的 JSON 数据粘贴到下方文本框。
        </p>
        <p style="font-size:var(--text-caption); color:var(--ink-3); margin-top:4px;">
          也可以直接粘贴数据对象，格式：<br>
          <code style="background:var(--bg); padding:1px 4px; border-radius:3px; display:block; margin-top:4px;">{ "concepts": [...], "financeNews": [...], "stockNews": [...] }</code>
        </p>
      </div>
      <textarea id="import-json-text" rows="10" placeholder="在此粘贴 JSON 数据..." style="width:100%; font-family:var(--font-mono); font-size:12px; padding:var(--s-3); border:1px solid var(--line); border-radius:var(--r-sm); background:var(--surface); color:var(--ink); resize:vertical;"></textarea>
      <div class="flex items-center gap-2 justify-end pt-3">
        <button id="cancel-import-dialog" class="btn-secondary">取消</button>
        <button id="confirm-import-dialog" class="btn-primary">解析并导入</button>
      </div>
    `
    importOverlayEl.appendChild(importDialogEl)
    document.body.appendChild(importOverlayEl)
    refreshIcons()

    importDialogEl.querySelector('#close-import-dialog').addEventListener('click', closeImportDialog)
    importDialogEl.querySelector('#cancel-import-dialog').addEventListener('click', closeImportDialog)
    importDialogEl.querySelector('#confirm-import-dialog').addEventListener('click', () => {
      const text = importDialogEl.querySelector('#import-json-text').value.trim()
      if (!text) { showToast('请粘贴数据'); return }
      try {
        const parsed = tryParseImport(text)
        if (!parsed) { showToast('数据格式无法识别'); return }
        importedData = parsed
        saveHotData(importedData)
        closeImportDialog()
        render()
        showToast('数据导入成功')
      } catch (e) {
        showToast('解析失败: ' + e.message)
      }
    })
  }

  function tryParseImport(text) {
    // Try direct JSON parse
    try {
      const obj = JSON.parse(text)
      return normalizeData(obj)
    } catch (e) {}

    // Try to extract JSON from MCP response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0])
        return normalizeData(obj)
      } catch (e) {}
    }

    return null
  }

  function normalizeData(obj) {
    // Handle MCP hotspot report format
    if (obj.md_report || obj.stdout_tail) {
      // This is the MCP run_hotspot_report output - try to parse embedded data
      // For now, extract what we can from the stdout
      if (obj.stdout_tail) {
        const extracted = extractFromText(obj.stdout_tail)
        if (extracted) return extracted
      }
      // If no extractable data, return sample-like structure
      return { concepts: [], financeNews: [], stockNews: [], date: todayStr() }
    }

    // Direct data format
    const concepts = obj.concepts || obj.sectors || obj.hotSectors || []
    const financeNews = obj.financeNews || obj.news || obj.articles || []
    const stockNews = obj.stockNews || obj.stockArticles || obj.singleStockNews || []
    const date = obj.date || obj.reportDate || todayStr()

    if (concepts.length === 0 && financeNews.length === 0 && stockNews.length === 0) {
      return null
    }

    return {
      concepts: concepts.map(normalizeConcept),
      financeNews: financeNews.map(normalizeFinanceNews),
      stockNews: stockNews.map(normalizeStockNews),
      date
    }
  }

  function todayStr() {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  function normalizeConcept(c) {
    return {
      name: c.name || c.conceptName || '未知',
      index: c.index || c.conceptIndex || 0,
      changePercent: c.changePercent || c.change || c.pctChange || 0,
      inflow: c.inflow || c.inflowAmount || '0',
      outflow: c.outflow || c.outflowAmount || '0',
      netAmount: c.netAmount || c.netNet || '0',
      netColor: (c.netAmount && parseFloat(c.netAmount) < 0) ? 'var(--state-success)' : 'var(--state-error)',
      stockCount: c.stockCount || c.count || 0,
      leadingStock: c.leadingStock || c.leaderName || '--',
      leadingCode: c.leadingCode || c.leaderCode || '',
      leadingChange: c.leadingChange || c.leaderChange || 0,
      leadingPrice: c.leadingPrice || c.leaderPrice || 0
    }
  }

  function normalizeFinanceNews(n) {
    return {
      title: n.title || n.headline || '无标题',
      summary: n.summary || n.digest || n.description || '',
      time: n.time || n.publishTime || n.date || '',
      source: n.source || n.origin || '未知来源',
      link: n.link || n.url || '#'
    }
  }

  function normalizeStockNews(n) {
    return {
      stockName: n.stockName || n.name || '未知',
      stockCode: n.stockCode || n.code || '',
      concept: n.concept || n.sector || '',
      title: n.title || n.headline || '无标题',
      time: n.time || n.publishTime || n.date || '',
      source: n.source || n.origin || '未知来源',
      link: n.link || n.url || '#'
    }
  }

  function extractFromText(text) {
    // Try to extract data from markdown or plain text reports
    const concepts = []
    const financeNews = []
    const stockNews = []

    // Look for concept/board sections
    const conceptSection = text.match(/概念板块[^\n]*\n([\s\S]*?)(?=\n\n|\n##|\n财经|\n$)/)
    if (conceptSection) {
      const lines = conceptSection[1].split('\n').filter(l => l.trim())
      lines.forEach((line, i) => {
        if (i < 20 && line.includes('|')) {
          const parts = line.split('|').map(p => p.trim()).filter(Boolean)
          if (parts.length >= 3 && isNaN(parseFloat(parts[0]))) {
            concepts.push({
              name: parts[0],
              index: parseFloat(parts[1]) || 0,
              changePercent: parseFloat(parts[2]) || 0,
              inflow: parts[3] || '0',
              outflow: parts[4] || '0',
              netAmount: parts[5] || '0',
              netColor: (parts[5] && parts[5].includes('-')) ? 'var(--state-success)' : 'var(--state-error)',
              stockCount: parseInt(parts[6]) || 0,
              leadingStock: parts[7] || '--',
              leadingCode: '',
              leadingChange: parseFloat(parts[8]) || 0,
              leadingPrice: parseFloat(parts[9]) || 0
            })
          }
        }
      })
    }

    // If we found data, return it
    if (concepts.length || financeNews.length || stockNews.length) {
      return {
        concepts,
        financeNews,
        stockNews,
        date: todayStr()
      }
    }

    return null
  }

  function closeImportDialog() {
    if (importOverlayEl && importOverlayEl.parentNode) importOverlayEl.parentNode.removeChild(importOverlayEl)
    importOverlayEl = null
    importDialogEl = null
  }

  return {
    mount() {
      render()
      startAutoFetch()
    },
    unmount() {
      stopAutoFetch()
      closeImportDialog()
    }
  }
}
