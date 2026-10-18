'use strict';

const DEFAULT_API_BASE = 'https://www.themealdb.com/api/json/v1';
const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

const INGREDIENT_ALIASES = new Map([
  ['baby spinach', 'spinach'],
  ['frozen peas', 'peas'],
  ['frozen fruit', 'mixed fruit'],
  ['eggs', 'egg'],
  ['carrots', 'carrot'],
  ['tortillas', 'flour tortilla']
]);

function cleanIngredient(value) {
  const cleaned = String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return INGREDIENT_ALIASES.get(cleaned) || cleaned;
}

function safeExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseMeal(meal) {
  const ingredients = [];
  const measures = [];
  for (let index = 1; index <= 20; index += 1) {
    const ingredient = String(meal[`strIngredient${index}`] || '').trim();
    if (!ingredient) continue;
    ingredients.push(ingredient);
    measures.push(String(meal[`strMeasure${index}`] || '').trim());
  }

  return {
    id: `themealdb-${meal.idMeal}`,
    externalId: meal.idMeal,
    name: String(meal.strMeal || 'Untitled recipe').trim().slice(0, 120),
    ingredients,
    measures,
    directions: String(meal.strInstructions || '').trim().replace(/\r\n/g, '\n').slice(0, 3000),
    image: safeExternalUrl(meal.strMealThumb),
    sourceUrl: safeExternalUrl(meal.strSource) || `https://www.themealdb.com/meal/${encodeURIComponent(meal.idMeal)}`,
    videoUrl: safeExternalUrl(meal.strYoutube),
    category: String(meal.strCategory || '').trim().slice(0, 60),
    area: String(meal.strArea || '').trim().slice(0, 60),
    provider: 'TheMealDB'
  };
}

async function fetchJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'PantryPal/1.0' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Recipe provider returned ${response.status}.`);
  return response.json();
}

async function findRecipes(ingredientNames, options = {}) {
  const apiKey = options.apiKey || process.env.THEMEALDB_API_KEY || '1';
  const apiBase = options.apiBase || DEFAULT_API_BASE;
  const fetchImpl = options.fetchImpl || fetch;
  const ingredients = [...new Set(ingredientNames.map(cleanIngredient).filter(Boolean))].slice(0, 4);
  if (!ingredients.length) return [];

  const cacheKey = ingredients.sort().join('|');
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.recipes;

  const candidateLists = await Promise.all(ingredients.map(async (ingredient) => {
    const url = `${apiBase}/${encodeURIComponent(apiKey)}/filter.php?i=${encodeURIComponent(ingredient.replace(/ /g, '_'))}`;
    try {
      const payload = await fetchJson(url, fetchImpl);
      return Array.isArray(payload.meals) ? payload.meals : [];
    } catch {
      return [];
    }
  }));

  const candidates = new Map();
  candidateLists.forEach((meals, ingredientIndex) => {
    meals.forEach((meal, resultIndex) => {
      const current = candidates.get(meal.idMeal) || { ...meal, matches: 0, order: ingredientIndex * 100 + resultIndex };
      current.matches += 1;
      current.order = Math.min(current.order, ingredientIndex * 100 + resultIndex);
      candidates.set(meal.idMeal, current);
    });
  });

  const selected = [];
  const selectedIds = new Set();
  const addCandidate = (meal) => {
    if (!meal || selectedIds.has(meal.idMeal) || selected.length >= 8) return false;
    selectedIds.add(meal.idMeal);
    selected.push(meal);
    return true;
  };

  [...candidates.values()]
    .filter((meal) => meal.matches > 1)
    .sort((a, b) => b.matches - a.matches || a.order - b.order)
    .forEach(addCandidate);

  for (let resultIndex = 0; selected.length < 8; resultIndex += 1) {
    let foundAtThisIndex = false;
    for (const meals of candidateLists) {
      if (meals[resultIndex]) foundAtThisIndex = true;
      addCandidate(meals[resultIndex]);
    }
    if (!foundAtThisIndex) break;
  }

  const details = await Promise.all(selected.map(async (meal) => {
    try {
      const payload = await fetchJson(`${apiBase}/${encodeURIComponent(apiKey)}/lookup.php?i=${encodeURIComponent(meal.idMeal)}`, fetchImpl);
      return payload.meals?.[0] ? parseMeal(payload.meals[0]) : null;
    } catch {
      return null;
    }
  }));

  const recipes = details.filter(Boolean);
  cache.set(cacheKey, { createdAt: Date.now(), recipes });
  return recipes;
}

module.exports = { cleanIngredient, findRecipes, parseMeal, safeExternalUrl };
