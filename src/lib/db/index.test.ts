import { test } from 'node:test'
import assert from 'node:assert/strict'
import initSqlJs, { type Database } from 'sql.js'
import { SCHEMA, insertCheckin, validateBackup, prepareRestore, InvalidBackupError } from './index.ts'

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

const TABLES = ['tags', 'contacts', 'checkins', 'settings']

function seedFullDb(database: Database): void {
  database.run(
    `INSERT INTO tags (id, name, count_per_period, period_days, color, is_default, sort_order) VALUES ('t1', 'friend', 2, 7, '#3b82f6', 1, 0)`
  )
  database.run(
    `INSERT INTO contacts (id, name, email, tag_id, last_checkin_at, created_at, updated_at) VALUES ('c1', 'Ada', 'ada@example.com', 't1', 1000, 1, 2)`
  )
  database.run(
    `INSERT INTO checkins (id, contact_id, checked_in_at, note, created_at) VALUES ('k1', 'c1', 1000, 'coffee', 3)`
  )
  database.run(`INSERT INTO settings (key, value) VALUES ('notification_time', '09:30')`)
}

function dumpTables(database: Database): Record<string, unknown[][]> {
  return Object.fromEntries(
    TABLES.map((table) => [table, database.exec(`SELECT * FROM ${table} ORDER BY 1`)[0]?.values ?? []])
  )
}

test('validateBackup accepts a real export', async () => {
  const SQL = await initSqlJs()
  const source = await createTestDb()
  seedFullDb(source)

  assert.doesNotThrow(() => validateBackup(SQL, source.export()))
})

test('validateBackup rejects bytes that are not a SQLite file', async () => {
  const SQL = await initSqlJs()
  const garbage = new TextEncoder().encode('this is definitely not a database file at all, just prose')

  assert.throws(() => validateBackup(SQL, garbage), InvalidBackupError)
})

test('validateBackup rejects empty bytes', async () => {
  const SQL = await initSqlJs()

  assert.throws(() => validateBackup(SQL, new Uint8Array()), InvalidBackupError)
})

test('validateBackup rejects a SQLite file missing a required table', async () => {
  const SQL = await initSqlJs()
  const partial = new SQL.Database()
  partial.run('CREATE TABLE tags (id TEXT PRIMARY KEY); CREATE TABLE contacts (id TEXT PRIMARY KEY);')

  assert.throws(() => validateBackup(SQL, partial.export()), InvalidBackupError)
})

test('an exported database restores every row of every table', async () => {
  const SQL = await initSqlJs()
  const source = await createTestDb()
  seedFullDb(source)
  const current = await createTestDb()

  const restored = await prepareRestore(SQL, current, source.export(), () => {})

  assert.deepEqual(dumpTables(restored), dumpTables(source))
})

test('a rejected file does not take a backup and leaves the current database untouched', async () => {
  const SQL = await initSqlJs()
  const current = await createTestDb()
  seedFullDb(current)
  const before = dumpTables(current)
  let backups = 0

  await assert.rejects(
    prepareRestore(SQL, current, new Uint8Array([1, 2, 3]), () => {
      backups += 1
    }),
    InvalidBackupError
  )

  assert.equal(backups, 0)
  assert.deepEqual(dumpTables(current), before)
})

test('prepareRestore hands the backup callback the current data before building the replacement', async () => {
  const SQL = await initSqlJs()
  const current = await createTestDb()
  seedFullDb(current)
  const incoming = await createTestDb()
  const events: string[] = []
  let backedUp: Record<string, unknown[][]> | null = null

  const restored = await prepareRestore(SQL, current, incoming.export(), async (bytes) => {
    events.push('backup')
    backedUp = dumpTables(new SQL.Database(bytes))
  })
  events.push('returned')

  assert.deepEqual(events, ['backup', 'returned'])
  assert.deepEqual(backedUp, dumpTables(current))
  assert.deepEqual(dumpTables(restored), dumpTables(incoming))
})

test('prepareRestore aborts when the backup fails', async () => {
  const SQL = await initSqlJs()
  const current = await createTestDb()
  seedFullDb(current)
  const before = dumpTables(current)
  const incoming = await createTestDb()

  await assert.rejects(
    prepareRestore(SQL, current, incoming.export(), () => {
      throw new Error('download blocked')
    }),
    /download blocked/
  )

  assert.deepEqual(dumpTables(current), before)
})
