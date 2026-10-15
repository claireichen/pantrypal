'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateItem, parseId } = require('../src/validation');

test('accepts a valid refrigerator item', () => {
  const result = validateItem({
    name: 'Baby spinach',
    location: 'refrigerator',
    quantity: 1,
    unit: 'bag',
    expirationDate: '2026-10-20',
    notes: 'Use for pasta'
  });
  assert.equal(result.valid, true);
  assert.equal(result.item.name, 'Baby spinach');
});

test('accepts pantry and freezer locations', () => {
  assert.equal(validateItem({ name: 'Rice', location: 'pantry', quantity: 2, unit: 'lb' }).valid, true);
  assert.equal(validateItem({ name: 'Peas', location: 'freezer', quantity: 1, unit: 'bag' }).valid, true);
});

test('rejects missing and invalid fields', () => {
  const result = validateItem({ name: '', location: 'garage', quantity: 0, unit: 'bucket' });
  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['location', 'name', 'quantity', 'unit']);
});

test('parses positive integer IDs only', () => {
  assert.equal(parseId('12'), 12);
  assert.equal(parseId('0'), null);
  assert.equal(parseId('3.5'), null);
  assert.equal(parseId('abc'), null);
});
