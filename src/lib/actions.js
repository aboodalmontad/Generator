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
  await useStore.persist.rehydrate()
  const keys = await imageDB.getAllKeys()
  set(state => {
    state.imageIds = keys.reverse()
    state.didInit = true
  })
}

export const addPromptToHistory = async prompt => {
  const {promptHistory} = get()
  if (prompt.trim() && !promptHistory.some(p => p.prompt === prompt)) {
    try {
      const title = await generateText({
        model: textModel,
        prompt: `أنشئ عنواناً قصيراً جداً من كلمتين أو ثلاث للطلب التالي. أرجع العنوان فقط ولا شيء آخر. الطلب: "${prompt}"`
      })
      if (title) {
        set(state => {
          state.promptHistory.unshift({
            id: crypto.randomUUID(),
            title: title.replace(/"/g, ''),
            prompt: prompt
          })
        })
        return true
      }
    } catch (e) {
      console.error('Failed to generate prompt title', e)
    }
  }
  return false
}

export const snapPhoto = async (
  b64,
  mimeType = 'image/jpeg',
  provider,
  huggingFaceApiKey
) => {
  const id = crypto.randomUUID()
  const {customPrompt} = get()
  const promptToUse = customPrompt

  if (!promptToUse.trim()) {
    console.warn('Attempted to snap photo with an empty prompt.')
    return null
  }

  imageData.inputs[id] = b64
  await imageDB.set(id, {input: b64, prompt: promptToUse, provider: provider})

  await addPromptToHistory(customPrompt)

  try {
    const result = await generateImage({
      prompt: promptToUse,
      inputFile: b64,
      inputMimeType: mimeType,
      provider: provider,
      huggingFaceApiKey: huggingFaceApiKey
    })

    imageData.outputs[id] = result
    const currentImageData = await imageDB.get(id)
    await imageDB.set(id, {...currentImageData, output: result})

    set(state => {
      state.imageIds.unshift(id)
    })

    return id
  } catch (e) {
    console.error('Failed to generate image', e)
    delete imageData.inputs[id]
    await imageDB.delete(id)
    throw e
  }
}

export const regeneratePhoto = async id => {
  const imageDataFromDB = await imageDB.get(id)
  if (!imageDataFromDB || !imageDataFromDB.input || !imageDataFromDB.prompt) {
    throw new Error('Original image data or prompt not found for regeneration.')
  }

  const {input: b64, prompt: promptToUse, provider = 'gemini'} = imageDataFromDB
  const mimeType = b64.substring(b64.indexOf(':') + 1, b64.indexOf(';'))
  const {huggingFaceApiKey} = get()

  try {
    const result = await generateImage({
      prompt: promptToUse,
      inputFile: b64,
      inputMimeType: mimeType,
      provider: provider,
      huggingFaceApiKey: huggingFaceApiKey
    })

    imageData.outputs[id] = result
    const currentImageData = await imageDB.get(id)
    await imageDB.set(id, {...currentImageData, output: result})

    if (!imageData.inputs[id]) {
      imageData.inputs[id] = b64
    }

    return id
  } catch (e) {
    console.error('Failed to regenerate image', e)
    throw e
  }
}

export const setCustomPrompt = prompt =>
  set(state => {
    state.customPrompt = prompt
  })

export const updatePromptInHistory = (id, newPrompt) => {
  set(state => {
    const promptIndex = state.promptHistory.findIndex(p => p.id === id)
    if (promptIndex !== -1) {
      state.promptHistory[promptIndex].prompt = newPrompt
    }
  })
}

export const deletePromptFromHistory = id => {
  set(state => {
    state.promptHistory = state.promptHistory.filter(p => p.id !== id)
  })
}

export const deletePhoto = async id => {
  delete imageData.inputs[id]
  delete imageData.outputs[id]
  await imageDB.delete(id)
  set(state => {
    state.imageIds = state.imageIds.filter(imageId => imageId !== id)
  })
}

export const loadPhotoData = async id => {
  if (!id) return
  if (imageData.inputs[id] && imageData.outputs[id]) {
    return
  }
  const dataFromDB = await imageDB.get(id)
  if (dataFromDB) {
    imageData.inputs[id] = dataFromDB.input
    imageData.outputs[id] = dataFromDB.output
  }
}

export const restorePrompts = async prompts => {
  if (Array.isArray(prompts)) {
    const sanitizedPrompts = prompts
      // Filter out any invalid items first
      .filter(p => p && typeof p === 'object' && p.id && p.prompt)
      // Ensure all valid items have a title for consistent display
      .map(p => ({
        id: p.id,
        prompt: p.prompt,
        title:
          p.title ||
          p.prompt.substring(0, 30) + (p.prompt.length > 30 ? '...' : '')
      }))

    set(state => {
      state.promptHistory = sanitizedPrompts
    })
  }
}