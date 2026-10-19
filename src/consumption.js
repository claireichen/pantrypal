'use strict';

const { parseId } = require('./validation');

function validateConsumptions(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 50) return null;
  const combined = new Map();
  for (const entry of input) {
    const id = parseId(entry?.id);
    const amount = Number(entry?.amount);
    if (!id || !Number.isFinite(amount) || amount <= 0 || amount > 100000) return null;
    combined.set(id, (combined.get(id) || 0) + amount);
  }
  return [...combined].map(([id, amount]) => ({ id, amount }));
}

async function applyConsumptions(store, consumptions) {
  const currentItems = await store.list();
  const byId = new Map(currentItems.map((item) => [item.id, item]));
  const updated = [];
  const removed = [];

  for (const consumption of consumptions) {
    const item = byId.get(consumption.id);
    if (!item) continue;
    const remaining = Number((item.quantity - consumption.amount).toFixed(2));
    if (remaining <= 0) {
      if (await store.remove(item.id)) removed.push(item.id);
      continue;
    }
    const result = await store.update(item.id, { ...item, quantity: remaining });
    if (result) updated.push(result);
  }

  return { updated, removed };
}

module.exports = { applyConsumptions, validateConsumptions };
