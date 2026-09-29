import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDaysSince } from './date-format.ts'

test('formatDaysSince uses singular units when the count is 1', () => {
  assert.equal(formatDaysSince(8), '1 week ago')
  assert.equal(formatDaysSince(31), '1 month ago')
  assert.equal(formatDaysSince(366), '1 year ago')
})

test('formatDaysSince keeps plural units when the count is not 1', () => {
  assert.equal(formatDaysSince(14), '2 weeks ago')
})
