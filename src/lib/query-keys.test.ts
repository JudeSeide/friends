import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTagDeleteInvalidationKeys } from './query-keys.ts'

test('getTagDeleteInvalidationKeys covers every query that renders a tag', () => {
  const keys = getTagDeleteInvalidationKeys()

  assert.deepStrictEqual(keys, [
    ['tags'],
    ['contacts'],
    ['contact'],
    ['dueContacts'],
  ])
})
