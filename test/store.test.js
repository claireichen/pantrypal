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

test('SQLite store persists recipes, shopping items, and notification settings', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pantrypal-user-data-'));
  const store = createSqliteStore(path.join(directory, 'test.sqlite'));
  t.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await store.createRecipe({
    id: 'custom-soup',
    name: 'Soup',
    ingredients: ['carrot', 'onion'],
    directions: 'Simmer.',
    image: 'https://example.com/soup.webp',
    custom: true
  });
  await store.createShoppingItem({ id: 'shopping-carrot', name: 'Carrot', done: false });
  await store.updateNotificationSettings({ days: 5, inApp: true, browser: true });

  let data = await store.getUserData();
  assert.equal(data.customRecipes[0].name, 'Soup');
  assert.deepEqual(data.customRecipes[0].ingredients, ['carrot', 'onion']);
  assert.equal(data.customRecipes[0].image, 'https://example.com/soup.webp');
  assert.equal(data.shopping[0].done, false);
  assert.deepEqual(data.notificationSettings, { days: 5, inApp: true, browser: true });

  assert.equal(await store.updateShoppingItem('shopping-carrot', true), true);
  data = await store.getUserData();
  assert.equal(data.shopping[0].done, true);
  assert.equal(await store.clearCompletedShopping(), 1);
  assert.equal(await store.removeRecipe('custom-soup'), true);
  data = await store.getUserData();
  assert.equal(data.customRecipes.length, 0);
  assert.equal(data.shopping.length, 0);
});
