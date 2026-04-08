import { useMemo, useState, useEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Activity, ChevronUp, ChevronDown,
} from "lucide-react";
import { useStore } from "../store/useStore";
import AnimatedNumber from "../components/AnimatedNumber";
import SavingsProgressCard from "../components/SavingsProgressCard";
import { categoryColors, type Category } from "../data/transactions";
import PetWidget from "../components/PetWidget";
import { getPetById } from "../data/pets";
import { fetchDashboardStats } from "../api/mockApi";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

// Time-of-day greeting — computed once at render, no interval needed
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Pet config lives at module level — no object allocation on re-render
// Isolated clock component — re-renders every second without affecting Dashboard
const DigitalClock = memo(function DigitalClock() {
  const theme = useStore((s) => s.theme);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const textSecondary = theme === "dark" ? "text-on-surface-variant" : "text-gray-500";
  return (
    <div className={`shrink-0 rounded-2xl px-4 py-3 text-right ${
      theme === "dark" ? "bg-surface-container-low" : "bg-white shadow-sm"
    }`}>
      <div
        className="text-2xl lg:text-3xl font-extrabold tracking-widest tabular-nums"
        style={{
          fontFamily: "'Courier New', Courier, monospace",
          color: theme === "dark" ? "#a6ef27" : "#456900",
          textShadow: theme === "dark" ? "0 0 12px rgba(166,239,39,0.5)" : "none",
        }}
      >
        {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </div>
      <div className={`text-xs mt-0.5 font-semibold tracking-wider uppercase ${textSecondary}`}>
        {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
});

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

// Stable tooltip reference — prevents Recharts re-rendering on every chart hover
const ChartTooltip = memo(function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  const theme = useStore((s) => s.theme);
  const currencySymbol = useStore((s) => s.appSettings.currencySymbol);
  if (!active || !payload?.length) return null;
  const isDark = theme === "dark";
  return (
    <div className={`${isDark ? "bg-surface-container-highest" : "bg-white"} px-4 py-3 rounded-xl shadow-xl border ${isDark ? "border-outline-variant/20" : "border-gray-200"}`}>
      <p className={`text-xs font-semibold mb-1 ${isDark ? "text-on-surface" : "text-gray-900"}`}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {currencySymbol}{p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
});

export default function Dashboard() {
  const transactions = useStore((s) => s.transactions);
  const theme = useStore((s) => s.theme);
  const role = useStore((s) => s.role);
  const dailySpending = useStore((s) => s.dailySpending);
  const customCategories = useStore((s) => s.customCategories);
  const userProfile = useStore((s) => s.userProfile);
  const setUserProfile = useStore((s) => s.setUserProfile);
  const { savedThisMonth } = userProfile;
  const { currencySymbol, userName, selectedPet } = useStore((s) => s.appSettings);
  const firstName = userName.trim().split(/\s+/)[0] || "Friend";
  const dataAdjustments = useStore((s) => s.dataAdjustments);
  const setDataAdjustments = useStore((s) => s.setDataAdjustments);
  const adjustCategory = useStore((s) => s.adjustCategory);
  const { netWorthAdjustment, incomeAdjustment, expenseAdjustment, categoryAdjustments } = dataAdjustments;

  // Drag ref for account breakdown split bar
  const splitBarRef = useRef<HTMLDivElement>(null);
  const splitDragging = useRef(false);

  const handleSplitBarMouseDown = useCallback((e: React.MouseEvent) => {
    if (role !== "admin") return;
    splitDragging.current = true;
    e.preventDefault();
    const updateFromMouse = (clientX: number) => {
      if (!splitBarRef.current) return;
      const rect = splitBarRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      // map fraction across total net worth
      const total = Math.abs(stats.balance + netWorthAdjustment + incomeAdjustment - expenseAdjustment) || 10000;
      setUserProfile({ savedThisMonth: Math.round(fraction * total) });
    };
    const onMouseMove = (ev: MouseEvent) => { if (splitDragging.current) updateFromMouse(ev.clientX); };
    const onMouseUp = () => {
      splitDragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    updateFromMouse(e.clientX);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, setUserProfile]);

  const [balancePeriod, setBalancePeriod] = useState<1 | 3 | 6>(6);
  const [showTodayBubble, setShowTodayBubble] = useState(false);
  const bubbleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePetClick = () => {
    setShowTodayBubble(true);
    if (bubbleTimeout.current) clearTimeout(bubbleTimeout.current);
    bubbleTimeout.current = setTimeout(() => setShowTodayBubble(false), 3500);
  };

  // O(1) color lookup — rebuilt only when customCategories changes
  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = { ...(categoryColors as Record<string, string>) };
    customCategories.forEach((c) => { map[c.name] = c.color; });
    return map;
  }, [customCategories]);

  const getCategoryColor = useCallback((name: string) =>
    categoryColorMap[name] ?? "#757480", [categoryColorMap]);

  // Computed stats
  const stats = useMemo(() => {
    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIncome - totalExpense;

    // Last month comparison
    const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort();
    const lastMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];

    const lastMonthIncome = transactions
      .filter((t) => t.type === "income" && t.date.startsWith(lastMonth))
      .reduce((sum, t) => sum + t.amount, 0);
    const prevMonthIncome = transactions
      .filter((t) => t.type === "income" && t.date.startsWith(prevMonth))
      .reduce((sum, t) => sum + t.amount, 0);
    const incomeChange = prevMonthIncome ? ((lastMonthIncome - prevMonthIncome) / prevMonthIncome) * 100 : 0;

    const lastMonthExpense = transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(lastMonth))
      .reduce((sum, t) => sum + t.amount, 0);
    const prevMonthExpense = transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(prevMonth))
      .reduce((sum, t) => sum + t.amount, 0);
    const expenseChange = prevMonthExpense ? ((lastMonthExpense - prevMonthExpense) / prevMonthExpense) * 100 : 0;

    // Month-over-month savings growth
    const lastMonthSavings = lastMonthIncome - lastMonthExpense;
    const prevMonthSavings = prevMonthIncome - prevMonthExpense;
    const savingsGrowth = prevMonthSavings !== 0
      ? ((lastMonthSavings - prevMonthSavings) / Math.abs(prevMonthSavings)) * 100
      : 0;

    return { totalIncome, totalExpense, balance, incomeChange, expenseChange, savingsGrowth };
  }, [transactions]);

  // Shared monthly aggregation — single O(n) pass, reused by both chart memos below
  const monthlyBase = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    transactions.forEach((t) => {
      const month = t.date.slice(0, 7);
      const cur = map.get(month) ?? { income: 0, expense: 0 };
      if (t.type === "income") cur.income += t.amount;
      else cur.expense += t.amount;
      map.set(month, cur);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [transactions]);

  // Monthly balance trend — last entry reflects live adjustments
  const balanceTrend = useMemo(() => {
    let runningBalance = 0;
    return monthlyBase.map(([month, data], idx) => {
      const isLast = idx === monthlyBase.length - 1;
      const adjIncome  = isLast ? data.income  + incomeAdjustment  : data.income;
      const adjExpense = isLast ? data.expense + expenseAdjustment : data.expense;
      runningBalance += adjIncome - adjExpense;
      return {
        month:   new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
        income:  Math.round(adjIncome),
        expense: Math.round(adjExpense),
        balance: Math.round(runningBalance) + (isLast ? netWorthAdjustment : 0),
      };
    });
  }, [monthlyBase, incomeAdjustment, expenseAdjustment, netWorthAdjustment]);

  // Spending by category (merge transactions + daily spending + category adjustments)
  const spendingByCategory = useMemo(() => {
    const catMap = new Map<string, number>();
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        catMap.set(t.category, (catMap.get(t.category) || 0) + t.amount);
      });
    dailySpending.forEach((entry) => {
      catMap.set(entry.category, (catMap.get(entry.category) || 0) + entry.amount);
    });
    // Apply category adjustments from admin controls
    Object.entries(categoryAdjustments).forEach(([cat, delta]) => {
      if (delta !== 0) catMap.set(cat, (catMap.get(cat) || 0) + delta);
    });
    return Array.from(catMap.entries())
      .map(([name, value]) => ({
        name,
        value: Math.max(0, Math.round(value)),
        color: getCategoryColor(name),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, dailySpending, customCategories, categoryAdjustments]);

  // Month-to-date variable expense progress (Rent & Bills excluded — shown separately as fixed costs)
  const monthlyExpenseProgress = useMemo(() => {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort();
    if (months.length < 2) return null;
    const currentMonth = months[months.length - 1];
    const prevMonths = months.slice(0, -1);

    const isVariable = (cat: string) => cat !== "Rent" && cat !== "Bills";

    // Variable MTD: excludes Rent & Bills
    const currentMTD = transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(currentMonth) && parseInt(t.date.slice(8, 10)) <= dayOfMonth && isVariable(t.category))
      .reduce((sum, t) => sum + t.amount, 0);

    const prevMTDs = prevMonths.map((m) =>
      transactions
        .filter((t) => t.type === "expense" && t.date.startsWith(m) && parseInt(t.date.slice(8, 10)) <= dayOfMonth && isVariable(t.category))
        .reduce((sum, t) => sum + t.amount, 0)
    );

    const avgMTD = prevMTDs.reduce((a, b) => a + b, 0) / prevMTDs.length;
    const pct = avgMTD > 0 ? (currentMTD / avgMTD) * 100 : 100;

    // Variable monthly average (excluding Rent & Bills)
    const allVariableTotals = months.map((m) =>
      transactions
        .filter((t) => t.type === "expense" && t.date.startsWith(m) && isVariable(t.category))
        .reduce((sum, t) => sum + t.amount, 0)
    );
    const avgMonthlyExpense = allVariableTotals.reduce((a, b) => a + b, 0) / allVariableTotals.length;

    // Fixed costs: Rent + Bills for current month
    const currentMonthFixed = transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(currentMonth) && !isVariable(t.category))
      .reduce((sum, t) => sum + t.amount, 0);

    // Average fixed costs across all months
    const avgMonthlyFixed = months.map((m) =>
      transactions
        .filter((t) => t.type === "expense" && t.date.startsWith(m) && !isVariable(t.category))
        .reduce((sum, t) => sum + t.amount, 0)
    ).reduce((a, b) => a + b, 0) / months.length;

    let quote: string;
    let quoteColor: string;
    if (pct < 75) {
      quote = "Excellent! Variable spending well under pace.";
      quoteColor = "text-primary-dim";
    } else if (pct < 95) {
      quote = "Great job — variable spending on track.";
      quoteColor = "text-primary-dim";
    } else if (pct < 110) {
      quote = "Right on pace — stay mindful this month.";
      quoteColor = "text-yellow-400";
    } else if (pct < 130) {
      quote = "Slightly over average — consider slowing down.";
      quoteColor = "text-orange-400";
    } else {
      quote = "Overspending alert! Time to pull back.";
      quoteColor = "text-error";
    }

    return { currentMTD, avgMTD, avgMonthlyExpense, currentMonthFixed, avgMonthlyFixed, pct, quote, quoteColor, dayOfMonth };
  }, [transactions]);

  // Recent transactions
  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5),
    [transactions]
  );

  // Income vs Expense monthly bars — reuses monthlyBase, no extra O(n) traversal
  const monthlyComparison = useMemo(() => {
    return monthlyBase.map(([month, data], idx) => {
      const isLast = idx === monthlyBase.length - 1;
      return {
        month:   new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
        income:  Math.round(isLast ? data.income  + incomeAdjustment  : data.income),
        expense: Math.round(isLast ? data.expense + expenseAdjustment : data.expense),
      };
    });
  }, [monthlyBase, incomeAdjustment, expenseAdjustment]);

  const cardBg = theme === "dark" ? "bg-surface-container-low" : "bg-white shadow-sm";
  const textPrimary = theme === "dark" ? "text-on-surface" : "text-gray-900";
  const textSecondary = theme === "dark" ? "text-on-surface-variant" : "text-gray-500";
  const skeletonBg = theme === "dark" ? "bg-surface-container-highest" : "bg-gray-200";
  const skeletonBgMid = theme === "dark" ? "bg-surface-container-high" : "bg-gray-100";

  // Today's spending — transactions + daily log entries for today
  const todaySpent = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const fromTx = transactions
      .filter((t) => t.type === "expense" && t.date === today)
      .reduce((s, t) => s + t.amount, 0);
    const fromDaily = dailySpending
      .filter((e) => e.date === today)
      .reduce((s, e) => s + e.amount, 0);
    return fromTx + fromDaily;
  }, [transactions, dailySpending]);

  const petMessage = todaySpent === 0
    ? "Nothing spent today — your wallet is safe!"
    : todaySpent < 500
      ? "Light spending so far, keep it up!"
      : todaySpent < 2000
        ? "Moderate day so far, you're on track."
        : todaySpent < 5000
          ? "Spending's picking up — stay mindful!"
          : "Big spending day! You might want to slow down.";

  const [apiLoading, setApiLoading] = useState(() => !sessionStorage.getItem("dash-loaded"));
  useEffect(() => {
    if (!apiLoading) return;
    fetchDashboardStats().then(() => {
      sessionStorage.setItem("dash-loaded", "1");
      setApiLoading(false);
    });
  }, [apiLoading]);

  if (apiLoading) {
    return (
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* Header skeleton */}
        <div className="flex items-center gap-4">
          <div className={`w-[72px] h-[72px] rounded-3xl animate-pulse ${skeletonBg}`} />
          <div className="space-y-2">
            <div className={`h-7 w-48 rounded-full animate-pulse ${skeletonBg}`} />
            <div className={`h-4 w-64 rounded-full animate-pulse ${skeletonBgMid}`} />
          </div>
        </div>

        {/* Hero + KPI cards skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <div className={`lg:col-span-2 h-52 rounded-3xl animate-pulse ${skeletonBg}`} />
          <div className="space-y-4">
            <div className={`h-24 rounded-3xl animate-pulse ${skeletonBg}`} style={{ animationDelay: "80ms" }} />
            <div className={`h-24 rounded-3xl animate-pulse ${skeletonBg}`} style={{ animationDelay: "160ms" }} />
          </div>
        </div>

        {/* Charts row skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <div className={`lg:col-span-2 h-72 rounded-3xl animate-pulse ${skeletonBg}`} style={{ animationDelay: "120ms" }} />
          <div className={`h-72 rounded-3xl animate-pulse ${skeletonBg}`} style={{ animationDelay: "200ms" }} />
        </div>

        {/* Bottom row skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <div className={`h-64 rounded-3xl animate-pulse ${skeletonBg}`} style={{ animationDelay: "160ms" }} />
          <div className={`h-64 rounded-3xl animate-pulse ${skeletonBg}`} style={{ animationDelay: "240ms" }} />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          {/* Pet companion — idles 5-6 s, click to play in admin mode */}
          <PetWidget petId={selectedPet} size={72} clickable={role === "admin"} />
          <div>
            <h1 className={`text-2xl lg:text-3xl font-bold tracking-tight ${textPrimary}`}>
              {getGreeting()}, {firstName}!
            </h1>
            <p className={`text-sm mt-1 ${textSecondary}`}>
              Portfolio Overview · Savings{" "}
              {stats.savingsGrowth >= 0 ? "grew" : "fell"} by{" "}
              <span className="text-primary-dim font-semibold">{Math.abs(stats.savingsGrowth).toFixed(1)}%</span> vs last month.
            </p>
          </div>
        </div>

        {/* Digital Clock — isolated component, re-renders independently */}
        <DigitalClock />
      </motion.div>

      {/* Hero Balance Card + Income/Expense Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Hero Balance */}
        <motion.div
          variants={item}
          className="lg:col-span-2 mesh-gradient rounded-3xl p-5 lg:p-6 relative overflow-hidden flex flex-col justify-between"
        >
          {/* Top: Net Worth */}
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <p className="text-black/60 text-xs uppercase tracking-widest font-semibold">
                Total Net Worth
              </p>
              {role === "admin" && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => setDataAdjustments({ netWorthAdjustment: netWorthAdjustment + 500 })}
                    className="p-0.5 rounded bg-black/10 hover:bg-black/20 transition-colors"
                    title="Increase net worth by ₹500"
                  >
                    <ChevronUp size={14} className="text-black/70" />
                  </button>
                  <button
                    onClick={() => setDataAdjustments({ netWorthAdjustment: netWorthAdjustment - 500 })}
                    className="p-0.5 rounded bg-black/10 hover:bg-black/20 transition-colors"
                    title="Decrease net worth by ₹500"
                  >
                    <ChevronDown size={14} className="text-black/70" />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2 text-black">
              <AnimatedNumber
                value={stats.balance + netWorthAdjustment + incomeAdjustment - expenseAdjustment}
                prefix={currencySymbol}
                decimals={2}
                className="text-3xl lg:text-4xl font-extrabold tracking-tight"
              />
            </div>
          </div>

          {/* Bottom: Account Split */}
          <div className="relative z-10 mt-5 pt-5 border-t border-black/15">
            <div className="flex items-center justify-between mb-3">
              <p className="text-black/60 text-xs uppercase tracking-widest font-bold">
                Account Breakdown
              </p>
              {role === "admin" && (
                <p className="text-[10px] text-black/40 font-medium">drag bar to adjust</p>
              )}
            </div>
            {(() => {
              const adjBalance = Math.max(1, stats.balance + netWorthAdjustment + incomeAdjustment - expenseAdjustment);
              const savingsAmt = Math.max(0, Math.min(savedThisMonth, adjBalance));
              const currentAmt = Math.max(0, adjBalance - savingsAmt);
              const total = savingsAmt + currentAmt || 1;
              const savingsPct = Math.round((savingsAmt / total) * 100);
              const currentPct = 100 - savingsPct;
              return (
                <>
                  {/* Draggable split bar */}
                  <div
                    ref={splitBarRef}
                    onMouseDown={handleSplitBarMouseDown}
                    className={`w-full h-4 rounded-full overflow-hidden bg-black/10 flex gap-0.5 ${role === "admin" ? "cursor-ew-resize" : ""}`}
                  >
                    <div
                      className="h-full rounded-l-full transition-all duration-150"
                      style={{ background: "#0d0d0d", width: `${savingsPct}%` }}
                    />
                    <div
                      className="h-full rounded-r-full transition-all duration-150"
                      style={{ background: "rgba(255,255,255,0.92)", width: `${currentPct}%` }}
                    />
                  </div>
                  {/* Legend */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-black/20" style={{ background: "#0d0d0d" }} />
                      <div>
                        <p className="text-xs text-black/60 font-semibold">Savings</p>
                        <p className="text-base font-extrabold text-black">{currencySymbol}{savingsAmt.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-black/50 font-bold">{savingsPct}%&nbsp;·&nbsp;{currentPct}%</p>
                    </div>
                    <div className="flex items-center gap-2 text-right justify-end">
                      <div className="text-right">
                        <p className="text-xs text-black/60 font-semibold">Current</p>
                        <p className="text-base font-extrabold text-black">{currencySymbol}{currentAmt.toLocaleString()}</p>
                      </div>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-black/20" style={{ background: "rgba(255,255,255,0.92)" }} />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Decorative circle */}
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />

          {/* Clickable pet — tap to see today's spending */}
          <div className="absolute right-5 top-5 z-20">
            <motion.button
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.82, rotate: -8 }}
              onClick={handlePetClick}
              className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-2xl cursor-pointer"
              title="Click to see today's spending"
            >
              {getPetById(selectedPet).emoji}
            </motion.button>
            <AnimatePresence>
              {showTodayBubble && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.75, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.75, y: -6 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className="absolute right-0 top-14 w-52 bg-white rounded-2xl rounded-tr-sm p-3.5 shadow-2xl"
                >
                  <p className="text-[10px] text-black/50 font-bold uppercase tracking-widest">Today's spending</p>
                  <p className="text-xl font-extrabold text-black mt-1">
                    {currencySymbol}{todaySpent.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-black/60 mt-1.5 leading-relaxed">{petMessage}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Income & Expense cards */}
        <div className="flex flex-col gap-4 lg:gap-6">
          <motion.div variants={item} whileHover={{ y: -3, scale: 1.01 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className={`${cardBg} rounded-3xl p-5 flex-1 cursor-default`}>
            <div className="flex items-center justify-between">
              <p className={`text-xs uppercase tracking-widest ${textSecondary}`}>
                Monthly Income
              </p>
              <div className="flex items-center gap-2">
                {role === "admin" && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => setDataAdjustments({ incomeAdjustment: incomeAdjustment + 500 })}
                      className="p-0.5 rounded hover:bg-primary-dim/20 transition-colors"
                      title="Increase income by ₹500"
                    >
                      <ChevronUp size={14} className="text-primary-dim" />
                    </button>
                    <button
                      onClick={() => setDataAdjustments({ incomeAdjustment: Math.max(-stats.totalIncome, incomeAdjustment - 500) })}
                      className="p-0.5 rounded hover:bg-primary-dim/20 transition-colors"
                      title="Decrease income by ₹500"
                    >
                      <ChevronDown size={14} className="text-primary-dim" />
                    </button>
                  </div>
                )}
                <div className="w-9 h-9 rounded-xl bg-primary-dim/20 flex items-center justify-center">
                  <ArrowUpRight size={16} className="text-primary-dim" />
                </div>
              </div>
            </div>
            <div className="mt-3">
              <AnimatedNumber
                value={stats.totalIncome + incomeAdjustment}
                prefix={currencySymbol}
                decimals={2}
                className={`text-2xl font-bold ${textPrimary}`}
              />
            </div>
            <div className="mt-2 flex items-center gap-1">
              <TrendingUp size={12} className="text-primary-dim" />
              <span className="text-xs text-primary-dim font-medium">
                +{stats.incomeChange.toFixed(1)}%
              </span>
              <span className={`text-xs ${textSecondary}`}>vs last month</span>
            </div>
          </motion.div>

          <motion.div variants={item} whileHover={{ y: -3, scale: 1.01 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className={`${cardBg} rounded-3xl p-5 flex-1 cursor-default`}>
            <div className="flex items-center justify-between">
              <p className={`text-xs uppercase tracking-widest ${textSecondary}`}>
                Monthly Expenses
              </p>
              <div className="flex items-center gap-2">
                {role === "admin" && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => setDataAdjustments({ expenseAdjustment: expenseAdjustment + 500 })}
                      className="p-0.5 rounded hover:bg-error/20 transition-colors"
                      title="Increase expenses by ₹500"
                    >
                      <ChevronUp size={14} className="text-error" />
                    </button>
                    <button
                      onClick={() => setDataAdjustments({ expenseAdjustment: Math.max(-stats.totalExpense, expenseAdjustment - 500) })}
                      className="p-0.5 rounded hover:bg-error/20 transition-colors"
                      title="Decrease expenses by ₹500"
                    >
                      <ChevronDown size={14} className="text-error" />
                    </button>
                  </div>
                )}
                <div className="w-9 h-9 rounded-xl bg-error/20 flex items-center justify-center">
                  <ArrowDownRight size={16} className="text-error" />
                </div>
              </div>
            </div>
            {monthlyExpenseProgress ? (
              <div className="mt-3 space-y-2">
                {/* Section 1 — Spent this month by day */}
                <div className={`rounded-2xl p-3 ${theme === "dark" ? "bg-surface-container" : "bg-gray-50"}`}>
                  <p className={`text-[10px] uppercase tracking-widest font-semibold ${textSecondary}`}>
                    Variable spending · day {monthlyExpenseProgress.dayOfMonth}
                  </p>
                  <AnimatedNumber
                    value={monthlyExpenseProgress.currentMTD}
                    prefix={currencySymbol}
                    decimals={2}
                    className={`text-xl font-bold mt-0.5 ${textPrimary}`}
                  />
                  {/* Progress bar vs avg by same day */}
                  <div className={`w-full h-1 rounded-full overflow-hidden mt-2 ${theme === "dark" ? "bg-surface-container-high" : "bg-gray-200"}`}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: monthlyExpenseProgress.pct < 95 ? "#a6ef27" : monthlyExpenseProgress.pct < 115 ? "#facc15" : "#ff5449" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(monthlyExpenseProgress.pct, 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Section 2 — Variable averages (side by side) */}
                <div className="grid grid-cols-2 gap-2">
                  <div className={`rounded-2xl p-3 ${theme === "dark" ? "bg-surface-container" : "bg-gray-50"}`}>
                    <p className={`text-[10px] uppercase tracking-widest font-semibold leading-tight ${textSecondary}`}>
                      Avg by day {monthlyExpenseProgress.dayOfMonth}
                    </p>
                    <AnimatedNumber
                      value={monthlyExpenseProgress.avgMTD}
                      prefix={currencySymbol}
                      decimals={2}
                      className={`text-base font-bold mt-0.5 ${textPrimary}`}
                    />
                    <p className={`text-[10px] mt-0.5 ${textSecondary}`}>variable only</p>
                  </div>
                  <div className={`rounded-2xl p-3 ${theme === "dark" ? "bg-surface-container" : "bg-gray-50"}`}>
                    <p className={`text-[10px] uppercase tracking-widest font-semibold leading-tight ${textSecondary}`}>
                      Avg full month
                    </p>
                    <AnimatedNumber
                      value={monthlyExpenseProgress.avgMonthlyExpense}
                      prefix={currencySymbol}
                      decimals={2}
                      className={`text-base font-bold mt-0.5 ${textPrimary}`}
                    />
                    <p className={`text-[10px] mt-0.5 ${textSecondary}`}>variable only</p>
                  </div>
                </div>

                {/* Fixed costs row */}
                <div className={`flex items-center justify-between rounded-2xl px-3 py-2.5 border ${
                  theme === "dark" ? "border-outline-variant/20 bg-surface-container/50" : "border-gray-200 bg-gray-50/60"
                }`}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className={`text-xs font-medium ${textSecondary}`}>Rent & Bills (fixed)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${textPrimary}`}>
                      {currencySymbol}{Math.round(monthlyExpenseProgress.currentMonthFixed).toLocaleString()}
                    </span>
                    <span className={`text-[10px] ${textSecondary}`}>
                      avg {currencySymbol}{Math.round(monthlyExpenseProgress.avgMonthlyFixed).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Quote */}
                <p className={`text-[11px] italic font-medium pt-0.5 ${monthlyExpenseProgress.quoteColor}`}>
                  "{monthlyExpenseProgress.quote}"
                </p>
              </div>
            ) : (
              <>
                <div className="mt-3">
                  <AnimatedNumber
                    value={stats.totalExpense + expenseAdjustment}
                    prefix={currencySymbol}
                    decimals={2}
                    className={`text-2xl font-bold ${textPrimary}`}
                  />
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <TrendingDown size={12} className="text-error" />
                  <span className="text-xs text-error font-medium">
                    {stats.expenseChange > 0 ? "+" : ""}{stats.expenseChange.toFixed(1)}%
                  </span>
                  <span className={`text-xs ${textSecondary}`}>vs last month</span>
                </div>
              </>
            )}
          </motion.div>
        </div>
      </div>

      {/* Savings Progress */}
      <motion.div variants={item}>
        <SavingsProgressCard />
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
        {/* Balance Evolution */}
        <motion.div variants={item} whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className={`lg:col-span-3 ${cardBg} rounded-3xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className={`text-lg font-bold ${textPrimary}`}>Balance Evolution</h2>
              <p className={`text-xs ${textSecondary} mt-0.5`}>
                Running net worth (income − expenses) — filter by period
              </p>
            </div>
            <div className="flex gap-1">
              {([1, 3, 6] as const).map((months) => (
                <button
                  key={months}
                  onClick={() => setBalancePeriod(months)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    balancePeriod === months
                      ? theme === "dark"
                        ? "bg-primary-dim text-black"
                        : "bg-primary-dim text-black"
                      : theme === "dark"
                        ? `${textSecondary} hover:bg-surface-container-high hover:text-on-surface`
                        : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  {months}M
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={balanceTrend.slice(-balancePeriod)}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a6ef27" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a6ef27" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00deec" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#00deec" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme === "dark" ? "#abaab6" : "#6b7280", fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme === "dark" ? "#abaab6" : "#6b7280", fontSize: 12 }}
                tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<ChartTooltip />} cursor={false} />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#a6ef27"
                strokeWidth={2.5}
                fill="url(#balanceGrad)"
                name="Balance"
                animationDuration={1500}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="#00deec"
                strokeWidth={1.5}
                fill="url(#incomeGrad)"
                name="Income"
                strokeDasharray="5 5"
                animationDuration={1800}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Spending Breakdown Donut */}
        <motion.div variants={item} whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className={`lg:col-span-2 ${cardBg} rounded-3xl p-6`}>
          <h2 className={`text-lg font-bold ${textPrimary}`}>Spending Breakdown</h2>
          <p className={`text-xs ${textSecondary} mt-0.5 mb-4`}>By category</p>

          <div className="flex justify-center">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={spendingByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  stroke="none"
                  animationDuration={1200}
                  animationEasing="ease-out"
                >
                  {spendingByCategory.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${currencySymbol}${Number(value).toLocaleString()}`, ""]}
                  contentStyle={{
                    background: theme === "dark" ? "#25252f" : "#fff",
                    border: "none",
                    borderRadius: "12px",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
                    color: theme === "dark" ? "#e6e4f1" : "#1c1b22",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 space-y-2">
            {spendingByCategory.slice(0, 5).map((cat) => (
              <div key={cat.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className={textSecondary}>{cat.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  {role === "admin" && (
                    <>
                      <button
                        onClick={() => adjustCategory(cat.name, -500)}
                        className={`p-0.5 rounded hover:opacity-70 transition-opacity ${textSecondary}`}
                        title={`Decrease ${cat.name} by ₹500`}
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        onClick={() => adjustCategory(cat.name, 500)}
                        className={`p-0.5 rounded hover:opacity-70 transition-opacity ${textSecondary}`}
                        title={`Increase ${cat.name} by ₹500`}
                      >
                        <ChevronUp size={12} />
                      </button>
                    </>
                  )}
                  <span className={`font-medium ${textPrimary} min-w-[60px] text-right`}>
                    {currencySymbol}{cat.value.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Income vs Expense Bar Chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Monthly Comparison Bars */}
        <motion.div variants={item} whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className={`${cardBg} rounded-3xl p-6`}>
          <h2 className={`text-lg font-bold ${textPrimary}`}>Income vs Expense</h2>
          <p className={`text-xs ${textSecondary} mt-0.5 mb-4`}>Monthly cash flow analysis</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyComparison} barGap={4}>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme === "dark" ? "#abaab6" : "#6b7280", fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme === "dark" ? "#abaab6" : "#6b7280", fontSize: 12 }}
                tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<ChartTooltip />} cursor={false} />
              <Bar
                dataKey="income"
                fill="#a6ef27"
                radius={[6, 6, 0, 0]}
                name="Income"
                animationDuration={1200}
              />
              <Bar
                dataKey="expense"
                fill="#d277ff"
                radius={[6, 6, 0, 0]}
                name="Expense"
                animationDuration={1400}
              />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={item} whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className={`${cardBg} rounded-3xl p-6`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className={`text-lg font-bold ${textPrimary}`}>Recent Activity</h2>
              <p className={`text-xs ${textSecondary} mt-0.5`}>Latest transactions</p>
            </div>
            <Activity size={18} className={textSecondary} />
          </div>

          <div className="space-y-1">
            {recentTransactions.map((tx, i) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ x: 4 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                className="flex items-center justify-between py-3 rounded-xl px-2 -mx-2 cursor-default"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor:
                        (categoryColors[tx.category as Category] || "#757480") + "20",
                      color: categoryColors[tx.category as Category] || "#757480",
                    }}
                  >
                    {tx.counterparty.charAt(0)}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${textPrimary}`}>
                      {tx.counterparty}
                    </p>
                    <p className={`text-xs ${textSecondary}`}>
                      {new Date(tx.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      {" · "}
                      {tx.category}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    tx.type === "income" ? "text-primary-dim" : "text-error"
                  }`}
                >
                  {tx.type === "income" ? "+" : "-"}{currencySymbol}
                  {tx.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

    </motion.div>
  );
}
