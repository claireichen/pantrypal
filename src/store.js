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
  `);

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
    close() {
      db.close();
    }
  };
}

function createSupabaseStore(url, serviceRoleKey) {
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/items`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };

  async function request(query, options = {}) {
    const response = await fetch(`${endpoint}${query}`, {
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
      const rows = await request('?select=*&order=expiration_date.asc.nullslast,created_at.desc');
      return rows.map(mapRow);
    },
    async create(item) {
      const rows = await request('', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(toDatabase(item))
      });
      return mapRow(rows[0]);
    },
    async update(id, item) {
      const rows = await request(`?id=eq.${id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(toDatabase(item))
      });
      return rows.length ? mapRow(rows[0]) : null;
    },
    async remove(id) {
      const rows = await request(`?id=eq.${id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' }
      });
      return Array.isArray(rows) && rows.length > 0;
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
