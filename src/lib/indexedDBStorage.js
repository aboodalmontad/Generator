/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {openDB} from 'idb'

const dbPromise = openDB('smart-camera-db', 1, {
  upgrade(db) {
    db.createObjectStore('keyval')
  }
})

export const indexedDBStorage = {
  getItem: async name => {
    return (await dbPromise).get('keyval', name)
  },
  setItem: async (name, value) => {
    return (await dbPromise).put('keyval', value, name)
  },
  removeItem: async name => {
    return (await dbPromise).delete('keyval', name)
  }
}

const imageDbPromise = openDB('smart-camera-images-db', 1, {
  upgrade(db) {
    db.createObjectStore('images')
  }
})

export const imageDB = {
  get: async id => (await imageDbPromise).get('images', id),
  set: async (id, value) => (await imageDbPromise).put('images', value, id),
  delete: async id => (await imageDbPromise).delete('images', id),
  getAllKeys: async () => (await imageDbPromise).getAllKeys('images')
}
