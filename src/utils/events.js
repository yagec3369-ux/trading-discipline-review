const listeners = {}

export function on(eventName, callback) {
  if (!listeners[eventName]) listeners[eventName] = []
  listeners[eventName].push(callback)
}

export function off(eventName, callback) {
  if (!listeners[eventName]) return
  listeners[eventName] = listeners[eventName].filter((cb) => cb !== callback)
}

export function emit(eventName, data) {
  if (!listeners[eventName]) return
  listeners[eventName].forEach((cb) => cb(data))
}

export const DATA_EVENTS = {
  HOLDINGS_CHANGED: 'holdings_changed',
  TRADE_RECORDS_CHANGED: 'trade_records_changed',
  PLANS_CHANGED: 'plans_changed',
  RISK_CTRL_CHANGED: 'risk_ctrl_changed',
  ACTION_PLAN_CHANGED: 'action_plan_changed',
}

export function notifyDataChange(eventName) {
  emit(eventName, { timestamp: Date.now() })
}