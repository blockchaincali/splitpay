import type { IntegrationStatusValue } from '@/api/client'
import { Chip } from './ui'

const copy: Record<IntegrationStatusValue, { label: string; tone: 'success' | 'warn' | 'muted' | 'teal' }> = {
  live: { label: 'Live', tone: 'success' },
  sandbox: { label: 'Sandbox demo', tone: 'warn' },
  'needs-credentials': { label: 'Needs setup', tone: 'muted' },
  planned: { label: 'Planned', tone: 'muted' },
}

export function StatusBadge({ status }: { status: IntegrationStatusValue }) {
  const c = copy[status]
  return <Chip tone={c.tone}>{c.label}</Chip>
}
