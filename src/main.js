// Application entry — wires the app shell and registers all pages.

import './styles/main.css'

import { renderShell, registerPage } from './components/layout.js'
import { createOverviewPage } from './pages/overview.js'
import { createPositionCheckPage } from './pages/position-check.js'
import { createOrderPlanPage } from './pages/order-plan.js'
import { createExecutionPage } from './pages/execution.js'
import { createTradeRecordsPage } from './pages/trade-records.js'
import { createRiskControlPage } from './pages/risk-control.js'
import { createLogicLibraryPage } from './pages/logic-library.js'
import { createMarketHotPage } from './pages/market-hot.js'
import { createDataManagementPage } from './pages/data-management.js'

const app = document.getElementById('app')

registerPage('overview', createOverviewPage)
registerPage('position', createPositionCheckPage)
registerPage('logic', createLogicLibraryPage)
registerPage('plan', createOrderPlanPage)
registerPage('execution', createExecutionPage)
registerPage('records', createTradeRecordsPage)
registerPage('risk', createRiskControlPage)
registerPage('market', createMarketHotPage)
registerPage('data', createDataManagementPage)

renderShell(app)
