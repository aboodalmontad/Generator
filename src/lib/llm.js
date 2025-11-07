/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, Modality} from '@google/genai'
import pLimit from 'p-limit'

const timeoutMs = 123_333
const maxRetries = 5
const baseDelay = 1_233

// Gemini settings
let ai
const getAi = () => {
  if (!ai) {
    ai = new GoogleGenAI({apiKey: process.env.API_KEY})
  }
  return ai
}

// Hugging Face settings
const HUGGING_FACE_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0'

const imageLimiter = pLimit(2)
const textLimiter = pLimit(4)

const safetySettings = [
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_HARASSMENT'
].map(category => ({category, threshold: 'BLOCK_NONE'}))

const _generateImageGemini = async ({
  model,
  prompt,
  inputFile,
  inputMimeType
}) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      )

      const modelPromise = getAi().models.generateContent({
        model,
        config: {responseModalities: [Modality.IMAGE]},
        contents: {
          parts: [
            ...(inputFile
              ? [
                  {
                    inlineData: {
                      data: inputFile.split(',')[1],
                      mimeType: inputMimeType || 'image/jpeg'
                    }
                  }
                ]
              : []),
            {text: prompt}
          ]
        }
      })

      const response = await Promise.race([modelPromise, timeoutPromise])

      if (response?.promptFeedback?.blockReason) {
        throw new Error(
          `تم حظر طلبك للسبب التالي: ${response.promptFeedback.blockReason}.`
        )
      }

      if (!response.candidates?.[0]?.content?.parts) {
        if (
          response?.candidates?.[0]?.finishReason &&
          response.candidates[0].finishReason !== 'STOP'
        ) {
          const reason = response.candidates[0].finishReason
          let message = `فشل إنشاء الصورة. السبب: ${reason}.`
          if (reason === 'NO_IMAGE') {
            message =
              'لم يتمكن النموذج من إنشاء صورة بناءً على طلبك. قد يكون هذا بسبب سياسات السلامة أو أن الطلب غير واضح. يرجى محاولة تعديل طلبك.'
          }
          throw new Error(message)
        }
        throw new Error('لم يتم العثور على نتائج صالحة في الاستجابة.')
      }

      const inlineDataPart = response.candidates[0].content.parts.find(
        p => p.inlineData
      )
      if (!inlineDataPart) {
        throw new Error('No inline data found in response')
      }

      return 'data:image/png;base64,' + inlineDataPart.inlineData.data
    } catch (error) {
      if (error.name === 'AbortError') {
        return
      }

      if (attempt === maxRetries - 1) {
        throw error
      }

      const delay = baseDelay * 2 ** attempt
      await new Promise(res => setTimeout(res, delay))
      console.warn(
        `Attempt ${attempt + 1} failed, retrying after ${delay}ms...`
      )
    }
  }
}

const _generateImageHuggingFace = async ({prompt, huggingFaceApiKey}) => {
  const trimmedApiKey = huggingFaceApiKey ? huggingFaceApiKey.trim() : ''
  if (!trimmedApiKey) {
    throw new Error('Hugging Face API key is missing.')
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      )

      const modelPromise = fetch(
        `https://api-inference.huggingface.co/models/${HUGGING_FACE_MODEL}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${trimmedApiKey}`,
            'Content-Type': 'application/json',
            'x-use-cache': 'false'
          },
          body: JSON.stringify({
            inputs: prompt
          })
        }
      )

      const response = await Promise.race([modelPromise, timeoutPromise])

      if (!response.ok) {
        const errorText = await response.text()
        let errorBody = {}
        try {
          errorBody = JSON.parse(errorText)
        } catch (e) {
          throw new Error(
            `Hugging Face API Error: ${response.status} ${response.statusText} - ${errorText}`
          )
        }

        if (
          errorBody.error &&
          typeof errorBody.error === 'string' &&
          errorBody.error.includes('is currently loading')
        ) {
          console.warn(
            `Hugging Face model is loading. Retrying... (Attempt ${
              attempt + 1
            })`
          )
          const delay = errorBody.estimated_time
            ? errorBody.estimated_time * 1000
            : baseDelay * 2 ** attempt
          await new Promise(res => setTimeout(res, Math.min(delay, 15000))) // Cap delay
          continue // Skip to next attempt
        }
        throw new Error(
          `Hugging Face API Error: ${response.statusText} - ${
            errorBody.error || 'Unknown error'
          }`
        )
      }

      const blob = await response.blob()
      if (blob.type.startsWith('image/')) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      } else {
        throw new Error('Hugging Face API did not return an image.')
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return
      }
      if (attempt === maxRetries - 1) {
        throw error
      }
      const delay = baseDelay * 2 ** attempt
      await new Promise(res => setTimeout(res, delay))
      console.warn(
        `Attempt ${
          attempt + 1
        } failed for Hugging Face, retrying after ${delay}ms...`
      )
    }
  }
  throw new Error(
    'Failed to generate image with Hugging Face after multiple retries.'
  )
}

export const generateImage = args => {
  const {provider} = args
  if (provider === 'huggingface') {
    return imageLimiter(() => _generateImageHuggingFace(args))
  }
  // Default to gemini
  return imageLimiter(() =>
    _generateImageGemini({...args, model: 'gemini-2.5-flash-image'})
  )
}

const _generateText = async ({model, prompt}) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      )

      const modelPromise = getAi().models.generateContent({
        model,
        contents: prompt,
        config: {
          safetySettings
        }
      })

      const response = await Promise.race([modelPromise, timeoutPromise])

      if (!response.text) {
        if (response?.promptFeedback?.blockReason) {
          throw new Error(
            `تم حظر طلبك للسبب التالي: ${response.promptFeedback.blockReason}.`
          )
        }
        throw new Error('No text in response')
      }

      return response.text.trim()
    } catch (error) {
      if (error.name === 'AbortError') {
        return
      }

      if (attempt === maxRetries - 1) {
        throw error
      }

      const delay = baseDelay * 2 ** attempt
      await new Promise(res => setTimeout(res, delay))
      console.warn(
        `Attempt ${attempt + 1} failed, retrying after ${delay}ms...`
      )
    }
  }
}

export const generateText = args => textLimiter(() => _generateText(args))
