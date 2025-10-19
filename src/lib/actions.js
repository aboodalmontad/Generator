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
  set(state => {
    state.didInit = true
  })
}

export const snapPhoto = async (b64, mimeType = 'image/jpeg') => {
  const id = crypto.randomUUID()
  const {customPrompt, promptHistory} = get()
  const promptToUse = customPrompt

  if (!promptToUse.trim()) {
    console.warn('Attempted to snap photo with an empty prompt.')
    return null
  }

  imageData.inputs[id] = b64
  await imageDB.set(id, {input: b64})

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
      inputFile: b64,
      inputMimeType: mimeType
    })

    imageData.outputs[id] = result
    const currentImageData = await imageDB.get(id)
    await imageDB.set(id, {...currentImageData, output: result})

    return id
  } catch (e) {
    console.error('Failed to generate image', e)
    delete imageData.inputs[id]
    await imageDB.delete(id)
    throw e
  }
}

export const setCustomPrompt = prompt =>
  set(state => {
    state.customPrompt = prompt
  })