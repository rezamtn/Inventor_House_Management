import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeForSearch, normalizePersian, searchInventory } from '../src/search.js';

const SECTORS = [
  { id: 'anbar', label: 'انباری', icon: '📦' },
  { id: 'ashpazkhane', label: 'آشپزخانه', icon: '🍳' },
];

function buildData() {
  return {
    version: 5,
    houses: [
      {
        id: 'h1',
        name: 'خانه تهران',
        sectors: {
          anbar: {
            updatedAt: null,
            items: [{ id: 'i-namak', name: 'نمک', qty: 1, unit: 'بسته', status: 'available' }],
            sections: [
              {
                id: 's1',
                name: 'طبقه بالا',
                items: [],
                subsections: [
                  {
                    id: 'sub1',
                    name: 'کیسه آبی',
                    items: [
                      { id: 'i-brenj', name: 'برنج', qty: 2, unit: 'کیلوگرم', status: 'available' },
                      { id: 'i-lobia', name: 'لوبیا', qty: 1, unit: 'بسته', status: 'low' },
                    ],
                  },
                ],
              },
            ],
          },
          ashpazkhane: { updatedAt: null, items: [], sections: [] },
        },
      },
    ],
  };
}

test('normalizePersian unifies ي/ی and ك/ک', () => {
  assert.equal(normalizePersian('كيسه'), 'کیسه');
  assert.equal(normalizeForSearch('كيسه آبي'), 'کیسه آبی');
});

test('direct item-name match returns the item as a non-inherited result', () => {
  const results = searchInventory(buildData(), 'نمک', SECTORS);
  const itemResults = results.filter(r => r.type === 'item');
  assert.equal(itemResults.length, 1);
  assert.equal(itemResults[0].name, 'نمک');
  assert.equal(itemResults[0].matchedByLocation, false);
});

test('subsection/container-name match surfaces the location itself', () => {
  const results = searchInventory(buildData(), 'آبی', SECTORS);
  const locationResults = results.filter(r => r.type === 'location');
  assert.equal(locationResults.length, 1);
  assert.equal(locationResults[0].matchedField, 'subsection');
  assert.equal(locationResults[0].subId, 'sub1');
});

test('items inside a matching container are inherited into the results even without a name match', () => {
  const results = searchInventory(buildData(), 'آبی', SECTORS);
  const itemResults = results.filter(r => r.type === 'item');
  const ids = itemResults.map(r => r.id).sort();
  assert.deepEqual(ids, ['i-brenj', 'i-lobia']);
  itemResults.forEach(r => {
    assert.equal(r.matchedByLocation, true);
    assert.equal(r.matchedLocationLabel, 'کیسه آبی');
  });
});

test('search normalizes ي/ك variants when matching a container name', () => {
  const results = searchInventory(buildData(), 'كيسه', SECTORS);
  const locationResults = results.filter(r => r.type === 'location');
  assert.equal(locationResults.length, 1);
  assert.equal(locationResults[0].subId, 'sub1');
});

test('house-name match cascades to every sector and item under that house', () => {
  const results = searchInventory(buildData(), 'تهران', SECTORS);
  const locationResults = results.filter(r => r.type === 'location');
  assert.equal(locationResults.length, 2); // one per sector under the house
  const itemResults = results.filter(r => r.type === 'item');
  assert.equal(itemResults.length, 3); // namak + brenj + lobia
  itemResults.forEach(r => assert.equal(r.matchedByLocation, true));
});

test('no match returns an empty array', () => {
  assert.deepEqual(searchInventory(buildData(), 'چیزی-که-نیست', SECTORS), []);
});

test('empty query returns an empty array', () => {
  assert.deepEqual(searchInventory(buildData(), '   ', SECTORS), []);
});
