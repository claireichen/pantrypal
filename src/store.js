'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function mapRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    location: row.location,
    quantity: Number(row.quantity),
    unit: row.unit,
    expirationDate: row.expiration_date,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRecipeRow(row) {
  return {
    id: row.id,
    name: row.name,
    ingredients: typeof row.ingredients === 'string' ? JSON.parse(row.ingredients) : row.ingredients,
    directions: row.directions || '',
    image: row.image_url || '',
    custom: true
  };
}

function mapShoppingRow(row) {
  return { id: row.id, name: row.name, done: row.done === true || row.done === 1 };
}

const defaultNotificationSettings = { days: 3, inApp: true, browser: false };

function createSqliteStore(databasePath) {
  const resolved = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL CHECK (location IN ('refrigerator', 'freezer', 'pantry')),
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit TEXT NOT NULL,
      expiration_date TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS custom_recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ingredients TEXT NOT NULL,
      directions TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shopping_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      notification_days INTEGER NOT NULL DEFAULT 3,
      in_app_notifications INTEGER NOT NULL DEFAULT 1,
      browser_notifications INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const recipeColumns = db.prepare('PRAGMA table_info(custom_recipes)').all().map((column) => column.name);
  if (!recipeColumns.includes('image_url')) db.exec("ALTER TABLE custom_recipes ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");

  const listStatement = db.prepare(`
    SELECT * FROM items
    ORDER BY expiration_date IS NULL, expiration_date ASC, created_at DESC
  `);
  const getStatement = db.prepare('SELECT * FROM items WHERE id = ?');
  const insertStatement = db.prepare(`
    INSERT INTO items (name, location, quantity, unit, expiration_date, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const updateStatement = db.prepare(`
    UPDATE items
    SET name = ?, location = ?, quantity = ?, unit = ?, expiration_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const deleteStatement = db.prepare('DELETE FROM items WHERE id = ?');
  const listRecipesStatement = db.prepare('SELECT * FROM custom_recipes ORDER BY created_at DESC');
  const createRecipeStatement = db.prepare(`
    INSERT INTO custom_recipes (id, name, ingredients, directions, image_url) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, ingredients = excluded.ingredients, directions = excluded.directions, image_url = excluded.image_url
  `);
  const getRecipeStatement = db.prepare('SELECT * FROM custom_recipes WHERE id = ?');
  const deleteRecipeStatement = db.prepare('DELETE FROM custom_recipes WHERE id = ?');
  const listShoppingStatement = db.prepare('SELECT * FROM shopping_items ORDER BY created_at ASC');
  const createShoppingStatement = db.prepare(`
    INSERT INTO shopping_items (id, name, done) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, done = excluded.done
  `);
  const updateShoppingStatement = db.prepare('UPDATE shopping_items SET done = ? WHERE id = ?');
  const deleteShoppingStatement = db.prepare('DELETE FROM shopping_items WHERE id = ?');
  const clearShoppingStatement = db.prepare('DELETE FROM shopping_items WHERE done = 1');
  const getSettingsStatement = db.prepare('SELECT * FROM app_settings WHERE id = 1');
  const updateSettingsStatement = db.prepare(`
    INSERT INTO app_settings (id, notification_days, in_app_notifications, browser_notifications, updated_at)
    VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      notification_days = excluded.notification_days,
      in_app_notifications = excluded.in_app_notifications,
      browser_notifications = excluded.browser_notifications,
      updated_at = CURRENT_TIMESTAMP
  `);

  function getSettings() {
    const row = getSettingsStatement.get();
    return row ? {
      days: Number(row.notification_days),
      inApp: Boolean(row.in_app_notifications),
      browser: Boolean(row.browser_notifications)
    } : { ...defaultNotificationSettings };
  }

  return {
    async list() {
      return listStatement.all().map(mapRow);
    },
    async create(item) {
      const result = insertStatement.run(
        item.name, item.location, item.quantity, item.unit, item.expirationDate, item.notes
      );
      return mapRow(getStatement.get(Number(result.lastInsertRowid)));
    },
    async update(id, item) {
      const result = updateStatement.run(
        item.name, item.location, item.quantity, item.unit, item.expirationDate, item.notes, id
      );
      return result.changes ? mapRow(getStatement.get(id)) : null;
    },
    async remove(id) {
      return deleteStatement.run(id).changes > 0;
    },
    async getUserData() {
      return {
        customRecipes: listRecipesStatement.all().map(mapRecipeRow),
        shopping: listShoppingStatement.all().map(mapShoppingRow),
        notificationSettings: getSettings()
      };
    },
    async createRecipe(recipe) {
      createRecipeStatement.run(recipe.id, recipe.name, JSON.stringify(recipe.ingredients), recipe.directions, recipe.image || '');
      return recipe;
    },
    async getRecipe(id) {
      const row = getRecipeStatement.get(id);
      return row ? mapRecipeRow(row) : null;
    },
    async removeRecipe(id) {
      return deleteRecipeStatement.run(id).changes > 0;
    },
    async createShoppingItem(item) {
      createShoppingStatement.run(item.id, item.name, item.done ? 1 : 0);
      return item;
    },
    async updateShoppingItem(id, done) {
      return updateShoppingStatement.run(done ? 1 : 0, id).changes > 0;
    },
    async removeShoppingItem(id) {
      return deleteShoppingStatement.run(id).changes > 0;
    },
    async clearCompletedShopping() {
      return clearShoppingStatement.run().changes;
    },
    async updateNotificationSettings(settings) {
      updateSettingsStatement.run(settings.days, settings.inApp ? 1 : 0, settings.browser ? 1 : 0);
      return settings;
    },
    close() {
      db.close();
    }
  };
}

function createSupabaseStore(url, serviceRoleKey) {
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };

  async function request(table, query = '', options = {}) {
    const response = await fetch(`${endpoint}/${table}${query}`, {
      ...options,
      headers: { ...headers, ...options.headers }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Database request failed (${response.status}): ${detail}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  const toDatabase = (item) => ({
    name: item.name,
    location: item.location,
    quantity: item.quantity,
    unit: item.unit,
    expiration_date: item.expirationDate,
    notes: item.notes,
    updated_at: new Date().toISOString()
  });

  return {
    async list() {
      const rows = await request('items', '?select=*&order=expiration_date.asc.nullslast,created_at.desc');
      return rows.map(mapRow);
    },
    async create(item) {
      const rows = await request('items', '', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(toDatabase(item))
      });
      return mapRow(rows[0]);
    },
    async update(id, item) {
      const rows = await request('items', `?id=eq.${id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(toDatabase(item))
      });
      return rows.length ? mapRow(rows[0]) : null;
    },
    async remove(id) {
      const rows = await request('items', `?id=eq.${id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' }
      });
      return Array.isArray(rows) && rows.length > 0;
    },
    async getUserData() {
      const [recipes, shopping, settingsRows] = await Promise.all([
        request('custom_recipes', '?select=*&order=created_at.desc'),
        request('shopping_items', '?select=*&order=created_at.asc'),
        request('app_settings', '?select=*&id=eq.1')
      ]);
      const settings = settingsRows[0];
      return {
        customRecipes: recipes.map(mapRecipeRow),
        shopping: shopping.map(mapShoppingRow),
        notificationSettings: settings ? {
          days: Number(settings.notification_days),
          inApp: settings.in_app_notifications,
          browser: settings.browser_notifications
        } : { ...defaultNotificationSettings }
      };
    },
    async createRecipe(recipe) {
      const rows = await request('custom_recipes', '', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ id: recipe.id, name: recipe.name, ingredients: recipe.ingredients, directions: recipe.directions, image_url: recipe.image || '' })
      });
      return mapRecipeRow(rows[0]);
    },
    async getRecipe(id) {
      const rows = await request('custom_recipes', `?select=*&id=eq.${encodeURIComponent(id)}`);
      return rows.length ? mapRecipeRow(rows[0]) : null;
    },
    async removeRecipe(id) {
      const rows = await request('custom_recipes', `?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Prefer: 'return=representation' }
      });
      return rows.length > 0;
    },
    async createShoppingItem(item) {
      const rows = await request('shopping_items', '', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ id: item.id, name: item.name, done: item.done })
      });
      return mapShoppingRow(rows[0]);
    },
    async updateShoppingItem(id, done) {
      const rows = await request('shopping_items', `?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ done })
      });
      return rows.length > 0;
    },
    async removeShoppingItem(id) {
      const rows = await request('shopping_items', `?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Prefer: 'return=representation' }
      });
      return rows.length > 0;
    },
    async clearCompletedShopping() {
      const rows = await request('shopping_items', '?done=eq.true', {
        method: 'DELETE', headers: { Prefer: 'return=representation' }
      });
      return rows.length;
    },
    async updateNotificationSettings(settings) {
      const rows = await request('app_settings', '', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: 1,
          notification_days: settings.days,
          in_app_notifications: settings.inApp,
          browser_notifications: settings.browser,
          updated_at: new Date().toISOString()
        })
      });
      const row = rows[0];
      return { days: Number(row.notification_days), inApp: row.in_app_notifications, browser: row.browser_notifications };
    }
  };
}

let store;

function getStore() {
  if (store) return store;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    store = createSupabaseStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    return store;
  }
  if (process.env.VERCEL) {
    throw new Error('Cloud database is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  store = createSqliteStore(process.env.DATABASE_PATH || './data/pantrypal.sqlite');
  return store;
}

module.exports = { createSqliteStore, createSupabaseStore, getStore };
