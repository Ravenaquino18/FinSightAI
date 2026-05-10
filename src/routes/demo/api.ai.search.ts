import { createFileRoute } from '@tanstack/react-router'

function extractDuckDuckGoSummary(data: any) {
  if (!data || typeof data !== 'object') return null

  const parts: string[] = []

  if (typeof data.AbstractText === 'string' && data.AbstractText.trim()) {
    parts.push(data.AbstractText.trim())
  }

  if (Array.isArray(data.RelatedTopics)) {
    for (const topic of data.RelatedTopics) {
      if (typeof topic === 'object' && topic !== null) {
        if (typeof topic.Text === 'string' && topic.Text.trim()) {
          parts.push(topic.Text.trim())
          if (parts.length >= 3) break
        } else if (Array.isArray(topic.Topics)) {
          for (const nested of topic.Topics) {
            if (typeof nested === 'object' && nested !== null && typeof nested.Text === 'string' && nested.Text.trim()) {
              parts.push(nested.Text.trim())
              if (parts.length >= 3) break
            }
          }
        }
      }
    }
  }

  if (parts.length === 0) return null
  return parts.slice(0, 3).join(' ')
}

export const Route = createFileRoute('/demo/api/ai/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const query = url.searchParams.get('q')?.trim()

        if (!query) {
          return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        try {
          const searchUrl = new URL('https://api.duckduckgo.com/')
          searchUrl.searchParams.set('q', query)
          searchUrl.searchParams.set('format', 'json')
          searchUrl.searchParams.set('no_redirect', '1')
          searchUrl.searchParams.set('no_html', '1')
          searchUrl.searchParams.set('skip_disambig', '1')

          const response = await fetch(searchUrl.toString())
          if (!response.ok) {
            return new Response(JSON.stringify({ error: 'Search provider returned an error' }), {
              status: 502,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const data = await response.json()
          const summary = extractDuckDuckGoSummary(data)

          return new Response(JSON.stringify({ summary }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          return new Response(JSON.stringify({ error: error.message || 'Search request failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
