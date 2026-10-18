'use strict';

const { findRecipes } = require('../src/recipes');

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.end(JSON.stringify(payload));
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const ingredients = String(url.searchParams.get('ingredients') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!ingredients.length) return send(res, 200, { recipes: [], provider: 'TheMealDB' });

    const recipes = await findRecipes(ingredients);
    return send(res, 200, {
      recipes,
      provider: 'TheMealDB',
      attributionUrl: 'https://www.themealdb.com/'
    });
  } catch (error) {
    console.error(error);
    return send(res, 502, { error: 'Live recipes are temporarily unavailable.' });
  }
}

module.exports = handler;
