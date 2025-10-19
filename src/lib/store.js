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
      customPrompt: '',
      promptHistory: []
    })),
    {
      name: 'smart-camera-store',
      storage: indexedDBStorage,
      partialize: state => ({
        promptHistory: state.promptHistory,
        customPrompt: state.customPrompt
      })
    }
  )
)
