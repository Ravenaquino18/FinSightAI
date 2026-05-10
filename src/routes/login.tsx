import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({ component: LoginRedirect })

function LoginRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate({ to: '/', replace: true })
  }, [navigate])

  return null
}
