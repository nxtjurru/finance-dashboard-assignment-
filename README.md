# Ethereal Finance Dashboard

A modern, interactive personal finance dashboard built as a university assignment. The design follows the **"Celestial Ledger"** philosophy — treating financial data as a living ecosystem through atmospheric layering, mesh gradients, and glassmorphism.

## Live Features

### 1. Dashboard Overview
- **Animated hero balance card** with mesh gradient animation and live digital clock
- **Summary KPI cards** for Total Balance, Monthly Income, and Monthly Expenses with hover animations
- **Balance Evolution** area chart with 1M / 3M / 6M filter toggle
- **Spending Breakdown** donut chart by category
- **Income vs Expense** bar chart for monthly comparison
- **Monthly Expenses tracker** — variable spending by day vs. historical average, with fixed costs (Rent & Bills) shown separately and a contextual quote based on spending pace
- **Recent Activity** feed with animated entry transitions
- All numbers animate on load using a custom `AnimatedNumber` component

### 2. Transactions
- **Full transaction table** with 86 realistic mock entries across Jan–Mar 2026
- **Search** across description, counterparty, and category (debounced 300 ms)
- **Quick type filters** (All / Income / Expense) as pill buttons
- **Advanced filters** — category dropdown and date range picker
- **Sorting** by date, amount, or category (ascending/descending toggle)
- **CSV export** for filtered transactions
- **Admin-only**: add, edit, and delete transactions via modal
- **Responsive design**: table layout on desktop, card layout on mobile
- **Empty state** with styled fallback when no results match

### 3. Role-Based UI (RBAC)
- **Viewer mode**: read-only access — can see all data and charts
- **Admin mode**: full access — can add, edit, delete transactions; edit profile/goals; log daily spending; adjust chart values; pick a pet
- Toggle via a pill switch at the bottom of the sidebar
- Admin-only elements animate in/out with Framer Motion
- Role persists across page refreshes via localStorage

### 4. Insight (Analytics)
- **Editorial hero insight** with dynamic headline (e.g., "Shopping Dominates at 20% of Expenses")
- **Monthly comparison** bar chart — income vs. expense vs. savings across months
- **Savings goal** radial progress chart with target tracking
- **Savings rate trend** line chart across months
- **Top spending categories** with animated progress bars
- **Dynamic observations** generated from actual transaction data:
  - Highest spending category with percentage share
  - Month-over-month spending change detection
  - Average savings rate vs. recommended benchmarks
  - Income diversification analysis

### 5. Profile
- **Financial goals editor** — set monthly income, savings goal, salary bonus/hike (admin only)
- **Daily spending logger** — log ad-hoc expenses by category with a running total (admin only)
- **Savings allocation slider** — set what % of monthly savings goes to savings account vs. current account, with a live animated split bar showing rupee amounts
- **Custom categories** — add/remove your own spending categories with custom colors
- **Pet picker** — choose your dashboard companion (cat, dog, bird, or fish)
- **Identity editor** — update display name and email (admin only)

### 6. Settings
- **Currency & locale** — currency symbol, code, language, country, date format
- **Display preferences** — username, email, theme toggle
- All settings persist to localStorage

### 7. State Management
- **Zustand v5** with `persist` middleware for clean, lightweight global state
- Single store manages: transactions, filters, role, theme, user profile, daily spending, custom categories, app settings, data adjustments
- Custom `useFilteredTransactions` hook for derived filtered + sorted transaction list
- Persisted slices survive page refresh; filters and data adjustments reset on reload

### 8. Dark / Light Mode
- Dark mode is the default ("Celestial Ledger" aesthetic)
- Light mode toggle in sidebar with smooth transitions
- Theme persists via localStorage
- All components adapt their colors based on the active theme

### 9. PetWidget
- Emoji-based companion (cat, dog, bird, fish) shown on the Dashboard header
- Idles by default; auto-plays an animation every 5–6.5 seconds
- Admin users can click it to trigger an immediate play
- Selected pet persists to localStorage

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 8 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand v5 (with persist) |
| Charts | Recharts v3 |
| Animations | Framer Motion v12 |
| Icons | Lucide React |
| Routing | React Router v7 |

## Design System

The UI follows the **"Celestial Ledger"** design system:

- **Background**: Deep obsidian (`#0e0e13`) as the canvas
- **No-Line Rule**: No 1px borders — depth is created through background color shifts
- **Mesh Gradients**: Animated lime-to-cyan gradient on hero cards
- **Elevation**: Luminosity-based depth, not box shadows
- **High Roundness**: 2rem–3rem border radius on cards and containers
- **Color Palette**: Lime green (primary), Purple (secondary), Cyan (tertiary)

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
cd ethereal-finance
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
  App.tsx                        Route definitions (React.lazy — code split)
  main.tsx                       Entry point, StrictMode
  index.css                      Tailwind v4 @theme tokens + mesh-gradient keyframes

  store/
    useStore.ts                  Single Zustand store with persist middleware

  data/
    transactions.ts              86 mock transactions, Category union, colors/icons
    pets.ts                      Pet options (cat, dog, bird, fish)

  hooks/
    useFilteredTransactions.ts   Derived filtered + sorted transaction list

  components/
    Layout.tsx                   Shell: Sidebar + <Outlet /> + mobile header
    Sidebar.tsx                  Nav links, role toggle, theme toggle
    AnimatedNumber.tsx           Count-up animation component
    SavingsProgressCard.tsx      Draggable savings progress bar
    PetWidget.tsx                Animated emoji companion with idle timer

  pages/
    Dashboard.tsx                KPI cards, charts, monthly expenses tracker, activity feed
    Transactions.tsx             Table with search/filter/sort/CRUD + CSV export
    Analytics.tsx                Category breakdown, savings trend, dynamic insights
    Profile.tsx                  Goals, daily spending, savings allocation, pet picker
    Settings.tsx                 Currency, locale, display preferences
```

## Approach & Decisions

1. **Design-first**: Built around a strong design system with atmospheric layering, mesh gradients, and glassmorphism — no flat borders.

2. **Realistic financial data**: Mock data tells a coherent story of a salaried professional (₹80,000/month income, ~₹50,000 expenses, ~₹30,000 savings) across 3 months with realistic category breakdowns.

3. **Dynamic insights**: The Insight page computes observations from actual transaction data — change the data and insights update automatically.

4. **Variable vs. fixed expense separation**: Monthly Expenses card separates discretionary spending (Groceries, Shopping, Dining, Travel) from fixed costs (Rent, Bills), computing daily averages only from variable expenses.

5. **Zustand over Redux**: Minimal API surface, zero boilerplate, single `persist` line for localStorage sync.

6. **Performance**: All 5 pages are `React.lazy` → code-split. Heavy libraries (Recharts, Framer Motion) in separate Vite `manualChunks`. `useMemo` used for all derived financial computations.

7. **Responsive by design**: Desktop shows full sidebar + table. Mobile collapses to hamburger nav + card-based transaction list.

## Optional Enhancements Implemented

- [x] Dark mode (default) + Light mode toggle
- [x] Data persistence via localStorage (Zustand persist)
- [x] Animations and transitions (Framer Motion throughout)
- [x] CSV export for filtered transactions
- [x] Advanced filtering (category, date range, type)
- [x] Empty state handling on all list/table views
