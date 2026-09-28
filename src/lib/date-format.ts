export function formatDaysSince(days: number | null): string {
  if (days === null) return 'Never'
  if (days < 1) return 'Today'
  if (days < 2) return 'Yesterday'
  if (days < 7) return `${Math.floor(days)} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

export function formatPeriod(days: number): string {
  if (days === 1) return 'daily'
  if (days === 7) return 'weekly'
  if (days === 14) return 'bi-weekly'
  if (days === 30) return 'monthly'
  return `every ${days} days`
}
