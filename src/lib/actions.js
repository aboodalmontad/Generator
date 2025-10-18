/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import * as gifenc from 'gifenc'
import useStore from './store'
import imageData from './imageData'
import {generateImage, generateText} from './llm'

const get = useStore.getState
const set = useStore.setState
const gifSize = 512
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
  const {customPrompt, promptHistory} = get()
  imageData.inputs[id] = b64

  set(state => {
    state.photos.unshift({id, mode: 'custom', isBusy: true})
  })

  if (customPrompt && !promptHistory.some(p => p.prompt === customPrompt)) {
    try {
      const title = await generateText({
        model: textModel,
        prompt: `Generate a very short, two or three-word title for the following prompt. Return only the title and nothing else. Prompt: "${customPrompt}"`
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
      prompt: customPrompt,
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

const processImageToCanvas = async (base64Data, size) => {
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = base64Data
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = size
  canvas.height = size

  const imgAspect = img.width / img.height
  const canvasAspect = 1

  let drawWidth
  let drawHeight
  let drawX
  let drawY

  if (imgAspect > canvasAspect) {
    drawHeight = size
    drawWidth = drawHeight * imgAspect
    drawX = (size - drawWidth) / 2
    drawY = 0
  } else {
    drawWidth = size
    drawHeight = drawWidth / imgAspect
    drawX = 0
    drawY = (size - drawHeight) / 2
  }

  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

  return ctx.getImageData(0, 0, size, size)
}

const addFrameToGif = (gif, imageData, size, delay) => {
  const palette = gifenc.quantize(imageData.data, 256)
  const indexed = gifenc.applyPalette(imageData.data, palette)

  gif.writeFrame(indexed, size, size, {
    palette,
    delay
  })
}

export const makeGif = async () => {
  const {photos} = get()

  set(state => {
    state.gifInProgress = true
  })

  try {
    const gif = gifenc.GIFEncoder()
    const readyPhotos = photos.filter(photo => !photo.isBusy)

    for (const photo of readyPhotos) {
      const inputImageData = await processImageToCanvas(
        imageData.inputs[photo.id],
        gifSize
      )
      addFrameToGif(gif, inputImageData, gifSize, 333)

      const outputImageData = await processImageToCanvas(
        imageData.outputs[photo.id],
        gifSize
      )
      addFrameToGif(gif, outputImageData, gifSize, 833)
    }

    gif.finish()

    const gifUrl = URL.createObjectURL(
      new Blob([gif.buffer], {type: 'image/gif'})
    )

    set(state => {
      state.gifUrl = gifUrl
    })
  } catch (error) {
    console.error('Error creating GIF:', error)
    return null
  } finally {
    set(state => {
      state.gifInProgress = false
    })
  }
}

export const hideGif = () =>
  set(state => {
    state.gifUrl = null
  })

export const setCustomPrompt = prompt =>
  set(state => {
    state.customPrompt = prompt
  })

init()