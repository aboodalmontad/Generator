/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import useStore from './store'
import imageData from './imageData'
import {generateImage, generateText} from './llm'
import modes from './modes'

const get = useStore.getState
const set = useStore.setState
const imageModel = 'gemini-2.5-flash-image'
const textModel = 'gemini-2.5-flash'

export const init = () => {
  if (get().didInit) {
    return
  }

  set(state => {
    state.didInit = true
  })
}

export const snapPhoto = async b64 => {
  const id = crypto.randomUUID()
  const {customPrompt, promptHistory, activeMode} = get()
  const mode = modes[activeMode]
  const promptToUse = activeMode === 'custom' ? customPrompt : mode.prompt

  if (!promptToUse.trim()) {
    console.warn('Attempted to snap photo with an empty prompt.')
    return
  }

  imageData.inputs[id] = b64

  set(state => {
    state.photos.unshift({id, mode: activeMode, isBusy: true})
  })

  if (
    activeMode === 'custom' &&
    customPrompt &&
    !promptHistory.some(p => p.prompt === customPrompt)
  ) {
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
  }
}

export const deletePhoto = id => {
  set(state => {
    state.photos = state.photos.filter(photo => photo.id !== id)
  })

  delete imageData.inputs[id]
  delete imageData.outputs[id]
}

export const setCustomPrompt = prompt =>
  set(state => {
    state.customPrompt = prompt
  })

export const setActiveMode = mode =>
  set(state => {
    state.activeMode = mode
  })

init()