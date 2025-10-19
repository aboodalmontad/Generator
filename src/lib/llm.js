/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, Modality} from '@google/genai'
import pLimit from 'p-limit'

const timeoutMs = 123_333
const maxRetries = 5
const baseDelay = 1_233

let ai;
const getAi = () => {
  if (!ai) {
    ai = new GoogleGenAI({apiKey: 'AIzaSyBAfB0TlJyFamN8flMZHNtqot2aeRq5avM'});
  }
  return ai;
};

const imageLimiter = pLimit(2)
const textLimiter = pLimit(4)

const safetySettings = [
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_HARASSMENT'
].map(category => ({category, threshold: 'BLOCK_NONE'}))

const _generateImage = async ({model, prompt, inputFile}) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      )

      const modelPromise = getAi().models.generateContent(
        {
          model,
          config: {responseModalities: [Modality.IMAGE]},
          contents: {
            parts: [
              ...(inputFile
                ? [
                    {
                      inlineData: {
                        data: inputFile.split(',')[1],
                        mimeType: 'image/jpeg'
                      }
                    }
                  ]
                : []),
              {text: prompt}
            ]
          }
        }
      )

      const response = await Promise.race([modelPromise, timeoutPromise])

      if (!response.candidates || response.candidates.length === 0) {
        throw new Error('No candidates in response')
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

export const generateImage = args => imageLimiter(() => _generateImage(args))

const _generateText = async ({model, prompt}) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      )

      const modelPromise = getAi().models.generateContent(
        {
          model,
          contents: prompt,
          config: {
            safetySettings
          }
        }
      )

      const response = await Promise.race([modelPromise, timeoutPromise])

      if (!response.text) {
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