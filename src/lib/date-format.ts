export function formatDaysSince(days: number | null): string {
  if (days === null) return 'Never'
  if (days < 1) return 'Today'
  if (days < 2) return 'Yesterday'
  if (days < 7) return `${Math.floor(days)} days ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} month${months === 1 ? '' : 's'} ago`
  }
  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

export function formatPeriod(days: number): string {
  if (days === 1) return 'daily'
  if (days === 7) return 'weekly'
  if (days === 14) return 'bi-weekly'
  if (days === 30) return 'monthly'
  return `every ${days} days`
}
