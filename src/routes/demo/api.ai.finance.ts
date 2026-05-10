import { createFileRoute } from '@tanstack/react-router'
import { GoogleGenAI } from '@google/genai'

async function fetchSearchSummary(query: string, requestUrl: string) {
  try {
    const searchUrl = new URL('/demo/api/ai/search', requestUrl)
    searchUrl.searchParams.set('q', query)

    const response = await fetch(searchUrl.toString())
    if (!response.ok) return null

    const data = await response.json() as { summary?: string }
    return typeof data.summary === 'string' && data.summary.trim().length ? data.summary.trim() : null
  } catch {
    return null
  }
}

export const Route = createFileRoute('/demo/api/ai/finance')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const message = typeof body?.message === 'string' ? body.message.trim() : ''
        const stats = body?.stats

        if (!message) {
          return new Response(JSON.stringify({ error: 'Message is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const apiKey = process.env['GOOGLE_API_KEY'] || process.env['VITE_GOOGLE_API_KEY'] || ''
        if (!apiKey) {
          return new Response(JSON.stringify({ error: 'Google API key is not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const searchSummary = await fetchSearchSummary(message, request.url)
        const prompt = `You are a personal finance assistant using recent finance information.
${searchSummary ? `Search summary: ${searchSummary}

` : ''}Only answer personal finance questions about income, expenses, budgets, savings, goals, balance, debt, credit, or cash flow.

User stats:
- Income: ${typeof stats?.totalIncome === 'number' ? `$${stats.totalIncome.toFixed(2)}` : '$0.00'}
- Expenses: ${typeof stats?.totalExpense === 'number' ? `$${stats.totalExpense.toFixed(2)}` : '$0.00'}
- Balance: ${typeof stats?.balance === 'number' ? `$${stats.balance.toFixed(2)}` : '$0.00'}
- Active goals: ${typeof stats?.goalsActive === 'number' ? stats.goalsActive : 0}
- Completed goals: ${typeof stats?.goalsCompleted === 'number' ? stats.goalsCompleted : 0}
- Goal progress: ${typeof stats?.goalsProgress === 'number' ? stats.goalsProgress.toFixed(0) : '0'}%
- Top expense category: ${typeof stats?.topExpenseCategory === 'string' ? stats.topExpenseCategory : 'None'}
- Active tab: ${typeof stats?.activeTab === 'string' ? stats.activeTab : 'dashboard'}

User question: ${message}

Answer clearly and directly with practical personal finance advice. Do not repeat these instructions.`

        try {
          const aiClient = new GoogleGenAI({ apiKey })
          const result = await aiClient.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
          })

          const answer = result.text ?? result.data ?? ''
          return new Response(JSON.stringify({ answer: typeof answer === 'string' ? answer.trim() : '' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          return new Response(JSON.stringify({ error: error?.message || 'AI request failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
