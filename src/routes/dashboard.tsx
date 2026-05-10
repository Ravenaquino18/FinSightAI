import { createFileRoute } from '@tanstack/react-router'
import { FinanceDashboard } from './demo/finances'

export const Route = createFileRoute('/dashboard')({ component: FinanceDashboard })
