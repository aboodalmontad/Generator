/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import 'immer'
import {create} from 'zustand'
import {immer} from 'zustand/middleware/immer'
import {persist} from 'zustand/middleware'
import {indexedDBStorage} from './indexedDBStorage.js'

export default create(
  persist(
    immer(() => ({
      didInit: false,
      photos: [],
      customPrompt: '',
      promptHistory: []
    })),
    {
      name: 'fotographer-store',
      storage: indexedDBStorage,
      partialize: state => ({
        photos: state.photos
          .filter(p => !p.isBusy)
          .map(({id, mode}) => ({id, mode})),
        promptHistory: state.promptHistory,
        customPrompt: state.customPrompt
      })
    }
  )
)
