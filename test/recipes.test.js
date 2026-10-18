'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanIngredient, parseMeal, safeExternalUrl } = require('../src/recipes');

test('normalizes common inventory names for recipe searches', () => {
  assert.equal(cleanIngredient('Baby Spinach'), 'spinach');
  assert.equal(cleanIngredient('Frozen peas'), 'peas');
  assert.equal(cleanIngredient('Eggs'), 'egg');
});

test('maps a TheMealDB meal into PantryPal recipe data', () => {
  const recipe = parseMeal({
    idMeal: '42',
    strMeal: 'Vegetable Pasta',
    strIngredient1: 'Pasta',
    strMeasure1: '2 cups',
    strIngredient2: 'Spinach',
    strMeasure2: '1 cup',
    strInstructions: 'Cook and combine.',
    strMealThumb: 'https://example.com/meal.jpg',
    strSource: 'https://example.com/recipe',
    strCategory: 'Vegetarian',
    strArea: 'Italian'
  });
  assert.equal(recipe.id, 'themealdb-42');
  assert.deepEqual(recipe.ingredients, ['Pasta', 'Spinach']);
  assert.deepEqual(recipe.measures, ['2 cups', '1 cup']);
  assert.equal(recipe.provider, 'TheMealDB');
});

test('only accepts safe external recipe URLs', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('https://example.com/a'), 'https://example.com/a');
});
