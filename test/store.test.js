'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSqliteStore } = require('../src/store');

test('SQLite store creates, updates, lists, and removes items', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pantrypal-'));
  const store = createSqliteStore(path.join(directory, 'test.sqlite'));
  t.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const created = await store.create({
    name: 'Black beans', location: 'pantry', quantity: 2, unit: 'can', expirationDate: null, notes: ''
  });
  assert.equal(created.name, 'Black beans');
  assert.equal((await store.list()).length, 1);

  const updated = await store.update(created.id, {
    name: 'Black beans', location: 'pantry', quantity: 1, unit: 'can', expirationDate: '2027-01-01', notes: 'One can left'
  });
  assert.equal(updated.quantity, 1);
  assert.equal(updated.notes, 'One can left');

  assert.equal(await store.remove(created.id), true);
  assert.equal((await store.list()).length, 0);
});
