/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {useRef, useState, useEffect} from 'react'
import c from 'clsx'
import {
  snapPhoto,
  setCustomPrompt,
  initApp
} from '../lib/actions'
import useStore from '../lib/store'
import imageData from '../lib/imageData'

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')

export default function App() {
  const customPrompt = useStore(state => state.customPrompt)
  const promptHistory = useStore(state => state.promptHistory)
  const [appMode, setAppMode] = useState('idle') // idle, camera, uploaded
  const [uploadedImage, setUploadedImage] = useState(null)
  const [focusedId, setFocusedId] = useState(null)
  const [activeTab, setActiveTab] = useState('generated')
  const [didJustSnap, setDidJustSnap] = useState(false)
  const [facingMode, setFacingMode] = useState('user')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [isConfigured, setIsConfigured] = useState(true);
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const clickTimeout = useRef(null)

  useEffect(() => {
    initApp()
    if (!process.env.API_KEY) {
      setIsConfigured(false);
    }
  }, [])

  useEffect(() => {
    if (focusedId) {
      setActiveTab('generated')
    }
  }, [focusedId])

  const isShutterDisabled = !customPrompt.trim() || isGenerating

  const startCamera = async mode => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop())
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: {ideal: 1920},
          height: {ideal: 1080},
          facingMode: {ideal: mode}
        },
        audio: false
      })
      videoRef.current.srcObject = stream
      setAppMode('camera')
      setUploadedImage(null)

      if (!hasMultipleCameras) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (devices.filter(d => d.kind === 'videoinput').length > 1) {
          setHasMultipleCameras(true)
        }
      }

      const {width, height} = stream.getVideoTracks()[0].getSettings()
      const squareSize = Math.min(width, height)
      canvas.width = squareSize
      canvas.height = squareSize
    } catch (err) {
      console.error('Failed to start video', err)
      setAppMode('idle')
    }
  }

  const switchCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newMode)
    startCamera(newMode)
  }

  const handleFileSelect = e => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = e => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop())
      }
      setUploadedImage(e.target.result)
      setAppMode('uploaded')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleGenerate = async () => {
    if (isShutterDisabled) return
    setError(null)
    setIsGenerating(true)
    try {
      let id
      let b64

      if (appMode === 'camera') {
        const video = videoRef.current
        const {videoWidth, videoHeight} = video
        const squareSize = canvas.width
        const sourceSize = Math.min(videoWidth, videoHeight)
        const sourceX = (videoWidth - sourceSize) / 2
        const sourceY = (videoHeight - sourceSize) / 2

        ctx.clearRect(0, 0, squareSize, squareSize)
        ctx.setTransform(1, 0, 0, 1, 0, 0)

        if (facingMode === 'user') {
          ctx.scale(-1, 1)
          ctx.drawImage(
            video,
            sourceX,
            sourceY,
            sourceSize,
            sourceSize,
            -squareSize,
            0,
            squareSize,
            squareSize
          )
        } else {
          ctx.drawImage(
            video,
            sourceX,
            sourceY,
            sourceSize,
            sourceSize,
            0,
            0,
            squareSize,
            squareSize
          )
        }
        b64 = canvas.toDataURL('image/jpeg')
        setDidJustSnap(true)
        setTimeout(() => setDidJustSnap(false), 1000)
      } else if (appMode === 'uploaded' && uploadedImage) {
        b64 = uploadedImage
      }

      if (b64) {
        id = await snapPhoto(b64)
      }

      if (id) {
        setFocusedId(id)
        if (appMode === 'uploaded') {
          setUploadedImage(null)
          setAppMode('idle')
        }
      }
    } catch (e) {
      console.error('Error generating image:', e);
      let userMessage = 'حدث خطأ أثناء توليد الصورة.';
      if (e && e.message && /API key|PERMISSION_DENIED/i.test(e.message)) {
        userMessage = 'حدث خطأ في المصادقة. يرجى التأكد من صحة مفتاح API الخاص بك وأنه تم تكوينه بشكل صحيح لبيئة النشر.';
      }
      setError(userMessage);
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadImage = (href, name) => {
    const a = document.createElement('a')
    a.href = href
    a.download = `smart-camera-${name}.jpg`
    a.click()
  }

  const handleImageInteraction = e => {
    if (e.detail === 1) {
      clickTimeout.current = setTimeout(() => {
        setActiveTab(prev => (prev === 'generated' ? 'original' : 'generated'))
      }, 200)
    } else if (e.detail === 2) {
      clearTimeout(clickTimeout.current)
      const imageUrl =
        activeTab === 'original'
          ? imageData.inputs[focusedId]
          : imageData.outputs[focusedId]
      const imageName = activeTab === 'original' ? 'original' : 'generated'
      downloadImage(imageUrl, imageName)
    }
  }

  const handleShare = async () => {
    const generatedImageUrl = imageData.outputs[focusedId]
    if (!navigator.share || !generatedImageUrl) {
      return
    }

    try {
      const response = await fetch(generatedImageUrl)
      const blob = await response.blob()
      const file = new File([blob], 'smart-camera-generated.jpg', {
        type: 'image/jpeg'
      })

      if (navigator.canShare && navigator.canShare({files: [file]})) {
        await navigator.share({
          title: 'Image generated by Smart Camera',
          text: 'Check out this image I edited!',
          files: [file]
        })
      } else {
        alert('لا يمكن مشاركة هذا النوع من الملفات.')
      }
    } catch (error) {
      console.error('خطأ أثناء المشاركة:', error)
      alert('حدث خطأ أثناء محاولة المشاركة.')
    }
  }

  if (!isConfigured) {
    return (
      <main>
        <div className="config-error-screen">
          <span className="icon">key_off</span>
          <h1>مفتاح الواجهة البرمجية (API Key) مفقود</h1>
          <p>
            لتشغيل هذا التطبيق، تحتاج إلى مفتاح API من Google AI Studio. يرجى
            إنشاء مفتاح وإضافته كمتغير بيئة باسم <code>API_KEY</code> في منصة
            النشر الخاصة بك.
          </p>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="button"
          >
            <span className="icon">open_in_new</span>
            الحصول على مفتاح API
          </a>
        </div>
      </main>
    );
  }

  return (
    <main>
      {error && (
        <div className="error-banner">
          <span className="icon">warning</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="close-error-btn">
            <span className="icon">close</span>
          </button>
        </div>
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{display: 'none'}}
        accept="image/*"
      />
      <div
        className="video"
        onClick={() => {
          setFocusedId(null)
        }}
      >
        {appMode === 'camera' && hasMultipleCameras && (
          <button
            onClick={switchCamera}
            className="switch-camera-overlay"
            aria-label="تبديل الكاميرا"
          >
            <span className="icon">flip_camera_ios</span>
          </button>
        )}
        {appMode === 'uploaded' && uploadedImage && (
          <img
            src={uploadedImage}
            alt="معاينة الصورة المرفوعة"
            className="video-preview"
          />
        )}
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          disablePictureInPicture="true"
          style={{
            transform: facingMode === 'user' ? 'rotateY(180deg)' : 'none',
            display: appMode === 'camera' ? 'block' : 'none'
          }}
        />
        {didJustSnap && <div className="flash" />}
        {appMode === 'idle' && (
          <div className="start-screen">
            <div className="start-content">
              <h1 className="start-title">
                Smart Camera
              </h1>
              <p className="start-description">
                حوّل صورك العادية إلى أعمال فنية مذهلة بلمسة زر.
              </p>
            </div>
            <div className="start-visuals">
              <div className="photo-showcase">
                <div className="photo-card original-photo"></div>
                <div className="photo-card generated-photo"></div>
              </div>
            </div>
            <div className="start-actions">
              <button
                className="button"
                onClick={() => startCamera(facingMode)}
              >
                <span className="icon">videocam</span> استخدم الكاميرا
              </button>
              <button
                className="button"
                onClick={() => fileInputRef.current.click()}
              >
                <span className="icon">upload</span> تحميل صورة
              </button>
            </div>
          </div>
        )}

        {focusedId && (
          <div className="focusedPhoto" onClick={e => e.stopPropagation()}>
            <button className="circleBtn" onClick={() => setFocusedId(null)}>
              <span className="icon">close</span>
            </button>
            {navigator.share && (
              <button
                className="circleBtn shareBtn"
                onClick={handleShare}
                title="مشاركة"
              >
                <span className="icon">share</span>
              </button>
            )}
            <div className="focusedPhoto-content">
              <div className="image-display-container">
                <div className="tab-content">
                  <span className="image-badge">
                    {activeTab === 'generated' ? 'المولدة' : 'الأصلية'}
                  </span>
                  <img
                    src={
                      activeTab === 'original'
                        ? imageData.inputs[focusedId]
                        : imageData.outputs[focusedId]
                    }
                    alt={
                      activeTab === 'original'
                        ? 'الصورة الأصلية'
                        : 'الصورة المولدة'
                    }
                    draggable={false}
                    onClick={handleImageInteraction}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {appMode !== 'idle' && (
        <div className="controls-panel">
          <div className="shutter-controls">
            <button
              className="switch-camera-button upload-button"
              aria-label="تحميل صورة"
              onClick={() => fileInputRef.current.click()}
            >
              <span className="icon">upload</span>
            </button>
            <button
              onClick={handleGenerate}
              className="shutter"
              disabled={isShutterDisabled}
              aria-label={appMode === 'camera' ? 'التقاط صورة' : 'توليد صورة'}
            >
              <span className={c('icon', {'is-loading': isGenerating})}>
                {isGenerating
                  ? 'progress_activity'
                  : appMode === 'camera'
                    ? 'camera'
                    : 'auto_fix'}
              </span>
            </button>
          </div>
          <div className="prompt-container">
            <textarea
              placeholder="اكتب طلبك هنا..."
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              aria-label="طلب توليد الصورة"
            />
          </div>
          {promptHistory.length > 0 && (
            <div className="prompt-history">
              <ul>
                {promptHistory.map(item => (
                  <li key={item.id}>
                    <button
                      className="prompt-chip"
                      onClick={() => {
                        setCustomPrompt(item.prompt)
                      }}
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
