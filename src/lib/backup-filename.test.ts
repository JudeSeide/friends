import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backupFilename } from './backup-filename.ts'

test('backupFilename names the file after the local date', () => {
  assert.equal(backupFilename(new Date(2026, 9, 2, 23, 59)), 'friends-backup-2026-10-02.sqlite')
})

test('backupFilename zero-pads month and day', () => {
  assert.equal(backupFilename(new Date(2026, 0, 5)), 'friends-backup-2026-01-05.sqlite')
})

test('backupFilename names the pre-restore copy distinctly', () => {
  assert.equal(backupFilename(new Date(2026, 9, 2), 'before-restore'), 'friends-before-restore-2026-10-02.sqlite')
})
