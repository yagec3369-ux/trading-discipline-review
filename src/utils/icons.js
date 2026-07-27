// Lucide icon helper — re-creates icons after DOM updates.
// Only the icons used across the app are imported to keep the bundle small.
import {
  createIcons,
  ShieldCheck,
  Sun,
  Moon,
  SunMoon,
  BarChart3,
  ClipboardCheck,
  Target,
  BookOpen,
  Activity,
  AlertTriangle,
  Timer,
  Landmark,
  TrendingUp,
  Wallet,
  Coins,
  PieChart,
  ArrowDownUp,
  CalendarRange,
  Search,
  CheckCircle,
  Flame,
  Shield,
  PlusCircle,
  Check,
  Star,
  Plus,
  Flag,
  X,
  BarChart2,
  FileText,
  History,
  ChevronRight,
  Info,
  Crosshair,
  Bookmark,
  Scale,
  RefreshCw,
  HelpCircle,
  Save,
  Trash2,
  ListChecks,
  Clock,
  CheckCircle2,
  XCircle,
  Archive,
  Inbox,
  ChevronDown,
  Send,
  Edit3,
  Brain,
  Bot,
  Rss,
  Menu,
  UploadCloud,
  DownloadCloud
} from 'lucide'

const icons = {
  ShieldCheck,
  Sun,
  Moon,
  SunMoon,
  BarChart3,
  ClipboardCheck,
  Target,
  BookOpen,
  Activity,
  AlertTriangle,
  Timer,
  Landmark,
  TrendingUp,
  Wallet,
  Coins,
  PieChart,
  ArrowDownUp,
  CalendarRange,
  Search,
  CheckCircle,
  Flame,
  Shield,
  PlusCircle,
  Check,
  Star,
  Plus,
  Flag,
  X,
  BarChart2,
  FileText,
  History,
  ChevronRight,
  Info,
  Crosshair,
  Bookmark,
  Scale,
  RefreshCw,
  HelpCircle,
  Save,
  Trash2,
  ListChecks,
  Clock,
  CheckCircle2,
  XCircle,
  Archive,
  Inbox,
  ChevronDown,
  Send,
  Edit3,
  Brain,
  Bot,
  Rss,
  Menu,
  UploadCloud,
  DownloadCloud
}

let pending = false
export function refreshIcons() {
  if (pending) return
  pending = true
  requestAnimationFrame(() => {
    pending = false
    createIcons({ icons })
  })
}

// Delegated global focus styles for inputs
let focusBound = false
export function bindFocusStyles() {
  if (focusBound) return
  focusBound = true
  document.addEventListener('focusin', (e) => {
    if (e.target.matches && e.target.matches('input, textarea, select') && e.target.style.border) {
      e.target.style.borderColor = 'var(--brand)'
      e.target.style.boxShadow = '0 0 0 2px var(--brand-muted)'
    }
  })
  document.addEventListener('focusout', (e) => {
    if (e.target.matches && e.target.matches('input, textarea, select') && e.target.style.border) {
      e.target.style.borderColor = 'var(--line)'
      e.target.style.boxShadow = 'none'
    }
  })
}
