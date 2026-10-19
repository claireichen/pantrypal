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

function cleanIdentifier(value) {
  if (typeof value !== 'string') return '';
  const identifier = value.trim();
  return /^[a-zA-Z0-9._-]{1,100}$/.test(identifier) ? identifier : '';
}

function cleanImageUrl(value) {
  if (typeof value !== 'string' || value.length > 600) return '';
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function validateCustomRecipe(input = {}) {
  const ingredients = Array.isArray(input.ingredients)
    ? input.ingredients.map((value) => cleanText(value, 100)).filter(Boolean).slice(0, 40)
    : [];
  const recipe = {
    id: cleanIdentifier(input.id) || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanText(input.name, 80),
    ingredients,
    directions: cleanText(input.directions, 800),
    image: cleanImageUrl(input.image),
    custom: true
  };
  const errors = {};
  if (!recipe.name) errors.name = 'Enter a recipe name.';
  if (!recipe.ingredients.length) errors.ingredients = 'Add at least one ingredient.';
  return { recipe, errors, valid: Object.keys(errors).length === 0 };
}

function validateShoppingItem(input = {}) {
  const item = {
    id: cleanIdentifier(input.id) || `shopping-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanText(input.name, 80),
    done: input.done === true
  };
  return { item, valid: Boolean(item.name), errors: item.name ? {} : { name: 'Enter a shopping item.' } };
}

function validateNotificationSettings(input = {}) {
  return {
    days: [1, 3, 5, 7].includes(Number(input.days)) ? Number(input.days) : 3,
    inApp: input.inApp !== false,
    browser: input.browser === true
  };
}

module.exports = {
  LOCATIONS,
  UNITS,
  validateItem,
  parseId,
  validateCustomRecipe,
  validateShoppingItem,
  validateNotificationSettings
};
