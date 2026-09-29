import { test } from 'node:test'
import assert from 'node:assert/strict'
import initSqlJs, { type Database } from 'sql.js'
import { SCHEMA, insertCheckin } from './index.ts'

async function createTestDb(): Promise<Database> {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  database.run(SCHEMA)
  return database
}

function seedContact(database: Database, id: string, lastCheckinAt: number | null): void {
  const now = Date.now()
  database.run(
    `INSERT INTO contacts (id, name, last_checkin_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, 'Test Contact', lastCheckinAt, now, now]
  )
}

function readLastCheckinAt(database: Database, id: string): number | null {
  const result = database.exec('SELECT last_checkin_at FROM contacts WHERE id = ?', [id])
  return (result[0]?.values[0]?.[0] ?? null) as number | null
}

function countCheckins(database: Database, contactId: string): number {
  const result = database.exec('SELECT COUNT(*) FROM checkins WHERE contact_id = ?', [contactId])
  return result[0]?.values[0]?.[0] as number
}

test('insertCheckin does not move last_checkin_at backward for a backdated check-in', async () => {
  const database = await createTestDb()
  const contactId = 'contact-1'
  const today = Date.parse('2026-09-28T00:00:00Z')
  const lastWeek = Date.parse('2026-09-21T00:00:00Z')
  seedContact(database, contactId, today)

  insertCheckin(database, contactId, lastWeek)

  assert.equal(readLastCheckinAt(database, contactId), today)
})

test('insertCheckin still records a backdated check-in in history', async () => {
  const database = await createTestDb()
  const contactId = 'contact-2'
  const today = Date.parse('2026-09-28T00:00:00Z')
  const lastWeek = Date.parse('2026-09-21T00:00:00Z')
  seedContact(database, contactId, today)

  insertCheckin(database, contactId, lastWeek)

  assert.equal(countCheckins(database, contactId), 1)
})

test('insertCheckin with today or a newer date still updates last_checkin_at', async () => {
  const database = await createTestDb()
  const contactId = 'contact-3'
  const lastWeek = Date.parse('2026-09-21T00:00:00Z')
  const today = Date.parse('2026-09-28T00:00:00Z')
  seedContact(database, contactId, lastWeek)

  insertCheckin(database, contactId, today)

  assert.equal(readLastCheckinAt(database, contactId), today)
})

test('insertCheckin sets last_checkin_at on a contact with no prior check-in', async () => {
  const database = await createTestDb()
  const contactId = 'contact-4'
  const today = Date.parse('2026-09-28T00:00:00Z')
  seedContact(database, contactId, null)

  insertCheckin(database, contactId, today)

  assert.equal(readLastCheckinAt(database, contactId), today)
})
