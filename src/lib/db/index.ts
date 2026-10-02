import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js'
import type { Tag, Contact, Checkin, ContactWithTag, SettingKey } from './types'

let db: Database | null = null
let sqlModule: SqlJsStatic | null = null
const DB_NAME = 'friends_db'

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  count_per_period INTEGER NOT NULL,
  period_days INTEGER NOT NULL,
  color TEXT,
  is_default INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  photo_url TEXT,
  tag_id TEXT REFERENCES tags(id),
  last_checkin_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  checked_in_at INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_contacts_tag ON contacts(tag_id);
CREATE INDEX IF NOT EXISTS idx_contacts_checkin ON contacts(last_checkin_at);
CREATE INDEX IF NOT EXISTS idx_checkins_contact ON checkins(contact_id);
`

const DEFAULT_TAGS: Omit<Tag, 'id'>[] = [
  { name: 'inner-circle', count_per_period: 2, period_days: 7, color: '#ef4444', is_default: true, sort_order: 0 },
  { name: 'friend', count_per_period: 2, period_days: 7, color: '#3b82f6', is_default: true, sort_order: 1 },
  { name: 'acquaintance', count_per_period: 2, period_days: 30, color: '#22c55e', is_default: true, sort_order: 2 },
  { name: 'professional', count_per_period: 1, period_days: 30, color: '#8b5cf6', is_default: true, sort_order: 3 },
]

function generateId(): string {
  return crypto.randomUUID()
}

async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('db')
    }
    request.onsuccess = () => {
      const tx = request.result.transaction('db', 'readonly')
      const store = tx.objectStore('db')
      const get = store.get('data')
      get.onsuccess = () => resolve(get.result || null)
      get.onerror = () => resolve(null)
    }
    request.onerror = () => resolve(null)
  })
}

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('db')
    }
    request.onsuccess = () => {
      const tx = request.result.transaction('db', 'readwrite')
      const store = tx.objectStore('db')
      store.put(data, 'data')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function initDB(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`
  })
  sqlModule = SQL

  const savedData = await loadFromIndexedDB()

  if (savedData) {
    db = new SQL.Database(savedData)
  } else {
    db = new SQL.Database()
    db.run(SCHEMA)
    seedDefaultTags()
  }

  return db
}

export async function persist(): Promise<void> {
  if (!db) return
  const data = db.export()
  await saveToIndexedDB(data)
}

const REQUIRED_TABLES = ['tags', 'contacts', 'checkins', 'settings']

export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidBackupError'
  }
}

function tableColumns(database: Database, table: string): Set<string> {
  const result = database.exec(`PRAGMA table_info(${table})`)
  return new Set((result[0]?.values ?? []).map((row) => row[1] as string))
}

function assertIntact(database: Database): void {
  let rows: SqlValue[][] = []
  try {
    rows = database.exec('PRAGMA quick_check')[0]?.values ?? []
  } catch {
    throw new InvalidBackupError('The backup file is damaged')
  }
  if (rows.length !== 1 || rows[0][0] !== 'ok') {
    throw new InvalidBackupError('The backup file is damaged')
  }
}

// Every column SCHEMA defines must exist; extra columns are allowed so an additive schema restores
function assertColumns(SQL: SqlJsStatic, database: Database): void {
  const reference = new SQL.Database()
  try {
    reference.run(SCHEMA)
    for (const table of REQUIRED_TABLES) {
      const present = tableColumns(database, table)
      const missing = [...tableColumns(reference, table)].filter((column) => !present.has(column))
      if (missing.length > 0) {
        throw new InvalidBackupError(`Not a Friends backup: ${table} is missing ${missing.join(', ')}`)
      }
    }
  } finally {
    reference.close()
  }
}

export function validateBackup(SQL: SqlJsStatic, bytes: Uint8Array): void {
  if (bytes.length === 0) throw new InvalidBackupError('The file is empty')

  let scratch: Database | null = null
  try {
    scratch = new SQL.Database(bytes)
    const result = scratch.exec("SELECT name FROM sqlite_master WHERE type = 'table'")
    const present = new Set((result[0]?.values ?? []).map((row) => row[0]))
    const missing = REQUIRED_TABLES.filter((table) => !present.has(table))
    if (missing.length > 0) {
      throw new InvalidBackupError(`Not a Friends backup: missing ${missing.join(', ')}`)
    }
    assertIntact(scratch)
    assertColumns(SQL, scratch)
  } catch (error) {
    if (error instanceof InvalidBackupError) throw error
    throw new InvalidBackupError('The file is not a SQLite database')
  } finally {
    scratch?.close()
  }
}

// Does not persist or touch the module database; validates, hands the backup callback the
// current data, then returns the replacement. The caller swaps and persists it.
export async function prepareRestore(
  SQL: SqlJsStatic,
  current: Database,
  bytes: Uint8Array,
  backup: (currentBytes: Uint8Array) => void | Promise<void>
): Promise<Database> {
  validateBackup(SQL, bytes)
  await backup(current.export())
  return new SQL.Database(bytes)
}

export async function exportDatabase(): Promise<Uint8Array> {
  const database = await initDB()
  return database.export()
}

export async function restoreDatabase(
  bytes: Uint8Array,
  backup: (currentBytes: Uint8Array) => void | Promise<void>
): Promise<void> {
  const current = await initDB()
  if (!sqlModule) throw new Error('Database not initialized')

  const restored = await prepareRestore(sqlModule, current, bytes, backup)
  try {
    await saveToIndexedDB(restored.export())
  } catch (error) {
    restored.close()
    throw error
  }
  db = restored
  current.close()
}

function seedDefaultTags(): void {
  if (!db) return

  const existing = db.exec("SELECT COUNT(*) as count FROM tags WHERE is_default = 1")
  if (existing[0]?.values[0]?.[0] as number > 0) return

  for (const tag of DEFAULT_TAGS) {
    db.run(
      `INSERT INTO tags (id, name, count_per_period, period_days, color, is_default, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), tag.name, tag.count_per_period, tag.period_days, tag.color, tag.is_default ? 1 : 0, tag.sort_order]
    )
  }
  persist()
}

// Tag queries
export function getTags(): Tag[] {
  if (!db) return []
  const result = db.exec("SELECT * FROM tags ORDER BY sort_order")
  if (!result[0]) return []

  return result[0].values.map((row: SqlValue[]) => ({
    id: row[0] as string,
    name: row[1] as string,
    count_per_period: row[2] as number,
    period_days: row[3] as number,
    color: row[4] as string | null,
    is_default: Boolean(row[5]),
    sort_order: row[6] as number,
  }))
}

export function getTag(id: string): Tag | null {
  if (!db) return null
  const result = db.exec("SELECT * FROM tags WHERE id = ?", [id])
  if (!result[0]?.values[0]) return null

  const row = result[0].values[0]
  return {
    id: row[0] as string,
    name: row[1] as string,
    count_per_period: row[2] as number,
    period_days: row[3] as number,
    color: row[4] as string | null,
    is_default: Boolean(row[5]),
    sort_order: row[6] as number,
  }
}

export function createTag(tag: Omit<Tag, 'id' | 'is_default' | 'sort_order'>): Tag {
  if (!db) throw new Error('Database not initialized')

  const id = generateId()
  const maxOrder = db.exec("SELECT MAX(sort_order) FROM tags")
  const sortOrder = ((maxOrder[0]?.values[0]?.[0] as number) || 0) + 1

  db.run(
    `INSERT INTO tags (id, name, count_per_period, period_days, color, is_default, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [id, tag.name, tag.count_per_period, tag.period_days, tag.color, sortOrder]
  )
  persist()

  return { ...tag, id, is_default: false, sort_order: sortOrder }
}

export function updateTag(id: string, updates: Partial<Omit<Tag, 'id' | 'is_default'>>): void {
  if (!db) return

  const sets: string[] = []
  const values: (string | number | null)[] = []

  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name) }
  if (updates.count_per_period !== undefined) { sets.push('count_per_period = ?'); values.push(updates.count_per_period) }
  if (updates.period_days !== undefined) { sets.push('period_days = ?'); values.push(updates.period_days) }
  if (updates.color !== undefined) { sets.push('color = ?'); values.push(updates.color) }
  if (updates.sort_order !== undefined) { sets.push('sort_order = ?'); values.push(updates.sort_order) }

  if (sets.length === 0) return

  values.push(id)
  db.run(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`, values)
  persist()
}

export function deleteTag(id: string): void {
  if (!db) return
  db.run("UPDATE contacts SET tag_id = NULL WHERE tag_id = ?", [id])
  db.run("DELETE FROM tags WHERE id = ? AND is_default = 0", [id])
  persist()
}

// Contact queries
export function getContacts(tagId?: string): ContactWithTag[] {
  if (!db) return []

  const now = Date.now()
  const query = `
    SELECT c.*, t.name as tag_name, t.color as tag_color,
           CASE WHEN c.last_checkin_at IS NOT NULL
                THEN (? - c.last_checkin_at) / 86400000
                ELSE NULL END as days_since
    FROM contacts c
    LEFT JOIN tags t ON c.tag_id = t.id
    ${tagId ? 'WHERE c.tag_id = ?' : ''}
    ORDER BY c.name
  `

  const result = db.exec(query, tagId ? [now, tagId] : [now])
  if (!result[0]) return []

  return result[0].values.map((row: SqlValue[]) => ({
    id: row[0] as string,
    google_id: row[1] as string | null,
    name: row[2] as string,
    email: row[3] as string | null,
    phone: row[4] as string | null,
    photo_url: row[5] as string | null,
    tag_id: row[6] as string | null,
    last_checkin_at: row[7] as number | null,
    created_at: row[8] as number,
    updated_at: row[9] as number,
    tag_name: row[10] as string | null,
    tag_color: row[11] as string | null,
    days_since_checkin: row[12] as number | null,
  }))
}

export function getContact(id: string): ContactWithTag | null {
  if (!db) return null

  const now = Date.now()
  const result = db.exec(`
    SELECT c.*, t.name as tag_name, t.color as tag_color,
           CASE WHEN c.last_checkin_at IS NOT NULL
                THEN (? - c.last_checkin_at) / 86400000
                ELSE NULL END as days_since
    FROM contacts c
    LEFT JOIN tags t ON c.tag_id = t.id
    WHERE c.id = ?
  `, [now, id])

  if (!result[0]?.values[0]) return null

  const row = result[0].values[0]
  return {
    id: row[0] as string,
    google_id: row[1] as string | null,
    name: row[2] as string,
    email: row[3] as string | null,
    phone: row[4] as string | null,
    photo_url: row[5] as string | null,
    tag_id: row[6] as string | null,
    last_checkin_at: row[7] as number | null,
    created_at: row[8] as number,
    updated_at: row[9] as number,
    tag_name: row[10] as string | null,
    tag_color: row[11] as string | null,
    days_since_checkin: row[12] as number | null,
  }
}

export function createContact(contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>): Contact {
  if (!db) throw new Error('Database not initialized')

  const id = generateId()
  const now = Date.now()

  db.run(
    `INSERT INTO contacts (id, google_id, name, email, phone, photo_url, tag_id, last_checkin_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, contact.google_id, contact.name, contact.email, contact.phone, contact.photo_url, contact.tag_id, contact.last_checkin_at, now, now]
  )
  persist()

  return { ...contact, id, created_at: now, updated_at: now }
}

export function upsertContactByGoogleId(contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>): Contact {
  if (!db) throw new Error('Database not initialized')

  if (contact.google_id) {
    const existing = db.exec("SELECT id FROM contacts WHERE google_id = ?", [contact.google_id])
    if (existing[0]?.values[0]) {
      const id = existing[0].values[0][0] as string
      const now = Date.now()
      db.run(
        `UPDATE contacts SET name = ?, email = ?, phone = ?, photo_url = ?, updated_at = ? WHERE id = ?`,
        [contact.name, contact.email, contact.phone, contact.photo_url, now, id]
      )
      persist()
      return { ...contact, id, created_at: now, updated_at: now }
    }
  }

  return createContact(contact)
}

export function updateContact(id: string, updates: Partial<Omit<Contact, 'id' | 'created_at'>>): void {
  if (!db) return

  const sets: string[] = ['updated_at = ?']
  const values: (string | number | null)[] = [Date.now()]

  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name) }
  if (updates.email !== undefined) { sets.push('email = ?'); values.push(updates.email) }
  if (updates.phone !== undefined) { sets.push('phone = ?'); values.push(updates.phone) }
  if (updates.photo_url !== undefined) { sets.push('photo_url = ?'); values.push(updates.photo_url) }
  if (updates.tag_id !== undefined) { sets.push('tag_id = ?'); values.push(updates.tag_id) }
  if (updates.last_checkin_at !== undefined) { sets.push('last_checkin_at = ?'); values.push(updates.last_checkin_at) }

  values.push(id)
  db.run(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`, values)
  persist()
}

export function deleteContact(id: string): void {
  if (!db) return
  db.run("DELETE FROM contacts WHERE id = ?", [id])
  persist()
}

// Checkin queries
export function getCheckins(contactId: string): Checkin[] {
  if (!db) return []

  const result = db.exec(
    "SELECT * FROM checkins WHERE contact_id = ? ORDER BY checked_in_at DESC",
    [contactId]
  )
  if (!result[0]) return []

  return result[0].values.map((row: SqlValue[]) => ({
    id: row[0] as string,
    contact_id: row[1] as string,
    checked_in_at: row[2] as number,
    note: row[3] as string | null,
    created_at: row[4] as number,
  }))
}

// Does not persist; app code should call createCheckin, which persists
export function insertCheckin(database: Database, contactId: string, checkedInAt?: number, note?: string): Checkin {
  const id = generateId()
  const now = Date.now()
  const checkTime = checkedInAt || now

  database.run(
    `INSERT INTO checkins (id, contact_id, checked_in_at, note, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, contactId, checkTime, note || null, now]
  )

  // Move last_checkin_at forward only; a backdated check-in is still recorded above
  database.run(
    `UPDATE contacts SET last_checkin_at = MAX(COALESCE(last_checkin_at, 0), ?), updated_at = ? WHERE id = ?`,
    [checkTime, now, contactId]
  )

  return { id, contact_id: contactId, checked_in_at: checkTime, note: note || null, created_at: now }
}

export function createCheckin(contactId: string, checkedInAt?: number, note?: string): Checkin {
  if (!db) throw new Error('Database not initialized')

  const checkin = insertCheckin(db, contactId, checkedInAt, note)
  persist()

  return checkin
}

// Settings queries
export function getSetting(key: SettingKey): string | null {
  if (!db) return null
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key])
  return (result[0]?.values[0]?.[0] as string) || null
}

export function setSetting(key: SettingKey, value: string | null): void {
  if (!db) return
  if (value === null) {
    db.run("DELETE FROM settings WHERE key = ?", [key])
  } else {
    db.run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
      [key, value, value]
    )
  }
  persist()
}

export { type Tag, type Contact, type Checkin, type ContactWithTag, type SettingKey }
