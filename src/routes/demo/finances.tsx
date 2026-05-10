import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getCurrentUser, getGoals, getTransactions, getUsers, loginUser, registerUser, saveGoals, saveTransactions, setCurrentUser } from '../../lib/finsight-storage'

type TransactionType = 'income' | 'expense'

type Transaction = {
  id: number
  date: string
  description: string
  amount: number
  category: string
  type: TransactionType
}

type SavingsGoal = {
  id: number
  name: string
  target: number
  saved: number
  dueDate?: string | undefined
  category: string
  completed: boolean
  createdAt: number
}

type UserRecord = {
  password: string
  displayName: string
}

const categoryKeywords: Record<string, string[]> = {
  'Food': ['grocery', 'restaurant', 'food', 'meal', 'dining', 'coffee', 'snack'],
  'Transport': ['gas', 'fuel', 'taxi', 'uber', 'bus', 'train', 'parking', 'car', 'transport'],
  'Bills': ['electricity', 'water', 'internet', 'phone', 'rent', 'insurance', 'utility'],
  'Entertainment': ['movie', 'game', 'music', 'subscription', 'netflix', 'spotify', 'entertainment'],
  'Shopping': ['clothes', 'shopping', 'amazon', 'store', 'purchase'],
  'Health': ['doctor', 'pharmacy', 'medical', 'health', 'gym'],
  'Education': ['book', 'course', 'school', 'education', 'tuition'],
  'General': []
}

const autoCategorize = (description: string): string => {
  const lowerDesc = description.toLowerCase()
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => lowerDesc.includes(keyword))) {
      return category
    }
  }
  return 'General'
}

function generateSmartEntrySuggestion(
  input: Partial<Transaction>,
  history: Transaction[],
  totalIncomeAll: number,
) {
  const description = (input.description || '').trim()
  const amount = Number(input.amount ?? 0)
  const type = input.type || 'expense'
  const category = (input.category || 'General').trim() || 'General'
  const lower = description.toLowerCase()
  const incomeHints = ['salary', 'bonus', 'invoice', 'payment', 'refund', 'interest', 'dividend', 'deposit', 'freelance', 'commission']
  const expenseHints = ['grocery', 'rent', 'utilities', 'electricity', 'gas', 'coffee', 'restaurant', 'dinner', 'taxi', 'uber', 'bus', 'train', 'shopping', 'amazon', 'subscription', 'netflix', 'gym', 'health', 'doctor', 'pharmacy', 'medical', 'school', 'tuition', 'gift', 'donation', 'hotel', 'travel', 'flight', 'parking']

  let suggestedType = type
  const hasIncomeHint = incomeHints.some((word) => lower.includes(word))
  const hasExpenseHint = expenseHints.some((word) => lower.includes(word))

  if (hasIncomeHint && !hasExpenseHint) {
    suggestedType = 'income'
  }
  if (hasExpenseHint && !hasIncomeHint) {
    suggestedType = 'expense'
  }
  if (type === 'expense' && hasIncomeHint) {
    suggestedType = 'income'
  }
  if (type === 'income' && hasExpenseHint) {
    suggestedType = 'expense'
  }

  const suggestedCategory = description ? autoCategorize(description) : category
  const categoryEdit = category === 'General' || category === '' || (suggestedCategory !== 'General' && suggestedCategory !== category)
    ? suggestedCategory
    : category

  const amountNoteParts: string[] = []
  let warning = ''
  if (!description) {
    warning = 'Add a clear description so you can track this transaction later.'
  }
  if (amount <= 0) {
    amountNoteParts.push('Amount should be greater than zero.')
  }
  if (type === 'expense' && totalIncomeAll > 0 && amount > totalIncomeAll * 0.5) {
    amountNoteParts.push('This expense is more than half of your recorded income.')
    warning = warning || 'This looks like an unusually large expense.'
  }
  if (type === 'expense' && totalIncomeAll > 0 && amount > totalIncomeAll) {
    amountNoteParts.push('Expense exceeds your total income. Confirm this amount.')
    warning = warning || 'This expense is larger than your current monthly income.'
  }
  if (type === 'income' && totalIncomeAll > 0 && amount > totalIncomeAll * 3) {
    amountNoteParts.push('This income looks unusually high compared to previous income history.')
    warning = warning || 'Confirm that this income entry is correct.'
  }
  if (description && history.some((tx) => tx.description.toLowerCase() === lower && tx.amount === amount && tx.type === type)) {
    amountNoteParts.push('This looks similar to a recent transaction. Consider whether the category and type should match previous entries.')
  }

  const amountNote = amountNoteParts.join(' ')

  const suggestion = description
    ? `Use a precise category and make sure the type matches the transaction. ${categoryEdit !== category ? `Suggested category: ${categoryEdit}. ` : ''}${suggestedType !== type ? `Suggested type: ${suggestedType}. ` : ''}`.trim()
    : 'Add a transaction description, amount, and category to improve tracking.'

  return {
    category: categoryEdit,
    type: suggestedType,
    amountNote: amountNote || 'None',
    warning,
    suggestion: suggestion || 'Review the entry for accuracy before saving.',
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

async function generateFinanceAssistantResponse(
  message: string,
  stats: {
    totalIncome: number
    totalExpense: number
    balance: number
    goalsActive: number
    goalsCompleted: number
    goalsProgress: number
    activeTab: string
    topExpenseCategory: string
  },
) {
  const normalized = message.toLowerCase().trim()

  const staticAnswers: Array<{ pattern: RegExp; answer: string }> = [
    {
      pattern: /^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup)\b/,
      answer: 'Hello! I am FinSight AI. Ask me about your income, expenses, budget, savings goals, or financial reports.',
    },
    {
      pattern: /\b(what is finance|define finance|finance means|meaning of finance)\b/,
      answer: 'Finance is the management of money, including income, expenses, savings, budgets, and financial goals. It helps you understand how to track spending, improve saving habits, and make better financial decisions.',
    },
    {
      pattern: /\b(what is financial freedom|define financial freedom|financial freedom means)\b/,
      answer: 'Financial freedom means having enough savings, investments, and passive income to cover your living expenses without depending on a regular paycheck. It usually includes managing debt, keeping a safety net, and making choices based on your priorities rather than financial pressure.',
    },
    {
      pattern: /\b(what is financial independence|define financial independence|financial independence means)\b/,
      answer: 'Financial independence means having enough resources—such as savings, investments, and passive income—to support your lifestyle without needing to work for pay. It is closely related to financial freedom and long-term stability.',
    },
    {
      pattern: /\b(what is a budget|define budget|budget means)\b/,
      answer: 'A budget is a plan for how you will earn and spend money. It helps you allocate funds for needs, wants, and savings so you can stay on track with your financial goals.',
    },
    {
      pattern: /\b(what is income|define income|income means)\b/,
      answer: 'Income is the money you receive from work, investments, or other sources. It is the amount you have available before you pay expenses or save.',
    },
    {
      pattern: /\b(what is expense|define expense|expense means)\b/,
      answer: 'An expense is money spent to buy goods or services. Keeping track of your expenses helps you manage spending and stay within your budget.',
    },
    {
      pattern: /\b(what is savings|define savings|savings means)\b/,
      answer: 'Savings is the money you set aside instead of spending it. It forms an emergency fund and helps you reach future goals like buying a home or retiring comfortably.',
    },
    {
      pattern: /\b(what is debt|define debt|debt means)\b/,
      answer: 'Debt is money you owe to someone else, such as a loan or credit card balance. Managing debt carefully means paying it down when possible and avoiding high interest costs.',
    },
    {
      pattern: /\b(what is credit|define credit|credit means)\b/,
      answer: 'Credit is your ability to borrow money or access goods and services before paying for them. Good credit is built by making payments on time and keeping balances low.',
    },
    {
      pattern: /\b(how to save money|ways to save money|tips to save money)\b/,
      answer: 'To save money, track your expenses, create a budget, reduce unnecessary spending, and set aside a portion of each paycheck for your savings goals.',
    },
    {
      pattern: /\b(how to budget|ways to budget|budget plan)\b/,
      answer: 'Start your budget by listing your income and fixed expenses, then allocate the remaining money toward savings and variable expenses. Review the plan regularly and adjust as needed.',
    },
    {
      pattern: /\b(how to reduce debt|ways to reduce debt|pay off debt)\b/,
      answer: 'To reduce debt, prioritize higher-interest balances first, make more than the minimum payment when possible, and avoid adding new debt while you pay down existing balances.',
    },
  ]

  for (const item of staticAnswers) {
    if (item.pattern.test(normalized)) {
      return item.answer
    }
  }

  const financeKeywords = [
    'income',
    'expense',
    'spend',
    'saving',
    'balance',
    'budget',
    'goal',
    'report',
    'financial',
    'analysis',
    'debt',
    'cash',
    'savings',
    'earning',
    'spending',
    'statement',
    'forecast',
    'trend',
    'net',
    'worth',
  ]
  const unrelatedPattern = /\b(weather|movie|music|sports|politics|programming|code|joke|fashion|travel|recipe|cooking|health|fitness|celebrity|gaming|chatbot|art|history|math|science)\b/

  if (!financeKeywords.some((keyword) => normalized.includes(keyword))) {
    return 'I can only answer finance-related questions. Please ask about your income, expenses, budget, savings goals, balance, or report analysis.'
  }

  if (unrelatedPattern.test(normalized) && !normalized.includes('finance') && !normalized.includes('budget')) {
    return 'This assistant only handles personal finance topics. Please ask about your financial standing, income, spending, budget, goals, or reports.'
  }

  try {
    const response = await fetch('/demo/api/ai/finance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, stats }),
    })

    if (!response.ok) {
      return 'There was an issue connecting to the finance assistant. Please try again later.'
    }

    const data = await response.json()
    if (data?.answer && typeof data.answer === 'string') {
      return data.answer.trim()
    }

    return 'The finance assistant could not generate a response. Please try again with a simpler question.'
  } catch (error) {
    return 'There was an issue connecting to the finance assistant. Please try again later.'
  }
}

function useFinsightStorage() {
  const [user, setUser] = useState<string | null>(null)
  const [users, setUsers] = useState<Record<string, UserRecord>>({})
  const [transactions, setTransactionsState] = useState<Transaction[]>([])
  const [goals, setGoalsState] = useState<SavingsGoal[]>([])

  useEffect(() => {
    const loadedUsers = getUsers()
    setUsers(loadedUsers)
    const loadedUser = getCurrentUser()
    if (loadedUser) {
      setUser(loadedUser)
      setTransactionsState(getTransactions(loadedUser))
      setGoalsState(getGoals(loadedUser))
    }
  }, [])

  const login = (username: string, password: string): string | null => {
    const error = loginUser(username, password)
    if (error) return error
    setUser(username)
    setTransactionsState(getTransactions(username))
    setGoalsState(getGoals(username))
    return null
  }

  const register = (username: string, password: string, displayName: string): string | null => {
    const error = registerUser(username, password, displayName)
    if (error) return error
    const updatedUsers = getUsers()
    setUsers(updatedUsers)
    setUser(username)
    setTransactionsState([])
    setGoalsState([])
    return null
  }

  const logout = () => {
    setCurrentUser(null)
    setUser(null)
    setTransactionsState([])
    setGoalsState([])
  }

  const updateTransactions = (next: Transaction[]) => {
    if (!user) return
    setTransactionsState(next)
    saveTransactions(user, next)
  }

  const updateGoals = (next: SavingsGoal[]) => {
    if (!user) return
    setGoalsState(next)
    saveGoals(user, next)
  }

  const removeGoal = (id: number) => {
    if (!user) return
    updateGoals(goals.filter((goal) => goal.id !== id))
  }

  return {
    user,
    users,
    transactions,
    goals,
    login,
    register,
    logout,
    updateTransactions,
    updateGoals,
    removeGoal,
  }
}

type AIAnalysis = {
  healthScore: number
  riskLevel: 'Low' | 'Medium' | 'High'
  insights: string[]
  predictions: string[]
  recommendations: string[]
}

const AIAnalysisPanel = lazy(() =>
  Promise.resolve({
    default: ({ analysis }: { analysis: AIAnalysis }) => (
      <section className="island-shell rounded-xl p-4">
        <h3 className="mb-3 text-lg font-semibold">AI Financial Analysis</h3>
        <p className="mb-3 text-sm text-gray-500">Live analysis based on your transactions and savings goals.</p>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Financial Health Score</p>
            <p className="mt-3 text-4xl font-bold text-slate-900">{analysis.healthScore}</p>
          </div>
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Risk Level</p>
            <p className={`mt-3 text-3xl font-bold ${analysis.riskLevel === 'High' ? 'text-red-700' : analysis.riskLevel === 'Medium' ? 'text-yellow-600' : 'text-emerald-600'}`}>
              {analysis.riskLevel}
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground)]">
            <p className="mb-2 font-semibold">AI Financial Insights:</p>
            <ul className="list-disc space-y-2 pl-5">
              {analysis.insights.map((insight, idx) => (
                <li key={idx}>{insight}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground)]">
            <p className="mb-2 font-semibold">AI Predictions:</p>
            <ul className="list-disc space-y-2 pl-5">
              {analysis.predictions.map((prediction, idx) => (
                <li key={idx}>{prediction}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground)]">
            <p className="mb-2 font-semibold">AI Recommendations:</p>
            <ul className="list-disc space-y-2 pl-5">
              {analysis.recommendations.map((recommendation, idx) => (
                <li key={idx}>{recommendation}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    ),
  }),
)



export function FinanceDashboard() {
  const {
    user,
    transactions,
    goals,
    login,
    register,
    updateTransactions,
    updateGoals,
    removeGoal,
  } = useFinsightStorage()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'income' | 'analysis' | 'budget' | 'goals' | 'reports' | 'chat'>('dashboard')

  const [formTransaction, setFormTransaction] = useState<Partial<Transaction>>({
    date: new Date().toISOString().slice(0, 10),
    type: 'expense',
    category: 'General',
  })

  const [goalForm, setGoalForm] = useState<Partial<SavingsGoal>>({
    name: '',
    target: 0,
    saved: 0,
    dueDate: '',
    category: 'short-term',
  })

  const [goalContributions, setGoalContributions] = useState<Record<number, number>>({})

  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: 'Hello! I\'m your FinSight AI assistant. Ask me about your finances, goals, or how to navigate the app.' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [riskPopupOpen, setRiskPopupOpen] = useState(true)

  const totalIncomeAll = useMemo(() => transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0), [transactions])
  const totalExpenseAll = useMemo(() => transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0), [transactions])
  const balanceAll = totalIncomeAll - totalExpenseAll

  const smartEntrySuggestion = useMemo(
    () => generateSmartEntrySuggestion(formTransaction, transactions, totalIncomeAll),
    [formTransaction, transactions, totalIncomeAll],
  )

  const expenseCategoryTotals = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'expense')
      .reduce<Record<string, number>>((acc, tx) => {
        acc[tx.category] = (acc[tx.category] || 0) + tx.amount
        return acc
      }, {})
  }, [transactions])

  const riskAnalysis = useMemo(() => {
    const categories = Object.entries(expenseCategoryTotals).sort(([, a], [, b]) => b - a)
    const topCategory = categories[0]?.[0] || 'None'
    const topAmount = categories[0]?.[1] || 0
    const issues: string[] = []

    const expenseShareOfIncome = totalIncomeAll > 0 ? totalExpenseAll / totalIncomeAll : totalExpenseAll > 0 ? Infinity : 0
    const topCategoryIncomeShare = totalIncomeAll > 0 ? topAmount / totalIncomeAll : 0
    const topCategoryExpenseShare = totalExpenseAll > 0 ? topAmount / totalExpenseAll : 0

    if (totalExpenseAll > totalIncomeAll) {
      issues.push('Expenses exceed income.')
    }
    if (balanceAll < 0) {
      issues.push('Balance is negative.')
    }
    if (topCategory !== 'None' && topCategoryIncomeShare >= 1) {
      const overIncome = Math.round((topCategoryIncomeShare - 1) * 100)
      issues.push(`Your ${topCategory} spending is very large: ${Math.round(topCategoryIncomeShare * 100)}% of income (${overIncome}% over income).`)
    } else if (topCategory !== 'None' && topCategoryIncomeShare >= 0.7) {
      issues.push(`Your ${topCategory} spending is very large: ${Math.round(topCategoryIncomeShare * 100)}% of income.`)
    } else if (topCategory !== 'None' && topCategoryIncomeShare >= 0.35) {
      issues.push(`Your ${topCategory} spending is elevated at ${Math.round(topCategoryIncomeShare * 100)}% of income.`)
    } else if (topCategory !== 'None' && topCategoryExpenseShare >= 0.6 && expenseShareOfIncome > 0.25) {
      issues.push(`Your ${topCategory} expense makes up ${Math.round(topCategoryExpenseShare * 100)}% of spending and ${Math.round(topCategoryIncomeShare * 100)}% of income.`)
    }
    if (expenseShareOfIncome === Infinity) {
      issues.push('Expenses are consuming more than 100% of your income.')
    } else if (expenseShareOfIncome >= 1) {
      const overIncome = Math.round((expenseShareOfIncome - 1) * 100)
      issues.push(`Expenses are consuming ${Math.round(expenseShareOfIncome * 100)}% of your income (${overIncome}% over income).`)
    } else if (expenseShareOfIncome >= 0.8) {
      issues.push(`Expenses are consuming ${Math.round(expenseShareOfIncome * 100)}% of your income.`)
    } else if (expenseShareOfIncome >= 0.5) {
      issues.push('Expenses are consuming more than half of your income.')
    }
    if (categories.length >= 5 && topCategoryExpenseShare >= 0.25 && expenseShareOfIncome > 0.2) {
      issues.push('Spending is spread across many categories with a few larger concentrations.')
    }

    const riskLevel = balanceAll < 0 || expenseShareOfIncome >= 1 || topCategoryIncomeShare >= 0.7
      ? 'High'
      : totalExpenseAll > totalIncomeAll || expenseShareOfIncome >= 0.5 || topCategoryIncomeShare >= 0.35
      ? 'Medium'
      : 'Low'

    const recommendations: string[] = []
    if (balanceAll < 0) {
      recommendations.push('Cut discretionary spending and cover the shortfall immediately.')
    }
    if (totalExpenseAll > totalIncomeAll) {
      recommendations.push('Reduce monthly costs so expenses stay below income.')
    }
    if (totalExpenseAll > 0 && topCategoryIncomeShare >= 0.35) {
      recommendations.push(`Reduce spending in ${topCategory} so it is smaller relative to your income.`)
    } else if (totalExpenseAll > 0) {
      recommendations.push(`Monitor ${topCategory} spending and keep total expenses in line with income.`)
    }
    if (!recommendations.length) {
      recommendations.push('Keep monitoring your budget and review your goals regularly.')
    }

    return {
      riskLevel,
      issues: issues.length ? issues : ['No immediate financial risk detected.'],
      recommendations,
      topCategory,
    }
  }, [balanceAll, expenseCategoryTotals, totalExpenseAll, totalIncomeAll])

  useEffect(() => {
    if (activeTab === 'dashboard' && riskAnalysis.riskLevel !== 'Low') {
      setRiskPopupOpen(true)
    }
  }, [activeTab, riskAnalysis.riskLevel])

  const riskBadgeClass = useMemo(() => {
    if (riskAnalysis.riskLevel === 'High') {
      return 'rounded-full bg-red-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-red-900'
    }
    if (riskAnalysis.riskLevel === 'Medium') {
      return 'rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-yellow-800'
    }
    return 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700'
  }, [riskAnalysis.riskLevel])

  const riskPopupClass = useMemo(() => {
    if (riskAnalysis.riskLevel === 'High') {
      return 'fixed bottom-6 right-6 z-50 w-full max-w-sm rounded-3xl border border-red-300 bg-red-50/90 p-4 shadow-2xl text-slate-900'
    }
    if (riskAnalysis.riskLevel === 'Medium') {
      return 'fixed bottom-6 right-6 z-50 w-full max-w-sm rounded-3xl border border-yellow-300 bg-yellow-50 p-4 shadow-2xl text-slate-900'
    }
    return 'fixed bottom-6 right-6 z-50 w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl text-[var(--foreground)]'
  }, [riskAnalysis.riskLevel])

  const riskAlertIssues = riskAnalysis.issues.slice(0, 2)

  const buildRiskReductionResponse = () => {
    return `Risk Level: ${riskAnalysis.riskLevel}\n\nDetected Issues:\n${riskAnalysis.issues.map((issue) => `- ${issue}`).join('\n')}\n\nAI Recommendations:\n${riskAnalysis.recommendations.map((rec) => `- ${rec}`).join('\n')}`
  }

  const isRiskQuestion = (text: string) => /\b(risk|risks|overspending|negative balance|unusual spending|spending pattern|financial risk)\b/i.test(text)

  const totalIncome = useMemo(() => {
    if (!['dashboard', 'budget', 'reports'].includes(activeTab)) return 0
    return transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  }, [transactions, activeTab])

  const totalExpense = useMemo(() => {
    if (!['dashboard', 'budget', 'reports'].includes(activeTab)) return 0
    return transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  }, [transactions, activeTab])

  const balance = totalIncome - totalExpense

  const activeGoals = useMemo(() => goals.filter((goal) => !goal.completed), [goals])
  const completedGoals = useMemo(() => goals.filter((goal) => goal.completed), [goals])

  const goalsProgress = useMemo(() => {
    if (!activeGoals.length) return 0
    const total = activeGoals.reduce((sum, goal) => sum + goal.saved / Math.max(goal.target, 1), 0)
    return Math.min(100, (total / activeGoals.length) * 100)
  }, [activeGoals])

  const goalAnalysis = useMemo(() => {
    const activeGoal = activeGoals[0]
    if (!activeGoal) {
      return {
        status: 'Achievable',
        estimatedCompletion: 'Add a savings goal to generate an analysis.',
        requiredMonthly: '$0.00',
        suggestedContribution: '$0.00',
        adjustedTimeline: 'No timeline available until a goal is created.',
        progressPercentage: 0,
        remainingAmount: '$0.00',
        insights: ['No active savings goal yet.', 'Create a goal to receive a realistic timeline and monthly savings target.'],
        recommendations: ['Add a goal to start tracking progress and estimating completion time.', 'Record income and expenses so the goal plan is grounded in your current capacity.'],
      }
    }

    const remaining = Math.max(0, activeGoal.target - activeGoal.saved)
    const currentProgress = Math.round((activeGoal.saved / Math.max(activeGoal.target, 1)) * 100)
    const availableMonthly = Math.max(0, totalIncomeAll - totalExpenseAll)
    const daysLeft = activeGoal.dueDate ? Math.max(0, Math.ceil((new Date(activeGoal.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null
    const monthsLeft = daysLeft != null ? Math.max(1, Math.ceil(daysLeft / 30)) : 12
    const requiredMonthly = remaining > 0 ? remaining / monthsLeft : 0
    const completedOnTime = availableMonthly > 0 ? Math.ceil(remaining / availableMonthly) <= monthsLeft : false

    let status: 'Achievable' | 'Challenging' | 'Unrealistic' = 'Achievable'
    if (remaining <= 0) {
      status = 'Achievable'
    } else if (availableMonthly === 0) {
      status = 'Unrealistic'
    } else if (daysLeft != null && !completedOnTime) {
      status = availableMonthly >= requiredMonthly * 0.75 ? 'Challenging' : 'Unrealistic'
    } else if (requiredMonthly > availableMonthly) {
      status = 'Challenging'
    }

    const estimatedCompletion = remaining <= 0
      ? 'Goal already reached.'
      : availableMonthly > 0
        ? daysLeft != null
          ? completedOnTime
            ? `Projected to complete in ${Math.ceil(remaining / availableMonthly)} months, which can meet the deadline.`
            : `Projected to complete in ${Math.ceil(remaining / availableMonthly)} months, which is longer than the ${monthsLeft}-month deadline.`
          : `Projected to complete in ${Math.ceil(remaining / availableMonthly)} months at current available savings.`
        : activeGoal.dueDate
          ? `No positive savings capacity yet; goal deadline is ${activeGoal.dueDate}.`
          : 'No positive savings capacity yet; create monthly surplus to estimate completion.'

    const suggestedContribution = availableMonthly > 0
      ? `$${Math.min(requiredMonthly, availableMonthly).toFixed(2)}`
      : '$0.00'

    const adjustedTimeline = remaining <= 0
      ? 'No adjustment needed.'
      : availableMonthly === 0
        ? 'Reduce expenses or increase income before setting a reliable timeline.'
        : requiredMonthly <= availableMonthly
          ? daysLeft != null
            ? `Keep current pace to meet the deadline in ${monthsLeft} months.`
            : `This goal can be reached in about ${Math.ceil(remaining / availableMonthly)} months at your available savings rate.`
          : `Extend the timeline to at least ${Math.ceil(remaining / availableMonthly)} months or increase monthly savings above $${availableMonthly.toFixed(2)}.`

    const insights = [
      `You have saved ${currentProgress}% of '${activeGoal.name}' with $${remaining.toFixed(2)} remaining.`,
      availableMonthly > 0
        ? `Your current monthly savings capacity is $${availableMonthly.toFixed(2)} after expenses.`
        : 'Your current cash flow does not yet leave room for monthly savings.',
    ]

    const recommendations = [
      remaining <= 0
        ? 'Maintain your current progress and consider setting a new goal.'
        : availableMonthly >= requiredMonthly
          ? `Contribute $${Math.min(requiredMonthly, availableMonthly).toFixed(2)} per month to stay on target.`
          : `Cut expenses or increase income to free at least $${requiredMonthly.toFixed(2)} monthly for this goal.`,
      activeGoal.dueDate
        ? 'If the current deadline is too aggressive, extend the due date to align with your realistic savings capacity.'
        : 'Set a deadline once you know how much you can save each month.',
    ]

    return {
      status,
      estimatedCompletion,
      requiredMonthly: `$${requiredMonthly.toFixed(2)}`,
      suggestedContribution,
      adjustedTimeline,
      progressPercentage: currentProgress,
      remainingAmount: `$${remaining.toFixed(2)}`,
      insights,
      recommendations,
    }
  }, [activeGoals, totalIncomeAll, totalExpenseAll])

  const aiAnalysis = useMemo(() => {
    if (activeTab !== 'analysis') {
      return {
        healthScore: 0,
        riskLevel: 'Low' as const,
        insights: ['Select the AI Financial Analysis tab to get recommendations.'],
        predictions: ['No analysis available until you visit the tab.'],
        recommendations: ['Add income and expense records to generate a tailored financial summary.'],
      }
    }

    if (!transactions.length) {
      return {
        healthScore: 50,
        riskLevel: 'Low' as const,
        insights: ['No transactions recorded yet, so your score is a neutral starting point.', 'Add income and expense entries to get an accurate financial health assessment.', 'Set a savings goal to receive goal-specific recommendations.'],
        predictions: ['Once you add transactions, this page will show your financial health score and risk level based on actual data.', 'Active tracking will help identify spending trends and saving opportunities.'],
        recommendations: ['Record your first transactions to enable the analysis.', 'Add a savings goal to get tailored recommendations.'],
      }
    }

    const totalIncomeAll = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
    const totalExpenseAll = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
    const balanceAll = totalIncomeAll - totalExpenseAll

    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()
    const thisMonthExpenses = transactions
      .filter((t) => t.type === 'expense' && new Date(t.date).getMonth() === currentMonth && new Date(t.date).getFullYear() === currentYear)
      .reduce((sum, t) => sum + t.amount, 0)
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const daysPassed = Math.max(1, new Date().getDate())
    const projectedMonthlyExpense = Math.round((thisMonthExpenses / daysPassed) * daysInMonth)

    const expenseTx = transactions.filter((t) => t.type === 'expense')
    const bigSpenders = Object.entries(
      expenseTx.reduce<Record<string, number>>((acc, tx) => {
        acc[tx.category] = (acc[tx.category] || 0) + tx.amount
        return acc
      }, {}),
    ).sort(([, a], [, b]) => b - a)
    const topCategory = bigSpenders[0]?.[0] || 'None'
    const topAmount = Number(bigSpenders[0]?.[1] ?? 0)
    const topCategoryShare = totalIncomeAll > 0 ? topAmount / totalIncomeAll : 0
    const expenseShareOfIncome = totalIncomeAll > 0 ? totalExpenseAll / totalIncomeAll : 1

    const expenseHistory = transactions
      .filter((t) => t.type === 'expense')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const latestExpense = expenseHistory[0]
    const previousExpense = expenseHistory[1]
    const recentTrend = latestExpense && previousExpense
      ? latestExpense.amount > previousExpense.amount
        ? 'Recent spending is trending upward.'
        : 'Recent spending is stable or slightly lower than the previous expense.'
      : 'Recent spending patterns are still emerging.'

    const activeGoalsList = goals.filter((goal) => !goal.completed)
    const topGoal = activeGoalsList[0]
    const savingsGoalText = topGoal
      ? `${topGoal.name}: $${topGoal.saved.toFixed(2)} saved of $${topGoal.target.toFixed(2)} goal.`
      : 'No active savings goal set.'

    let healthScore = 100
    if (totalIncomeAll <= 0) {
      healthScore = 20
    } else {
      healthScore -= Math.min(35, Math.round(expenseShareOfIncome * 30))
      healthScore -= Math.min(20, Math.max(0, Math.round((1 - balanceAll / Math.max(totalIncomeAll, 1)) * 10)))
      if (balanceAll < 0) {
        healthScore -= 25
      } else if (balanceAll < totalExpenseAll * 0.1) {
        healthScore -= 10
      }
      if (topCategoryShare >= 0.35) {
        healthScore -= 10
      }
      healthScore = Math.max(0, Math.min(100, healthScore))
    }

    const riskLevel: 'Low' | 'Medium' | 'High' = balanceAll < 0 || expenseShareOfIncome >= 1 || topCategoryShare >= 0.7
      ? 'High'
      : expenseShareOfIncome >= 0.6 || projectedMonthlyExpense > totalIncomeAll || topCategoryShare >= 0.4
      ? 'Medium'
      : 'Low'

    const insights = [
      `Your income is $${totalIncomeAll.toFixed(2)} and expenses are $${totalExpenseAll.toFixed(2)}, leaving a balance of $${balanceAll.toFixed(2)}.`,
      `Top expense category is ${topCategory}, representing ${Math.round((topAmount || 0) / Math.max(totalExpenseAll, 1) * 100)}% of total expenses.`,
      savingsGoalText,
    ]

    const predictions = [
      projectedMonthlyExpense > totalIncomeAll
        ? `If current spending continues, projected monthly expense of $${projectedMonthlyExpense} will exceed your income next month.`
        : `At current pace, projected monthly expenses are $${projectedMonthlyExpense}, which is ${Math.round((projectedMonthlyExpense / Math.max(totalIncomeAll, 1)) * 100)}% of income.`,
      recentTrend,
    ]

    const recommendations = [
      `Reduce spending in ${topCategory} and aim to keep total expenses below 80% of income.`,
      topGoal
        ? `Allocate a consistent savings amount toward '${topGoal.name}' and review your budget weekly to stay on track.`
        : 'Set a clear savings goal and move surplus funds into that goal each month.',
    ]

    return {
      healthScore,
      riskLevel,
      insights,
      predictions,
      recommendations,
    }
  }, [activeTab, transactions, goals])

  const expenseCategories = useMemo(() => {
    if (activeTab !== 'reports') return {}
    const totals: Record<string, number> = {}
    transactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        totals[t.category] = (totals[t.category] || 0) + t.amount
      })
    return totals
  }, [transactions, activeTab])

  const reportAnalysis = useMemo(() => {
    const incomes = transactions.filter((t) => t.type === 'income')
    const expenses = transactions.filter((t) => t.type === 'expense')
    const expenseCategoryEntries = Object.entries(expenseCategories).sort(([, a], [, b]) => b - a)
    const expenseCategoryDetails = expenseCategoryEntries.map(([category, amount]) => ({
      category,
      amount,
      percent: totalExpenseAll > 0 ? Math.round((amount / totalExpenseAll) * 100) : 0,
    }))
    const topExpenseCategories = expenseCategoryDetails.slice(0, 3).map((item) => `${item.category} (${formatCurrency(item.amount)}, ${item.percent}%)`)
    const topExpenseCategory = expenseCategoryEntries[0]?.[0] || 'None'

    const highestExpenseTx = expenses.reduce<Transaction | null>((highest, tx) => {
      if (!highest || tx.amount > highest.amount) return tx
      return highest
    }, null)
    const highestExpense = highestExpenseTx
      ? `${highestExpenseTx.description || highestExpenseTx.category} (${formatCurrency(highestExpenseTx.amount)})`
      : 'None'

    const avgExpense = expenses.length ? expenses.reduce((sum, tx) => sum + tx.amount, 0) / expenses.length : 0
    const largeExpenses = expenses
      .filter((tx) => tx.amount >= Math.max(avgExpense * 2, totalIncomeAll * 0.25, 150))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
    const unusualTransactions = largeExpenses.map((tx) => `${tx.description || tx.category} (${formatCurrency(tx.amount)})`)

    const incomeCategoryTotals = incomes.reduce<Record<string, number>>((totals, tx) => {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount
      return totals
    }, {})
    const incomeSources = Object.entries(incomeCategoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, amount]) => `${category} (${formatCurrency(amount)})`)

    const monthlyIncome: Record<string, number> = {}
    const monthlyExpense: Record<string, number> = {}
    transactions.forEach((tx) => {
      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const bucket = tx.type === 'income' ? monthlyIncome : monthlyExpense
      bucket[monthKey] = (bucket[monthKey] || 0) + tx.amount
    })

    const incomeMonths = Object.keys(monthlyIncome).sort()
    const expenseMonths = Object.keys(monthlyExpense).sort()

    const incomeStability = incomes.length === 0
      ? 'No income history recorded yet.'
      : incomeMonths.length <= 1
      ? 'Not enough income history to assess stability.'
      : (() => {
          const values = incomeMonths.map((month) => monthlyIncome[month] ?? 0)
          const max = Math.max(...values)
          const min = Math.min(...values)
          if (min <= 0) return 'Income has large swings or incomplete history.'
          const ratio = max / min
          if (ratio <= 1.25) return 'Stable income across recorded months.'
          if (ratio <= 1.75) return 'Moderate month-to-month income variation.'
          return 'Unstable income with significant monthly swings.'
        })()

    const incomeStabilityLevel = incomeMonths.length <= 1
      ? 'Insufficient data'
      : (() => {
          const values = incomeMonths.map((month) => monthlyIncome[month] ?? 0)
          const max = Math.max(...values)
          const min = Math.min(...values)
          if (min <= 0) return 'Unstable'
          const ratio = max / min
          if (ratio <= 1.25) return 'Stable'
          if (ratio <= 1.75) return 'Moderate'
          return 'Unstable'
        })()

    const spendingTrend = expenseMonths.length <= 1
      ? 'Not enough expense history to identify a trend.'
      : (() => {
          const values = expenseMonths.map((month) => monthlyExpense[month] ?? 0)
          const last = values[values.length - 1] ?? 0
          const prev = values[values.length - 2] ?? 0
          if (last > prev * 1.1) return `Expenses are rising: latest month is ${Math.round((last / Math.max(prev, 1) - 1) * 100)}% higher than the previous month.`
          if (last < prev * 0.9) return `Expenses are improving: latest month is ${Math.round((1 - last / Math.max(prev, 1)) * 100)}% lower than the previous month.`
          return 'Expense levels are relatively stable month to month.'
        })()

    const behaviorPattern = expenses.length === 0
      ? 'No expense behavior is available yet.'
      : totalIncomeAll <= 0
      ? 'Expenses are present without recorded income, which may indicate cash flow pressure.'
      : totalExpenseAll >= totalIncomeAll
      ? 'Spending is equal to or higher than income, signaling a tight cash flow situation.'
      : topExpenseCategory !== 'None' && expenseCategoryDetails[0] && expenseCategoryDetails[0].percent >= 50
      ? `More than half of expenses are concentrated in ${topExpenseCategory}.`
      : `Spending is diversified, with ${topExpenseCategory} as the largest category at ${expenseCategoryDetails[0]?.percent || 0}%.`

    return {
      totalIncome: totalIncomeAll,
      totalExpense: totalExpenseAll,
      netBalance: balanceAll,
      topExpenseCategories,
      topExpenseCategory,
      highestExpense,
      unusualTransactions,
      incomeSources,
      incomeStability,
      incomeStabilityLevel,
      spendingTrend,
      behaviorPattern,
      expenseCategoryDetails,
      insights: [
        `Your net balance is ${formatCurrency(balanceAll)} with ${formatCurrency(totalIncomeAll)} income and ${formatCurrency(totalExpenseAll)} expenses.`,
        topExpenseCategory !== 'None'
          ? `${topExpenseCategory} is the largest spending category and accounts for ${expenseCategoryDetails[0]?.percent || 0}% of expenses.`
          : 'No expense categories have been recorded yet.',
      ],
      recommendations: [
        totalExpenseAll > totalIncomeAll
          ? 'Review and reduce large expenses until monthly spending is below income.'
          : `Keep monitoring ${topExpenseCategory} spending and avoid letting one expense category dominate more than half of your budget.`,
        incomes.length === 0
          ? 'Record all income sources so income stability can be tracked accurately.'
          : 'Verify large transactions and keep a regular income record to improve forecasting.',
      ],
    }
  }, [transactions, expenseCategories, totalExpenseAll, totalIncomeAll, balanceAll])

  const pieChartData = useMemo(() => {
    if (activeTab !== 'dashboard') return []
    const expenses = transactions.filter((t) => t.type === 'expense')
    const categoryTotals: Record<string, number> = {}
    expenses.forEach((tx) => {
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount
    })
    return Object.entries(categoryTotals).map(([category, value]) => ({ name: category, value }))
  }, [transactions, activeTab])

  const lineChartData = useMemo(() => {
    if (activeTab !== 'dashboard') return []
    const monthlyData: Record<string, { income: number; expense: number }> = {}
    transactions.forEach((tx) => {
      const date = new Date(tx.date)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!monthlyData[key]) monthlyData[key] = { income: 0, expense: 0 }
      monthlyData[key][tx.type] += tx.amount
    })
    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, income: data.income, expense: data.expense }))
  }, [transactions, activeTab])

  const tabs: { id: 'dashboard' | 'income' | 'analysis' | 'budget' | 'goals' | 'reports' | 'chat'; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'income', label: 'Income & Expense Entry', icon: '💰' },
    { id: 'analysis', label: 'AI Financial Analysis', icon: '🤖' },
    { id: 'budget', label: 'Budget Recommendation', icon: '📈' },
    { id: 'goals', label: 'Savings Goal Tracker', icon: '🎯' },
    { id: 'reports', label: 'Reports', icon: '🧾' },
    { id: 'chat', label: 'AI Chat Assistant', icon: '💬' },
  ]

  const budgetRecommendation = useMemo(() => {
    const monthlyIncome = totalIncome || 0
    const expenseRatio = monthlyIncome > 0 ? totalExpense / monthlyIncome : 1
    const activeSavingsGoal = goals.find((goal) => !goal.completed)

    let needsPct = 0.5
    let wantsPct = 0.3
    let savingsPct = 0.2
    let explanation = 'A standard 50/30/20 split is a good starting point for balanced budgeting.'

    if (monthlyIncome <= 0) {
      explanation = 'No income is recorded yet. Add income entries to generate a tailored budget recommendation.'
    } else if (expenseRatio >= 0.95) {
      needsPct = 0.55
      wantsPct = 0.25
      savingsPct = 0.2
      explanation = 'Expenses are very close to income, so tighten discretionary spending and preserve at least 20% for savings.'
    } else if (expenseRatio >= 0.8) {
      needsPct = 0.52
      wantsPct = 0.28
      savingsPct = 0.2
      explanation = 'Household spending is high relative to income, so keep wants under 30% while maintaining a savings buffer.'
    } else if (totalExpense <= monthlyIncome * 0.6 && activeSavingsGoal) {
      needsPct = 0.45
      wantsPct = 0.3
      savingsPct = 0.25
      explanation = 'You have budget flexibility to increase savings because expenses are under control.'
    } else if (activeSavingsGoal) {
      savingsPct = 0.22
      wantsPct = 0.28
      explanation = 'With an active savings goal, prioritize slightly higher savings while keeping wants manageable.'
    }

    const budgetAmounts = {
      needs: (monthlyIncome * needsPct).toFixed(2),
      wants: (monthlyIncome * wantsPct).toFixed(2),
      savings: (monthlyIncome * savingsPct).toFixed(2),
      needsPct: Math.round(needsPct * 100),
      wantsPct: Math.round(wantsPct * 100),
      savingsPct: Math.round(savingsPct * 100),
      available: monthlyIncome > 0 ? (monthlyIncome - totalExpense).toFixed(2) : '0.00',
    }

    const topCategories = Object.entries(expenseCategoryTotals).sort(([, a], [, b]) => b - a)
    const categorySuggestions = topCategories.slice(0, 3).map(([category, amount]) => {
      const currentPct = monthlyIncome > 0 ? amount / monthlyIncome : 0
      const targetPct = monthlyIncome > 0 ? Math.min(0.25, Math.max(0.1, currentPct * 0.85)) : 0
      return {
        category,
        display: monthlyIncome > 0
          ? `${category}: $${(monthlyIncome * targetPct).toFixed(2)} (${Math.round(targetPct * 100)}% of income)`
          : `${category}: $${amount.toFixed(2)} currently`,
      }
    })

    const insights = [
      monthlyIncome > 0
        ? `Your expenses are ${Math.round(expenseRatio * 100)}% of income, so maintain savings around ${budgetAmounts.savingsPct}% of earnings.`
        : 'Budget recommendations will become more accurate after you add income records.',
      categorySuggestions.length
        ? `Top spending categories are ${topCategories.slice(0, 2).map(([category]) => category).join(' and ')}. Limit those categories to the suggested amounts.`
        : 'No expense categories are available yet to generate category-specific budgets.',
    ]

    const recommendations = [
      `Allocate needs, wants, and savings using ${budgetAmounts.needsPct}% / ${budgetAmounts.wantsPct}% / ${budgetAmounts.savingsPct}% of your income.`,
      activeSavingsGoal
        ? `Direct a steady savings amount toward '${activeSavingsGoal.name}' and review category spending weekly.`
        : 'Create a savings goal and direct monthly surplus into that target to improve savings performance.',
    ]

    return {
      ...budgetAmounts,
      categorySuggestions,
      insights,
      recommendations,
      explanation,
    }
  }, [activeTab, totalIncome, totalExpense, expenseCategoryTotals, goals])

  const submitTransaction = (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    const amount = Number(formTransaction.amount ?? 0)
    if (!formTransaction.description || !amount || amount <= 0) {
      return
    }

    let category = formTransaction.category || 'General'
    if (category === 'General') {
      category = autoCategorize(formTransaction.description)
    }

    const next: Transaction[] = [
      ...transactions,
      {
        id: Date.now(),
        date: formTransaction.date || new Date().toISOString().slice(0, 10),
        description: formTransaction.description,
        amount,
        category,
        type: formTransaction.type as TransactionType,
      },
    ]

    updateTransactions(next)
    setFormTransaction({ date: new Date().toISOString().slice(0, 10), type: 'expense', category: 'General' })
  }

  const submitGoal = (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!goalForm.name || !goalForm.target || goalForm.target <= 0) return

    const initialSaved = Number(goalForm.saved || 0)
    const targetVal = Number(goalForm.target)

    const newGoal: SavingsGoal = {
      id: Date.now(),
      name: goalForm.name,
      target: targetVal,
      saved: initialSaved,
      category: goalForm.category?.trim() || 'Unspecified',
      dueDate: goalForm.dueDate?.trim() || undefined,
      completed: initialSaved >= targetVal,
      createdAt: Date.now(),
    }

    const next: SavingsGoal[] = [...goals, newGoal]

    updateGoals(next)
    setGoalForm({ name: '', target: 0, saved: 0, dueDate: '', category: 'short-term' })
  }

  const updateGoalSaved = (id: number, value: number) => {
    if (!user) return
    const next = goals.map((goal) => {
      if (goal.id !== id) return goal
      const newSaved = Math.max(0, Math.min(goal.target, goal.saved + value))
      return {
        ...goal,
        saved: newSaved,
        completed: newSaved >= goal.target,
      }
    })
    updateGoals(next)
  }

  const moveGoal = (id: number, direction: -1 | 1) => {
    if (!user) return
    const idx = goals.findIndex((goal) => goal.id === id)
    if (idx === -1) return
    const target = idx + direction
    if (target < 0 || target >= goals.length) return
    const next = [...goals]
    const tmp = next[idx]!
    next[idx] = next[target]!
    next[target] = tmp
    updateGoals(next)
  }

  const addGoalContribution = (id: number) => {
    const contribution = Number(goalContributions[id] || 0)
    if (!contribution || contribution <= 0) return
    updateGoalSaved(id, contribution)
    setGoalContributions((prev) => ({ ...prev, [id]: 0 }))
  }

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return
    const userMessage = { role: 'user' as const, content: chatInput }
    setChatMessages((prev) => [...prev, userMessage])
    const messageText = chatInput
    setChatInput('')
    setIsChatLoading(true)

    try {
      const topExpenseCategory = Object.entries(expenseCategories).sort(([, a], [, b]) => b - a)[0]?.[0] || 'General'
      const assistantText = isRiskQuestion(messageText)
        ? buildRiskReductionResponse()
        : await generateFinanceAssistantResponse(messageText, {
            totalIncome,
            totalExpense,
            balance,
            goalsActive: activeGoals.length,
            goalsCompleted: completedGoals.length,
            goalsProgress,
            activeTab,
            topExpenseCategory,
          })
      const assistantMessage = { role: 'assistant' as const, content: assistantText }
      setChatMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t process that. Please try again.' }])
    } finally {
      setIsChatLoading(false)
    }
  }

  const removeTransaction = (id: number) => {
    if (!user) return
    updateTransactions(transactions.filter((tx) => tx.id !== id))
  }

  if (!user) {
    return (
      <main className="page-wrap py-8 bg-[var(--bg-base)] text-[var(--foreground)]">
        <h1 className="mb-4 text-3xl font-bold text-[var(--foreground)]">FinSight AI: Personal Finance Tracker</h1>
        <p className="mb-8 text-sm text-[var(--sea-ink-soft)]">Register or log in to manage your budget, spending, and savings goals.</p>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="island-shell rounded-xl p-5">
            <h2 className="mb-3 text-xl font-semibold">{mode === 'login' ? 'Login' : 'Register'}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setAuthError(null)
                if (mode === 'login') {
                  const err = login(username.trim(), password)
                  if (err) setAuthError(err)
                } else {
                  const err = register(username.trim(), password, displayName.trim())
                  if (err) setAuthError(err)
                }
              }}
              className="space-y-3"
            >
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username or email"
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-teal-400 dark:focus:ring-teal-500/30"
                />
              </label>
              {mode === 'register' && (
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  Display Name
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter a display name for the dashboard"
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-teal-400 dark:focus:ring-teal-500/30"
                  />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                Password
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Create a secure password"
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-teal-400 dark:focus:ring-teal-500/30"
                />
              </label>
              {authError && <div className="text-sm text-red-600">{authError}</div>}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700"
                >
                  {mode === 'login' ? 'Login' : 'Create Account'}
                </button>
                <button
                  type="button"
                  className="text-sm text-teal-700 underline"
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login')
                    setAuthError(null)
                  }}
                >
                  {mode === 'login' ? 'Need an account?' : 'Already have an account?'}
                </button>
              </div>
            </form>
          </section>
          <section className="island-shell rounded-xl p-5">
            <h2 className="mb-3 text-xl font-semibold">Why FinSight AI?</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
              <li>Track income and expenses easily.</li>
              <li>Analyze spending patterns and get AI insights.</li>
              <li>Set and monitor savings goals.</li>
              <li>Receive budget recommendations based on your data.</li>
              <li>Dashboard + reports with history and charts.</li>
            </ul>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="page-wrap !w-[min(1800px,calc(100%-2rem))] py-8 bg-[var(--bg-base)]">
      <div className="mb-6 rounded-[2rem] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-sm shadow-[rgba(0,0,0,0.12)] backdrop-blur-sm">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">FinSight AI Dashboard</h1>
            <p className="mt-2 max-w-full text-sm text-[var(--muted-foreground)]">
              Hello, {user || 'Guest'}! Review your financial health and make smarter money choices with easy-to-use tracking tools and insights.
            </p>
          </div>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <aside className="mb-6 rounded-[2rem] bg-gradient-to-b from-[#5144ff] via-[#3a33c7] to-[#231d7a] p-6 text-white shadow-[0_32px_120px_rgba(65,52,206,0.16)] lg:self-start">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-white/70">Overview</p>
            <h2 className="mt-4 text-2xl font-semibold text-white">FinSight AI</h2>
            <p className="mt-3 text-sm leading-6 text-white/75">Quick access to dashboard metrics, spending insights, goals, and AI support.</p>
          </div>

          <div className="space-y-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-white/15 text-white shadow-[0_12px_30px_rgba(255,255,255,0.12)]'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

        </aside>

        <div className="min-w-0">
          {activeTab === 'dashboard' && riskPopupOpen && riskAnalysis.riskLevel !== 'Low' && (
            <div className={riskPopupClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Risk Alert</p>
                  <p className="text-xs text-gray-500">A key financial risk has been detected from your latest data.</p>
                </div>
            <button
              onClick={() => setRiskPopupOpen(false)}
              className="rounded-full px-3 py-1 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-strong)]"
            >
              X
            </button>
          </div>

          <div className={`mt-4 rounded-3xl border p-4 ${
            riskAnalysis.riskLevel === 'High'
              ? 'border-red-300 bg-red-50/90 text-red-900 shadow-red-100'
              : 'border-yellow-200 bg-yellow-50 text-yellow-900'
          }`}>
            <p className="text-xs uppercase tracking-[0.2em]">Risk Level</p>
            <p className="mt-2 text-xl font-semibold">{riskAnalysis.riskLevel}</p>
          </div>

          <div className="mt-4 text-sm">
            <p className="mb-2 font-semibold">Priority Issues</p>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {riskAlertIssues.map((issue) => (
                <li key={issue} className="text-[inherit]">{issue}</li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => {
              setRiskPopupOpen(false)
              document.getElementById('risk-analysis-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className="mt-4 inline-flex w-full items-center justify-center rounded-3xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            View Details
          </button>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <>
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_32px_60px_rgba(32,54,119,0.08)]">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Balance Overview</p>
                  <h2 className="mt-3 text-3xl font-semibold text-slate-900">Your current cash position</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Track income, spending, and goals with premium clarity.</p>
                </div>
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-white/95 px-6 py-5 text-center shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Net Balance</p>
                  <p className="mt-3 text-2xl sm:text-3xl font-semibold text-[#4b3cff] whitespace-nowrap">{formatCurrency(balance)}</p>
                  <p className="mt-2 text-sm text-slate-500">{balance >= 0 ? 'Healthy cash flow' : 'Review expenses'}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 justify-items-stretch">
                <article className="rounded-[1.5rem] border border-[var(--border)] bg-white/90 p-5 shadow-sm w-full">
                  <p className="text-sm font-semibold text-slate-500">Total Income</p>
                  <p className="mt-3 text-lg sm:text-2xl font-semibold text-[#4b3cff] whitespace-nowrap">{formatCurrency(totalIncome)}</p>
                </article>
                <article className="rounded-[1.5rem] border border-[var(--border)] bg-white/90 p-5 shadow-sm w-full">
                  <p className="text-sm font-semibold text-slate-500">Total Expense</p>
                  <p className="mt-3 text-lg sm:text-2xl font-semibold text-[#ff5d8b] whitespace-nowrap">{formatCurrency(totalExpense)}</p>
                </article>
                <article className="rounded-[1.5rem] border border-[var(--border)] bg-white/90 p-5 shadow-sm">
                  <p className="text-sm font-semibold text-slate-500">Goal Progress</p>
                  <p className="mt-3 text-2xl font-semibold text-[#3b8cff]">{goalsProgress.toFixed(0)}%</p>
                </article>
                <article className="rounded-[1.5rem] border border-[var(--border)] bg-white/90 p-5 shadow-sm">
                  <p className="text-sm font-semibold text-slate-500">Expense Trend</p>
                  <p className="mt-3 text-2xl font-semibold text-[#41b4ff]">{totalExpenseAll > 0 ? `${Math.round((totalExpenseAll / Math.max(totalIncomeAll, 1)) * 100)}%` : '0%'}</p>
                </article>
              </div>

              <div className="mt-6 grid gap-6">
                <section className="rounded-[2rem] border border-[var(--border)] bg-white/95 p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Daily balance overview</h3>
                      <p className="mt-1 text-sm text-slate-500">A quick summary of your recent income and spending trends.</p>
                    </div>
                    <div className="rounded-full bg-[#eff2ff] px-3 py-1 text-xs font-semibold text-[#4b3cff]">Last 14 days</div>
                  </div>

                  <div className="mt-5 h-[240px] min-h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#d9e2ff" />
                        <XAxis dataKey="month" tick={{ fill: '#6b7bbd' }} />
                        <YAxis tick={{ fill: '#6b7bbd' }} />
                        <Tooltip contentStyle={{ borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.96)', borderColor: '#d8d9ff' }} />
                        <Line type="monotone" dataKey="income" stroke="#4b3cff" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="expense" stroke="#ff5d8b" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <div className="grid gap-6">
                  <section className="rounded-[2rem] border border-[var(--border)] bg-white/95 p-5 shadow-sm">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Balance statistic</p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-900">Spend distribution</h3>
                      </div>
                      <span className="rounded-full bg-[#f5f3ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#6949ff]">Top categories</span>
                    </div>

                    <div className="mx-auto h-[240px] w-full max-w-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={92}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {pieChartData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={["#4b3cff", "#3ad6ff", "#ffb348", "#ff5d8b", "#af8dff"][index % 5]!} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.96)', borderColor: '#d8d9ff' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <ul className="mt-6 space-y-3 text-sm text-slate-700">
                      {pieChartData.map((item) => (
                        <li key={item.name} className="flex items-center justify-between rounded-3xl border border-[var(--border)] bg-[#f7f8ff] px-4 py-3">
                          <span>{item.name}</span>
                          <span className="font-semibold text-slate-900">{Math.round((item.value / Math.max(totalExpenseAll, 1)) * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>
            </div>
          </section>

          <section
            id="risk-analysis-section"
            className={`mt-6 rounded-[2rem] p-6 shadow-[0_28px_70px_rgba(33,56,129,0.08)] ${
              riskAnalysis.riskLevel === 'High'
                ? 'border border-red-200 bg-red-50'
                : riskAnalysis.riskLevel === 'Medium'
                ? 'border border-yellow-200 bg-yellow-50'
                : 'border border-[var(--border)] bg-[var(--surface)]'
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Financial Risk Analysis</p>
                <p className="text-xs text-slate-700">Expanded risk review and recommendations.</p>
              </div>
              <div className={riskBadgeClass}>{riskAnalysis.riskLevel}</div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-[1.8rem] border border-[var(--border)] bg-white/95 p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff3f6] text-[#d4506c]">!</span>
                  Detected Issues
                </div>
                <ul className="space-y-3 text-sm text-slate-700">
                  {riskAnalysis.issues.map((issue) => (
                    <li key={issue} className="rounded-2xl border border-[#f5d5dc] bg-[#fff3f6] p-3 text-sm text-[#a52d5f]">
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[1.8rem] border border-[var(--border)] bg-white/95 p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f3ff] text-[#3b64c0]">✓</span>
                  Recommendations
                </div>
                <ul className="space-y-3 text-sm text-slate-700">
                  {riskAnalysis.recommendations.map((recommendation) => (
                    <li key={recommendation} className="rounded-2xl border border-[#e5ecff] bg-[#f7faff] p-3">
                      {recommendation}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === 'budget' && (
        <section className="mt-6 island-shell rounded-xl p-4">
          <h3 className="mb-3 text-lg font-semibold">Budget Recommendation</h3>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="mb-2 text-sm font-semibold">AI Recommended Budget:</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>Needs: ${budgetRecommendation.needs} ({budgetRecommendation.needsPct}%)</li>
                <li>Wants: ${budgetRecommendation.wants} ({budgetRecommendation.wantsPct}%)</li>
                <li>Savings: ${budgetRecommendation.savings} ({budgetRecommendation.savingsPct}%)</li>
                <li>Available after expenses: ${budgetRecommendation.available}</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="mb-2 text-sm font-semibold">Category Budget Suggestions:</p>
              <ul className="space-y-2 text-sm text-gray-700">
                {budgetRecommendation.categorySuggestions.length ? (
                  budgetRecommendation.categorySuggestions.map((item) => (
                    <li key={item.category}>{item.display}</li>
                  ))
                ) : (
                  <li>No category suggestions available yet.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-sm font-semibold">AI Budget Insights:</p>
            <ul className="space-y-2 text-sm text-gray-700">
              {budgetRecommendation.insights.map((insight, idx) => (
                <li key={idx}>{insight}</li>
              ))}
            </ul>
          </div>

          <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-sm font-semibold">AI Recommendations:</p>
            <ul className="space-y-2 text-sm text-gray-700">
              {budgetRecommendation.recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>

          <p className="mt-4 text-xs text-gray-500">{budgetRecommendation.explanation}</p>
        </section>
      )}

      {activeTab === 'analysis' && (
        <Suspense fallback={<div className="island-shell rounded-xl p-4 text-sm text-gray-600">Loading AI Analysis...</div>}>
          <AIAnalysisPanel analysis={aiAnalysis} />
        </Suspense>
      )}

      {activeTab === 'income' && (
        <section className="mt-6 island-shell rounded-xl p-4">
          <h3 className="mb-3 text-lg font-semibold">Income & Expense Entry</h3>
          <p className="mb-4 text-sm text-gray-500">Enter each transaction to keep your budget updated. Use AI analysis tab to review suggestions.</p>
          <form onSubmit={submitTransaction} className="grid gap-2 sm:grid-cols-2">
            <input
              value={formTransaction.description || ''}
              onChange={(e) => setFormTransaction((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description (e.g., Freelance project, Grocery shopping)"
              className="rounded-lg border px-3 py-2"
            />
            <input
              value={formTransaction.amount ?? ''}
              onChange={(e) => setFormTransaction((prev) => ({ ...prev, amount: Number(e.target.value) }))}
              placeholder="Amount (e.g., 150.00)"
              type="number"
              step="0.01"
              min="0"
              className="rounded-lg border px-3 py-2"
            />
            <input
              value={formTransaction.date || ''}
              onChange={(e) => setFormTransaction((prev) => ({ ...prev, date: e.target.value }))}
              type="date"
              className="rounded-lg border px-3 py-2"
            />
            <select
              value={formTransaction.type}
              onChange={(e) => setFormTransaction((prev) => ({ ...prev, type: e.target.value as TransactionType }))}
              className="rounded-lg border px-3 py-2"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <input
              value={formTransaction.category || ''}
              onChange={(e) => setFormTransaction((prev) => ({ ...prev, category: e.target.value }))}
              placeholder="Category (e.g., Groceries, Rent)"
              className="rounded-lg border px-3 py-2"
            />
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700"
            >
              Save Transaction
            </button>
          </form>

          <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h4 className="mb-3 text-sm font-semibold">Smart Entry Assistant</h4>
            <p className="mb-3 text-xs text-gray-500">Suggestions for this transaction before saving.</p>
            <div className="space-y-3 text-sm text-[var(--foreground)]">
              <div>
                <p className="font-semibold">Suggested Edits:</p>
                <ul className="list-disc pl-5">
                  <li>Category: {smartEntrySuggestion.category}</li>
                  <li>Type: {smartEntrySuggestion.type}</li>
                  <li>Amount (if unusual): {smartEntrySuggestion.amountNote}</li>
                </ul>
              </div>
              {smartEntrySuggestion.warning ? (
                <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
                  <p className="font-semibold">AI Warning:</p>
                  <p>{smartEntrySuggestion.warning}</p>
                </div>
              ) : null}
              <div>
                <p className="font-semibold">AI Suggestion:</p>
                <p>{smartEntrySuggestion.suggestion}</p>
              </div>
            </div>
          </section>
        </section>
      )}

      {activeTab === 'goals' && (
        <section className="mt-6 island-shell rounded-xl p-4">
          <h3 className="mb-3 text-lg font-semibold">Savings Goal Tracker</h3>
          <p className="mb-3 text-sm text-gray-500">Create goals, track progress and see realistic recommendations based on income.</p>

          <section className="mb-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h4 className="mb-3 text-sm font-semibold">Goal Feasibility Analysis</h4>
            <div className="space-y-2 text-sm text-gray-700">
              <p><strong>Feasibility Status:</strong> {goalAnalysis.status}</p>
              <p><strong>Estimated Completion Time:</strong> {goalAnalysis.estimatedCompletion}</p>
              <p><strong>Required Monthly Savings:</strong> {goalAnalysis.requiredMonthly}</p>
            </div>

            <div className="mt-4 rounded-2xl bg-[var(--surface-strong)] p-4 text-sm text-gray-700">
              <p className="mb-2 font-semibold">Savings Plan Recommendation:</p>
              <p><strong>Suggested Monthly Contribution:</strong> {goalAnalysis.suggestedContribution}</p>
              <p><strong>Adjusted Timeline if needed:</strong> {goalAnalysis.adjustedTimeline}</p>
            </div>

            <div className="mt-4 rounded-2xl bg-[var(--surface-strong)] p-4 text-sm text-gray-700">
              <p className="mb-2 font-semibold">Progress Insight:</p>
              <ul className="list-disc pl-5">
                <li>Current Progress Percentage: {goalAnalysis.progressPercentage}%</li>
                <li>Remaining Amount: {goalAnalysis.remainingAmount}</li>
              </ul>
            </div>

            <div className="mt-4 rounded-2xl bg-[var(--surface-strong)] p-4 text-sm text-gray-700">
              <p className="mb-2 font-semibold">AI Insights:</p>
              <ul className="list-disc pl-5">
                {goalAnalysis.insights.map((insight, idx) => (
                  <li key={idx}>{insight}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4 rounded-2xl bg-[var(--surface-strong)] p-4 text-sm text-gray-700">
              <p className="mb-2 font-semibold">AI Recommendations:</p>
              <ul className="list-disc pl-5">
                {goalAnalysis.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          </section>

          <form onSubmit={submitGoal} className="grid gap-2 md:grid-cols-2">
            <input
              value={goalForm.name || ''}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Name of goal (e.g., Vacation, Emergency Fund)"
              className="w-full rounded-lg border px-3 py-2"
            />
            <input
              value={goalForm.category || ''}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, category: e.target.value }))}
              placeholder="Optional category (short-term, long-term)"
              className="w-full rounded-lg border px-3 py-2"
            />
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Target Amount</span>
              <input
                value={goalForm.target ?? ''}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, target: Number(e.target.value) }))}
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount needed for goal (e.g., 1000000)"
                aria-label="Target amount"
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Saved Amount</span>
              <input
                value={goalForm.saved ?? ''}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, saved: Number(e.target.value) }))}
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount already saved (e.g., 10000)"
                aria-label="Saved amount"
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <input
              value={goalForm.dueDate || ''}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              type="date"
              className="w-full rounded-lg border px-3 py-2"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Create Goal
            </button>
          </form>

          <div className="mt-6">
            <h4 className="font-semibold">Goal overview</h4>
            <p className="text-xs text-gray-500 mb-3">Active goals: {activeGoals.length}, completed: {completedGoals.length}</p>

            {activeGoals.length ? (
              <div className="space-y-4">
                {activeGoals.map((goal) => {
                  const progress = Math.min(100, (goal.saved / Math.max(1, goal.target)) * 100)
                  const remaining = Math.max(0, goal.target - goal.saved)
                  const dueDate = goal.dueDate ? new Date(goal.dueDate) : null
                  const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
                  const milestone = progress >= 75 ? '75%' : progress >= 50 ? '50%' : progress >= 25 ? '25%' : null
                  const dueStatus = goal.dueDate
                    ? daysLeft != null
                      ? daysLeft >= 0
                        ? `Due ${goal.dueDate} (${daysLeft} days left)`
                        : `Due ${goal.dueDate} (past due)`
                      : `Due ${goal.dueDate}`
                    : 'No deadline set'

                  const monthlyNeeded = daysLeft != null && daysLeft > 0 ? remaining / Math.max(1, daysLeft / 30) : remaining / 12
                  const weeklyNeeded = monthlyNeeded / 4

                  return (
                    <div key={goal.id} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h5 className="text-base font-semibold">{goal.name}</h5>
                          <p className="text-xs text-gray-500">{goal.category} • ${goal.target.toFixed(2)} target</p>
                          <p className="text-xs text-gray-500">{dueStatus}</p>
                        </div>
                        <span className="text-xs font-semibold text-indigo-600">{progress.toFixed(0)}% complete</span>
                      </div>

                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: `${progress}%` }} />
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs text-gray-600">
                        <div>Saved ${goal.saved.toFixed(2)} / ${goal.target.toFixed(2)}</div>
                        <div>{milestone ? `Milestone reached: ${milestone}` : 'Milestone: <25%'}</div>
                        <div>Recommended: ${monthlyNeeded.toFixed(2)}/month, ${weeklyNeeded.toFixed(2)}/week</div>
                        <div>Remaining: ${remaining.toFixed(2)}</div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={goalContributions[goal.id] ?? ''}
                            onChange={(e) => setGoalContributions((prev) => ({ ...prev, [goal.id]: Number(e.target.value) }))}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Deposit amount"
                            className="w-full rounded-lg border px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => addGoalContribution(goal.id)}
                            className="rounded bg-cyan-600 px-2 py-1 text-xs text-white hover:bg-cyan-700"
                          >
                            Add Funds
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateGoalSaved(goal.id, 10)}
                            className="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600"
                          >
                            +$10
                          </button>
                          <button
                            type="button"
                            onClick={() => updateGoalSaved(goal.id, 50)}
                            className="rounded bg-yellow-500 px-2 py-1 text-xs text-white hover:bg-yellow-600"
                          >
                            +$50
                          </button>
                          <button
                            type="button"
                            onClick={() => updateGoalSaved(goal.id, Number((totalIncome * 0.2).toFixed(2)))}
                            className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
                          >
                            Budget 20%
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveGoal(goal.id, -1)}
                          className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-800 hover:bg-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveGoal(goal.id, 1)}
                          className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-800 hover:bg-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          onClick={() => updateGoalSaved(goal.id, goal.target - goal.saved)}
                          className="rounded bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-600"
                        >
                          Mark complete
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGoal(goal.id)}
                          className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No active goals. Add one to start tracking.</p>
            )}

            {completedGoals.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <h4 className="mb-2 text-sm font-semibold">Completed goals archive</h4>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-[var(--foreground)]">
                  {completedGoals.map((goal) => (
                    <li key={goal.id} className="rounded-lg border bg-green-50 px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-[var(--foreground)]">
                      <strong>{goal.name}</strong> • ${goal.target.toFixed(2)} target • saved ${goal.saved.toFixed(2)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}


      {activeTab === 'reports' && (
        <>
          <section className="mt-6 island-shell rounded-xl p-4">
            <h3 className="mb-3 text-lg font-semibold">Financial Reports Summary</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="mb-2 text-sm font-semibold">Financial Summary</p>
                <p className="text-sm">Total Income: {formatCurrency(reportAnalysis.totalIncome)}</p>
                <p className="text-sm">Total Expenses: {formatCurrency(reportAnalysis.totalExpense)}</p>
                <p className="text-sm">Net Balance: {formatCurrency(reportAnalysis.netBalance)}</p>
              </div>
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="mb-2 text-sm font-semibold">Spending Analysis</p>
                    <p className="text-sm">Top Expense Categories: {reportAnalysis.topExpenseCategories.length ? reportAnalysis.topExpenseCategories.join(', ') : 'No expense categories yet.'}</p>
                <p className="text-sm">Highest Expense: {reportAnalysis.highestExpense}</p>
                <p className="text-sm">Unusual or Large Transactions: {reportAnalysis.unusualTransactions.length ? reportAnalysis.unusualTransactions.join('; ') : 'None detected.'}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="mb-2 text-sm font-semibold">Income Analysis</p>
                <p className="text-sm">Income Sources: {reportAnalysis.incomeSources.length ? reportAnalysis.incomeSources.join(', ') : 'No income entries yet.'}</p>
                <p className="text-sm">Income Stability: {reportAnalysis.incomeStabilityLevel} — {reportAnalysis.incomeStability}</p>
              </div>
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="mb-2 text-sm font-semibold">Trends & Patterns</p>
                <p className="text-sm">Key Spending Trends: {reportAnalysis.spendingTrend}</p>
                <p className="text-sm">Behavioral Patterns: {reportAnalysis.behaviorPattern}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="mb-2 text-sm font-semibold">AI Insights</p>
                <ul className="list-disc pl-5 text-sm">
                  {reportAnalysis.insights.map((insight, idx) => (
                    <li key={idx}>{insight}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="mb-2 text-sm font-semibold">AI Recommendations</p>
                <ul className="list-disc pl-5 text-sm">
                  {reportAnalysis.recommendations.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="mt-6 island-shell rounded-xl p-4">
            <h3 className="mb-3 text-lg font-semibold">Transaction History</h3>
        {transactions.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2 font-semibold">Date</th>
                  <th className="p-2 font-semibold">Type</th>
                  <th className="p-2 font-semibold">Category</th>
                  <th className="p-2 font-semibold">Description</th>
                  <th className="p-2 font-semibold">Amount</th>
                  <th className="p-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions
                  .slice()
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((tx) => (
                    <tr key={tx.id} className="border-t border-slate-200">
                      <td className="p-2">{tx.date}</td>
                      <td className="p-2 capitalize">{tx.type}</td>
                      <td className="p-2">{tx.category}</td>
                      <td className="p-2">{tx.description}</td>
                      <td className={`p-2 font-semibold ${tx.type === 'income' ? 'text-blue-600' : 'text-red-600'}`}>
                        {tx.type === 'expense' ? '-' : '+'}${tx.amount.toFixed(2)}
                      </td>
                      <td className="p-2">
                        <button
                          className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-800 hover:bg-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                          onClick={() => removeTransaction(tx.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No recorded transactions yet.</p>
        )}
      </section>

      <section className="mt-6 island-shell rounded-xl p-4">
        <h3 className="mb-3 text-lg font-semibold">Expense Pattern Breakdown</h3>
        {reportAnalysis.expenseCategoryDetails && reportAnalysis.expenseCategoryDetails.length ? (
          <div className="space-y-4 text-sm text-gray-700">
            {reportAnalysis.expenseCategoryDetails.map((item) => (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{item.category}</span>
                  <span>{item.percent}% • {formatCurrency(item.amount)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Add expenses to begin analyzing categories.</p>
        )}
      </section>
    </>
  )}

      {activeTab === 'chat' && (
        <section className="mt-6 island-shell rounded-xl p-4">
          <h3 className="mb-3 text-lg font-semibold">AI Chat Assistant</h3>
          <p className="mb-4 text-sm text-gray-500">Ask questions about your finances, get navigation help, or request app features.</p>

          <div className="flex h-96 flex-col">
            <div className="flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-gray-500">Start a conversation by typing a message below.</p>
              ) : (
                <div className="space-y-4">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)]'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="max-w-xs rounded-lg bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]">
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Ask about your finances or app features..."
                className="flex-1 rounded-lg border px-3 py-2"
                disabled={isChatLoading}
              />
              <button
                onClick={sendChatMessage}
                disabled={isChatLoading || !chatInput.trim()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </section>
      )}
        </div>
      </div>
</main>
  )
}

export const Route = createFileRoute('/demo/finances')({ component: FinanceDashboard })
