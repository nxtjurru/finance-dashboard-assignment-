import { useMemo, memo } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, LineChart, Line,
} from "recharts";
import {
  TrendingUp, Zap, AlertTriangle, Sparkles, ArrowRight,
} from "lucide-react";
import { useStore } from "../store/useStore";
import AnimatedNumber from "../components/AnimatedNumber";
import { categoryColors, type Category } from "../data/transactions";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

interface TooltipPayloadItem {
  name: string;
  value: number | string;
  color?: string;
  fill?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

// Stable tooltip — prevents Recharts from re-rendering on every hover
const ChartTooltip = memo(function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  const theme = useStore((s) => s.theme);
  const currencySymbol = useStore((s) => s.appSettings.currencySymbol);
  if (!active || !payload?.length) return null;
  const isDark = theme === "dark";
  return (
    <div className={`${isDark ? "bg-surface-container-highest" : "bg-white"} px-4 py-3 rounded-xl shadow-xl border ${isDark ? "border-outline-variant/20" : "border-gray-200"}`}>
      <p className={`text-xs font-semibold mb-1 ${isDark ? "text-on-surface" : "text-gray-900"}`}>{label}</p>
      {payload.map((p, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color || p.fill }}>
          {p.name}:{" "}
          {typeof p.value === "number" && p.name !== "Savings Rate" ? currencySymbol : ""}
          {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          {p.name === "Savings Rate" ? "%" : ""}
        </p>
      ))}
    </div>
  );
});

export default function Analytics() {
  const transactions = useStore((s) => s.transactions);
  const theme = useStore((s) => s.theme);
  const dailySpending = useStore((s) => s.dailySpending);
  const customCategories = useStore((s) => s.customCategories);
  const { savingsGoal, savedThisMonth } = useStore((s) => s.userProfile);
  const { currencySymbol } = useStore((s) => s.appSettings);

  const getCategoryColor = (name: string) =>
    categoryColors[name as Category] ??
    customCategories.find((c) => c.name === name)?.color ??
    "#757480";

  const cardBg = theme === "dark" ? "bg-surface-container-low" : "bg-white shadow-sm";
  const textPrimary = theme === "dark" ? "text-on-surface" : "text-gray-900";
  const textSecondary = theme === "dark" ? "text-on-surface-variant" : "text-gray-500";

  // Monthly spending data
  const monthlyData = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    transactions.forEach((t) => {
      const month = t.date.slice(0, 7);
      const existing = map.get(month) || { income: 0, expense: 0 };
      if (t.type === "income") existing.income += t.amount;
      else existing.expense += t.amount;
      map.set(month, existing);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
        fullMonth: month,
        income: Math.round(data.income),
        expense: Math.round(data.expense),
        savings: Math.round(data.income - data.expense),
      }));
  }, [transactions]);

  // Top spending categories (merge transactions + daily spending entries)
  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => map.set(t.category, (map.get(t.category) || 0) + t.amount));
    dailySpending.forEach((entry) => {
      map.set(entry.category, (map.get(entry.category) || 0) + entry.amount);
    });
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        value: Math.round(value),
        percentage: Math.round((value / total) * 100),
        color: getCategoryColor(name),
      }))
      .sort((a, b) => b.value - a.value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, dailySpending, customCategories]);

  // Savings rate over time
  const savingsRateData = useMemo(() => {
    return monthlyData.map((m) => ({
      month: m.month,
      rate: m.income > 0 ? Math.round(((m.income - m.expense) / m.income) * 100) : 0,
    }));
  }, [monthlyData]);

  // Smart insights
  const insights = useMemo(() => {
    const results: {
      title: string;
      description: string;
      type: "positive" | "warning" | "info";
      value?: string;
    }[] = [];

    if (topCategories.length > 0) {
      const top = topCategories[0];
      results.push({
        title: `${top.name} is your top expense`,
        description: `At ${currencySymbol}${top.value.toLocaleString()}, ${top.name.toLowerCase()} accounts for ${top.percentage}% of total spending. ${
          top.percentage > 30 ? "Consider reviewing this category for savings opportunities." : "This is within a healthy range."
        }`,
        type: top.percentage > 30 ? "warning" : "info",
        value: `${top.percentage}%`,
      });
    }

    if (monthlyData.length >= 2) {
      const latest = monthlyData[monthlyData.length - 1];
      const prev = monthlyData[monthlyData.length - 2];
      const expenseChange = prev.expense > 0
        ? ((latest.expense - prev.expense) / prev.expense) * 100
        : 0;

      if (expenseChange < -5) {
        results.push({
          title: `Spending dropped ${Math.abs(Math.round(expenseChange))}%`,
          description: `You spent ${currencySymbol}${(prev.expense - latest.expense).toLocaleString()} less in ${latest.month} compared to ${prev.month}. Great discipline!`,
          type: "positive",
          value: `${Math.round(expenseChange)}%`,
        });
      } else if (expenseChange > 15) {
        results.push({
          title: `Spending surged ${Math.round(expenseChange)}% this month`,
          description: `Your ${latest.month} expenses increased by ${currencySymbol}${(latest.expense - prev.expense).toLocaleString()} compared to ${prev.month}. This may warrant a budget review.`,
          type: "warning",
          value: `+${Math.round(expenseChange)}%`,
        });
      }
    }

    // Average savings rate
    const avgRate = savingsRateData.reduce((sum, d) => sum + d.rate, 0) / savingsRateData.length;
    results.push({
      title: `Average savings rate: ${Math.round(avgRate)}%`,
      description: avgRate > 30
        ? "Excellent! You're saving well above the recommended 20% benchmark. Keep it up."
        : avgRate > 20
          ? "Solid savings rate. You're meeting the recommended 20% benchmark."
          : "Your savings rate is below the recommended 20%. Look for areas to reduce spending.",
      type: avgRate > 20 ? "positive" : "warning",
      value: `${Math.round(avgRate)}%`,
    });

    // Income diversification
    const incomeCategories = new Set(
      transactions.filter((t) => t.type === "income").map((t) => t.category)
    );
    if (incomeCategories.size >= 3) {
      results.push({
        title: `${incomeCategories.size} income streams detected`,
        description: "Your income is well-diversified across multiple sources, reducing financial risk.",
        type: "positive",
        value: `${incomeCategories.size}`,
      });
    }

    return results;
  }, [topCategories, monthlyData, savingsRateData, transactions, currencySymbol]);

  const currentSavings = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].savings : 0;
  const savingsProgress = savingsGoal > 0 ? Math.min(Math.round((savedThisMonth / savingsGoal) * 100), 100) : 0;

  // Month-over-month change for the top spending category
  const peakCategoryChange = useMemo(() => {
    if (topCategories.length === 0 || monthlyData.length < 2) return 0;
    const topName = topCategories[0].name;
    const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort();
    const lastMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];
    const lastAmt = transactions
      .filter((t) => t.type === "expense" && t.category === topName && t.date.startsWith(lastMonth))
      .reduce((s, t) => s + t.amount, 0);
    const prevAmt = transactions
      .filter((t) => t.type === "expense" && t.category === topName && t.date.startsWith(prevMonth))
      .reduce((s, t) => s + t.amount, 0);
    return prevAmt > 0 ? ((lastAmt - prevAmt) / prevAmt) * 100 : 0;
  }, [topCategories, monthlyData, transactions]);

  const radialData = [{ name: "Savings", value: savingsProgress, fill: "#a6ef27" }];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {/* Header Hero Insight */}
      <motion.div
        variants={item}
        className={`${cardBg} rounded-3xl p-6 lg:p-8 relative overflow-hidden`}
      >
        <div className="mesh-gradient-subtle absolute inset-0 rounded-3xl" />
        <div className="relative z-10">
          <span className="inline-flex px-3 py-1 rounded-full bg-primary-dim/20 text-primary-dim text-xs font-semibold uppercase tracking-wider mb-4">
            Financial Intelligence
          </span>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="flex-1">
              <h1 className={`text-2xl lg:text-4xl font-extrabold tracking-tight leading-tight ${textPrimary}`}>
                {topCategories.length > 0 && topCategories[0].name === "Travel"
                  ? <>Travel Spending Surged<br />by {topCategories[0].percentage}% This Quarter.</>
                  : topCategories.length > 0
                    ? <>{topCategories[0].name} Dominates<br />at {topCategories[0].percentage}% of Expenses.</>
                    : <>Your Financial<br />Intelligence Report.</>
                }
              </h1>
              <p className={`text-sm mt-3 max-w-lg leading-relaxed ${textSecondary}`}>
                Your spending in high-frequency categories has reached a notable level.
                {currentSavings > 0
                  ? ` However, you're still saving ${currencySymbol}${currentSavings.toLocaleString()} per month — a healthy surplus.`
                  : " Consider reviewing your budget allocation."
                }
              </p>
              <div className="flex gap-3 mt-5">
                <button className="px-5 py-2.5 rounded-2xl bg-primary-dim text-black text-sm font-semibold hover:bg-primary-fixed transition-colors">
                  Deep Dive Insight
                </button>
                <button className={`px-5 py-2.5 rounded-2xl text-sm font-medium transition-colors ${
                  theme === "dark"
                    ? "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}>
                  Adjust Budget
                </button>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-xs uppercase tracking-widest ${textSecondary}`}>
                Peak Spending
              </p>
              <AnimatedNumber
                value={topCategories.length > 0 ? topCategories[0].value : 0}
                prefix={currencySymbol}
                decimals={0}
                className={`text-3xl font-extrabold ${textPrimary}`}
              />
              <div className="flex items-center justify-end gap-1 mt-1">
                {peakCategoryChange >= 0
                  ? <TrendingUp size={12} className="text-primary-dim" />
                  : <TrendingUp size={12} className="text-error" style={{ transform: "scaleY(-1)" }} />
                }
                <span className={`text-xs font-medium ${peakCategoryChange >= 0 ? "text-primary-dim" : "text-error"}`}>
                  {peakCategoryChange >= 0 ? "+" : ""}{peakCategoryChange.toFixed(1)}% vs Last Month
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Monthly Comparison + Savings Goal */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
        {/* Monthly Comparison */}
        <motion.div variants={item} className={`lg:col-span-3 ${cardBg} rounded-3xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className={`text-lg font-bold ${textPrimary}`}>Monthly Comparison</h2>
              <p className={`text-xs ${textSecondary} mt-0.5`}>Cash flow volatility analysis</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData} barGap={4}>
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
              <Bar dataKey="income" fill="#a6ef27" radius={[6, 6, 0, 0]} name="Income" animationDuration={1200} />
              <Bar dataKey="expense" fill="#d277ff" radius={[6, 6, 0, 0]} name="Expense" animationDuration={1400} />
              <Bar dataKey="savings" fill="#00deec" radius={[6, 6, 0, 0]} name="Savings" animationDuration={1600} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Savings Goal Radial */}
        <motion.div variants={item} className={`lg:col-span-2 ${cardBg} rounded-3xl p-6`}>
          <h2 className={`text-lg font-bold ${textPrimary}`}>Savings Goal</h2>
          <p className={`text-xs ${textSecondary} mt-0.5`}>
            Target: {currencySymbol}{savingsGoal.toLocaleString()}/month
          </p>

          <div className="flex justify-center my-4">
            <div className="relative">
              <ResponsiveContainer width={180} height={180}>
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="70%"
                  outerRadius="100%"
                  data={radialData}
                  startAngle={90}
                  endAngle={-270}
                >
                  <RadialBar
                    dataKey="value"
                    cornerRadius={12}
                    background={{ fill: theme === "dark" ? "#1f1f27" : "#e5e7eb" }}
                    animationDuration={1500}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-extrabold ${textPrimary}`}>
                  {savingsProgress}%
                </span>
                <span className={`text-xs ${textSecondary}`}>on track</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-2">
            <div className="flex justify-between text-sm">
              <span className={textSecondary}>Saved This Month</span>
              <span className={`font-semibold ${textPrimary}`}>
                {currencySymbol}{savedThisMonth > 0 ? savedThisMonth.toLocaleString() : "0"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className={textSecondary}>Goal</span>
              <span className={`font-semibold ${textPrimary}`}>
                {currencySymbol}{savingsGoal.toLocaleString()}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Savings Rate Trend + Top Spending */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Savings Rate Line */}
        <motion.div variants={item} className={`${cardBg} rounded-3xl p-6`}>
          <h2 className={`text-lg font-bold ${textPrimary}`}>Savings Rate Trend</h2>
          <p className={`text-xs ${textSecondary} mt-0.5 mb-4`}>Percentage of income saved each month</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={savingsRateData}>
              <defs>
                <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00deec" stopOpacity={0.3} />
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
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<ChartTooltip />} cursor={false} />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#00deec"
                strokeWidth={2.5}
                dot={{ fill: "#00deec", r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#00deec", stroke: "#0e0e13", strokeWidth: 3 }}
                name="Savings Rate"
                animationDuration={1500}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Top Spending Categories */}
        <motion.div variants={item} className={`${cardBg} rounded-3xl p-6`}>
          <h2 className={`text-lg font-bold ${textPrimary}`}>Top Spending Categories</h2>
          <p className={`text-xs ${textSecondary} mt-0.5 mb-4`}>Where your money goes</p>
          <div className="space-y-3">
            {topCategories.slice(0, 6).map((cat, i) => (
              <motion.div
                key={cat.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className={`text-sm ${textPrimary}`}>{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${textSecondary}`}>{cat.percentage}%</span>
                    <span className={`text-sm font-semibold ${textPrimary}`}>
                      {currencySymbol}{cat.value.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className={`w-full h-1.5 rounded-full ${
                  theme === "dark" ? "bg-surface-container-high" : "bg-gray-200"
                }`}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: cat.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${cat.percentage}%` }}
                    transition={{ duration: 0.8, delay: 0.5 + i * 0.1, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Automated Observations */}
      <motion.div variants={item}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-secondary-dim" />
          <h2 className={`text-lg font-bold ${textPrimary}`}>Automated Observations</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            theme === "dark" ? "bg-secondary-container text-on-secondary-container" : "bg-purple-100 text-purple-700"
          }`}>
            AI-Powered
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight, i) => (
            <motion.div
              key={i}
              variants={item}
              className={`${cardBg} rounded-3xl p-5 group cursor-pointer transition-all hover:scale-[1.01]`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  insight.type === "positive"
                    ? "bg-primary-dim/20"
                    : insight.type === "warning"
                      ? "bg-error/20"
                      : "bg-tertiary-dim/20"
                }`}>
                  {insight.type === "positive" ? (
                    <TrendingUp size={18} className="text-primary-dim" />
                  ) : insight.type === "warning" ? (
                    <AlertTriangle size={18} className="text-error" />
                  ) : (
                    <Zap size={18} className="text-tertiary-dim" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-bold ${textPrimary}`}>{insight.title}</h3>
                    <ArrowRight
                      size={14}
                      className={`${textSecondary} opacity-0 group-hover:opacity-100 transition-opacity`}
                    />
                  </div>
                  <p className={`text-xs mt-1 leading-relaxed ${textSecondary}`}>
                    {insight.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
