/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import useStore from './store'
import imageData from './imageData'
import {generateImage, generateText} from './llm'
import {imageDB} from './indexedDBStorage'

const get = useStore.getState
const set = useStore.setState
const imageModel = 'gemini-2.5-flash-image'
const textModel = 'gemini-2.5-flash'

export const initApp = async () => {
  if (get().didInit) return

  // Zustand's persist middleware rehydrates automatically and asynchronously.
  // We wait for it to be done before proceeding.
  await useStore.persist.rehydrate()

  const photosFromStore = get().photos
  const allImageKeysInDb = await imageDB.getAllKeys()
  const validPhotos = []
  const validPhotoIds = new Set()

  for (const photo of photosFromStore) {
    const data = await imageDB.get(photo.id)
    if (data?.input && data?.output) {
      imageData.inputs[photo.id] = data.input
      imageData.outputs[photo.id] = data.output
      validPhotos.push({...photo, isBusy: false})
      validPhotoIds.add(photo.id)
    }
  }

  for (const key of allImageKeysInDb) {
    if (!validPhotoIds.has(key)) {
      await imageDB.delete(key)
    }
  }

  set(state => {
    state.photos = validPhotos
    state.didInit = true
  })
}

export const snapPhoto = async b64 => {
  const id = crypto.randomUUID()
  const {customPrompt, promptHistory} = get()
  const promptToUse = customPrompt

  if (!promptToUse.trim()) {
    console.warn('Attempted to snap photo with an empty prompt.')
    return
  }

  imageData.inputs[id] = b64
  await imageDB.set(id, {input: b64})

  set(state => {
    state.photos.unshift({id, mode: 'custom', isBusy: true})
  })

  if (customPrompt && !promptHistory.some(p => p.prompt === customPrompt)) {
    try {
      const title = await generateText({
        model: textModel,
        prompt: `أنشئ عنواناً قصيراً جداً من كلمتين أو ثلاث للطلب التالي. أرجع العنوان فقط ولا شيء آخر. الطلب: "${customPrompt}"`
      })
      if (title) {
        set(state => {
          state.promptHistory.unshift({
            id: crypto.randomUUID(),
            title: title.replace(/"/g, ''),
            prompt: customPrompt
          })
        })
      }
    } catch (e) {
      console.error('Failed to generate prompt title', e)
    }
  }

  try {
    const result = await generateImage({
      model: imageModel,
      prompt: promptToUse,
      inputFile: b64
    })

    imageData.outputs[id] = result
    const currentImageData = await imageDB.get(id)
    await imageDB.set(id, {...currentImageData, output: result})

    set(state => {
      state.photos = state.photos.map(photo =>
        photo.id === id ? {...photo, isBusy: false} : photo
      )
    })
  } catch (e) {
    console.error('Failed to generate image', e)
    set(state => {
      state.photos = state.photos.filter(p => p.id !== id)
    })
    delete imageData.inputs[id]
    await imageDB.delete(id)
  }
}

export const deletePhoto = async id => {
  set(state => {
    state.photos = state.photos.filter(photo => photo.id !== id)
  })

  delete imageData.inputs[id]
  delete imageData.outputs[id]
  await imageDB.delete(id)
}

export const setCustomPrompt = prompt =>
  set(state => {
    state.customPrompt = prompt
  })
