'use strict';

const LOCATIONS = new Set(['refrigerator', 'freezer', 'pantry']);
const UNITS = new Set(['item', 'oz', 'lb', 'g', 'kg', 'cup', 'can', 'bottle', 'box', 'bag']);

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function validateItem(input = {}) {
  const item = {
    name: cleanText(input.name, 80),
    location: cleanText(input.location, 20).toLowerCase(),
    quantity: Number(input.quantity),
    unit: cleanText(input.unit, 20).toLowerCase(),
    expirationDate: input.expirationDate ? cleanText(input.expirationDate, 10) : null,
    notes: cleanText(input.notes, 240)
  };

  const errors = {};
  if (!item.name) errors.name = 'Enter an ingredient name.';
  if (!LOCATIONS.has(item.location)) errors.location = 'Choose a valid storage location.';
  if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 100000) {
    errors.quantity = 'Quantity must be greater than zero.';
  }
  if (!UNITS.has(item.unit)) errors.unit = 'Choose a valid unit.';
  if (item.expirationDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.expirationDate)) {
    errors.expirationDate = 'Use a valid expiration date.';
  }

  return { item, errors, valid: Object.keys(errors).length === 0 };
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

module.exports = { LOCATIONS, UNITS, validateItem, parseId };
