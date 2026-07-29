// localStorage helpers with safe fallbacks

export function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key)
    return v !== null ? v : fallback
  } catch (e) {
    return fallback
  }
}

export function lsGetJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch (e) {
    return fallback
  }
}

export function lsSet(key, val) {
  try {
    localStorage.setItem(key, val)
  } catch (e) {}
}

export function lsSetJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch (e) {}
}

// Shared storage keys across pages
export const STORAGE_KEYS = {
  dailyReview: 'td_daily_review_v2',
  actionPlan: 'td_action_plan_v2',
  plans: 'td_plans_v1',
  logicLibrary: 'td_logic_library',
  stageGoals: 'td_stage_goals',
  favorites: 'td_favorites_v1',
  tradeRecords: 'td_trade_records_v1',
  holdings: 'td_holdings_v1',
  riskCtrl: 'td_risk_ctrl_',
  availableFund: 'td_available_fund',
  // 每日总资产快照 { '2026-07-29': 150000, ... }
  assetSnapshots: 'td_asset_snapshots',
  // 资金转入转出流水 [{ date, type:'in'|'out', amount, ts }, ...]
  fundFlows: 'td_fund_flows',
  theme: 'td_theme'
}
