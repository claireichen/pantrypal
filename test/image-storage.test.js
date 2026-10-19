'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeImage } = require('../src/image-storage');

test('accepts supported recipe image data', () => {
  const image = decodeImage('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(image.mimeType, 'image/png');
  assert.equal(image.extension, 'png');
  assert.ok(image.buffer.length > 0);
});

test('rejects unsupported recipe image data', () => {
  assert.throws(() => decodeImage('data:image/svg+xml;base64,PHN2Zz4='), /JPG, PNG, or WebP/);
});
