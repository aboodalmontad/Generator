/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { openDB } from 'idb';

const dbPromise = openDB('fotographer-db', 1, {
  upgrade(db) {
    db.createObjectStore('keyval');
  },
});

export const indexedDBStorage = {
  getItem: async (name) => {
    return (await dbPromise).get('keyval', name);
  },
  setItem: async (name, value) => {
    return (await dbPromise).put('keyval', value, name);
  },
  removeItem: async (name) => {
    return (await dbPromise).delete('keyval', name);
  },
};
