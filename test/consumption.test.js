'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyConsumptions, validateConsumptions } = require('../src/consumption');

test('validates and combines consumption amounts for the same item', () => {
  assert.deepEqual(validateConsumptions([{ id: 2, amount: 1 }, { id: '2', amount: 0.5 }]), [{ id: 2, amount: 1.5 }]);
  assert.equal(validateConsumptions([{ id: 0, amount: 1 }]), null);
  assert.equal(validateConsumptions([{ id: 1, amount: 0 }]), null);
});

test('consuming inventory updates partial quantities and removes depleted items', async () => {
  const items = [
    { id: 1, name: 'Rice', location: 'pantry', quantity: 2, unit: 'lb', expirationDate: null, notes: '' },
    { id: 2, name: 'Eggs', location: 'refrigerator', quantity: 1, unit: 'item', expirationDate: null, notes: '' }
  ];
  const store = {
    async list() { return items; },
    async update(id, item) { Object.assign(items.find((entry) => entry.id === id), item); return item; },
    async remove(id) { items.splice(items.findIndex((entry) => entry.id === id), 1); return true; }
  };
  const result = await applyConsumptions(store, [{ id: 1, amount: 0.5 }, { id: 2, amount: 1 }]);
  assert.equal(items[0].quantity, 1.5);
  assert.deepEqual(result.removed, [2]);
});
