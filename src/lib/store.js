/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import 'immer'
import {create} from 'zustand'
import {immer} from 'zustand/middleware/immer'
import {persist} from 'zustand/middleware'
import {createSelectorFunctions} from 'auto-zustand-selectors-hook'
import {indexedDBStorage} from './indexedDBStorage.js'

export default createSelectorFunctions(
  create(
    persist(
      immer(() => ({
        didInit: false,
        photos: [],
        activeMode: 'custom',
        gifInProgress: false,
        gifUrl: null,
        customPrompt: '',
        promptHistory: []
      })),
      {
        name: 'gembooth-prompt-history',
        storage: indexedDBStorage,
        partialize: state => ({promptHistory: state.promptHistory})
      }
    )
  )
)
