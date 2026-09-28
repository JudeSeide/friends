import { getTags, getContacts, type Tag, type ContactWithTag } from './db'

export { formatDaysSince, formatPeriod } from './date-format'

export interface DueContact extends ContactWithTag {
  priority: number // higher = more overdue
}

export interface TagDueInfo {
  tag: Tag
  dueContacts: DueContact[]
  checkedThisPeriod: number
  remaining: number
}

export function getDueContactsByTag(tagId: string): TagDueInfo | null {
  const tags = getTags()
  const tag = tags.find(t => t.id === tagId)
  if (!tag) return null

  const contacts = getContacts(tagId)
  const now = Date.now()
  const periodMs = tag.period_days * 24 * 60 * 60 * 1000
  const periodStart = now - periodMs

  // Count how many checked in this period
  const checkedThisPeriod = contacts.filter(c =>
    c.last_checkin_at && c.last_checkin_at > periodStart
  ).length

  // How many still needed?
  const remaining = Math.max(0, tag.count_per_period - checkedThisPeriod)

  // Get overdue contacts sorted by staleness
  const overdueContacts = contacts
    .filter(c => !c.last_checkin_at || c.last_checkin_at < periodStart)
    .map(c => ({
      ...c,
      priority: c.last_checkin_at
        ? now - c.last_checkin_at
        : Number.MAX_SAFE_INTEGER // Never contacted = highest priority
    }))
    .sort((a, b) => b.priority - a.priority)

  return {
    tag,
    dueContacts: overdueContacts.slice(0, remaining),
    checkedThisPeriod,
    remaining,
  }
}

export function getAllDueContacts(): { tagInfo: TagDueInfo; contacts: DueContact[] }[] {
  const tags = getTags()
  const results: { tagInfo: TagDueInfo; contacts: DueContact[] }[] = []

  for (const tag of tags) {
    const info = getDueContactsByTag(tag.id)
    if (info && info.dueContacts.length > 0) {
      results.push({
        tagInfo: info,
        contacts: info.dueContacts,
      })
    }
  }

  return results
}

export function getTotalDueCount(): number {
  const allDue = getAllDueContacts()
  return allDue.reduce((sum, item) => sum + item.contacts.length, 0)
}
