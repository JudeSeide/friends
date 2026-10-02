import { test } from 'node:test'
import assert from 'node:assert/strict'
import initSqlJs, { type Database } from 'sql.js'
import { SCHEMA, insertCheckin, validateBackup, prepareRestore, commitRestore, InvalidBackupError } from './index.ts'

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
  database.run(
    `INSERT INTO checkins (id, contact_id, checked_in_at, note, created_at) VALUES ('k2', 'c1', 2000, NULL, 4)`
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

  assert.throws(
    () => validateBackup(SQL, new Uint8Array()),
    (error: unknown) => error instanceof InvalidBackupError && error.message === 'The file is empty'
  )
})

for (const missing of TABLES) {
  test(`validateBackup rejects a SQLite file missing the ${missing} table`, async () => {
    const SQL = await initSqlJs()
    const partial = new SQL.Database()
    partial.run(SCHEMA)
    partial.run(`DROP TABLE ${missing}`)

    assert.throws(
      () => validateBackup(SQL, partial.export()),
      (error: unknown) =>
        error instanceof InvalidBackupError && error.message === `Not a Friends backup: missing ${missing}`
    )
  })
}

for (const table of TABLES) {
  test(`validateBackup rejects a valid export whose ${table} table lacks a column`, async () => {
    const SQL = await initSqlJs()
    const source = await createTestDb()
    const columns = source.exec(`PRAGMA table_info(${table})`)[0].values.map((row) => row[1] as string)
    source.run(`ALTER TABLE ${table} DROP COLUMN ${columns[columns.length - 1]}`)

    assert.throws(
      () => validateBackup(SQL, source.export()),
      (error: unknown) =>
        error instanceof InvalidBackupError && error.message.startsWith(`Not a Friends backup: ${table} has columns`)
    )
  })
}

test('validateBackup rejects a table with an extra column', async () => {
  const SQL = await initSqlJs()
  const source = await createTestDb()
  source.run('ALTER TABLE contacts ADD COLUMN nickname TEXT')

  assert.throws(() => validateBackup(SQL, source.export()), /contacts has columns/)
})

test('validateBackup rejects a table whose columns are reordered', async () => {
  const SQL = await initSqlJs()
  const swapped = SCHEMA.replace(
    'id TEXT PRIMARY KEY,\n  name TEXT NOT NULL UNIQUE,',
    'name TEXT NOT NULL UNIQUE,\n  id TEXT PRIMARY KEY,'
  )
  assert.notEqual(swapped, SCHEMA)
  const reordered = new SQL.Database()
  reordered.run(swapped)

  assert.throws(() => validateBackup(SQL, reordered.export()), /tags has columns/)
})

test('validateBackup rejects a file with corrupt data pages', async () => {
  const SQL = await initSqlJs()
  const source = await createTestDb()
  for (let i = 0; i < 400; i += 1) {
    source.run('INSERT INTO settings (key, value) VALUES (?, ?)', [`key-${i}`, 'x'.repeat(200)])
  }
  const bytes = source.export()
  const pageSize = new DataView(bytes.buffer, bytes.byteOffset).getUint16(16)
  assert.ok(bytes.length > pageSize * 4, 'fixture must span several pages')
  bytes.fill(0xff, pageSize * 2)

  assert.throws(() => validateBackup(SQL, bytes), /damaged/)
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

test('prepareRestore hands the backup callback the current data and returns the replacement', async () => {
  const SQL = await initSqlJs()
  const current = await createTestDb()
  seedFullDb(current)
  const incoming = await createTestDb()
  let backedUp: Record<string, unknown[][]> | null = null

  const restored = await prepareRestore(SQL, current, incoming.export(), async (bytes) => {
    backedUp = dumpTables(new SQL.Database(bytes))
  })

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

test('prepareRestore waits for an async backup and rejects when it fails after an await', async () => {
  const SQL = await initSqlJs()
  const current = await createTestDb()
  const incoming = await createTestDb()
  let replacement: Database | null = null

  await assert.rejects(
    (async () => {
      replacement = await prepareRestore(SQL, current, incoming.export(), async () => {
        await Promise.resolve()
        throw new Error('download failed late')
      })
    })(),
    /download failed late/
  )

  assert.equal(replacement, null)
})

test('commitRestore keeps the current database live and closes the replacement when the save fails', async () => {
  const current = await createTestDb()
  seedFullDb(current)
  const before = dumpTables(current)
  const restored = await createTestDb()
  let activated = false

  await assert.rejects(
    commitRestore(
      current,
      restored,
      () => Promise.reject(new Error('quota exceeded')),
      () => {
        activated = true
      }
    ),
    /quota exceeded/
  )

  assert.equal(activated, false)
  assert.throws(() => restored.exec('SELECT 1'))
  assert.deepEqual(dumpTables(current), before)
})

test('commitRestore saves before the swap, saves again after it, and closes the old database', async () => {
  const current = await createTestDb()
  const restored = await createTestDb()
  seedFullDb(restored)
  const expected = dumpTables(restored)
  const events: string[] = []
  let live: Database | null = null

  const outcome = await commitRestore(
    current,
    restored,
    async (bytes) => {
      events.push('save-start')
      await new Promise((resolve) => setTimeout(resolve, 5))
      events.push('save-end')
      assert.deepEqual(dumpTables(new (await initSqlJs()).Database(bytes)), expected)
    },
    (database) => {
      events.push('activate')
      live = database
    }
  )

  assert.deepEqual(events, ['save-start', 'save-end', 'activate', 'save-start', 'save-end'])
  assert.equal(outcome.resaveError, null)
  assert.equal(live, restored)
  assert.throws(() => current.exec('SELECT 1'))
  assert.deepEqual(dumpTables(restored), expected)
})

test('validateBackup rejects a file that quick_check reports problems for without throwing', async () => {
  const SQL = await initSqlJs()
  const source = await createTestDb()
  seedFullDb(source)
  const exported = source.export()
  const view = new DataView(exported.buffer, exported.byteOffset, exported.byteLength)
  const rawPageSize = view.getUint16(16)
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize
  const bytes = new Uint8Array(exported.length + pageSize)
  bytes.set(exported)
  new DataView(bytes.buffer).setUint32(28, view.getUint32(28) + 1)

  const probe = new SQL.Database(bytes)
  const rows = probe.exec('PRAGMA quick_check')[0].values
  probe.close()
  assert.notDeepEqual(rows, [['ok']], 'fixture must make quick_check return problem rows')

  assert.throws(() => validateBackup(SQL, bytes), /damaged/)
})

test('commitRestore reports a failed second save without rejecting, after the swap happened', async () => {
  const current = await createTestDb()
  const restored = await createTestDb()
  let saves = 0
  let live: Database | null = null

  const outcome = await commitRestore(
    current,
    restored,
    async () => {
      saves += 1
      if (saves === 2) throw new Error('second write failed')
    },
    (database) => {
      live = database
    }
  )

  assert.equal(live, restored)
  assert.throws(() => current.exec('SELECT 1'))
  assert.equal(outcome.resaveError?.message, 'second write failed')
})
