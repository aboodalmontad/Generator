/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {useRef, useState, useEffect} from 'react'
import c from 'clsx'
import {
  snapPhoto,
  deletePhoto,
  makeGif,
  hideGif,
  setCustomPrompt
} from '../lib/actions'
import useStore from '../lib/store'
import imageData from '../lib/imageData'
import modes from '../lib/modes'

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')

export default function App() {
  const photos = useStore.use.photos()
  const customPrompt = useStore.use.customPrompt()
  const promptHistory = useStore.use.promptHistory()
  const gifInProgress = useStore.use.gifInProgress()
  const gifUrl = useStore.use.gifUrl()
  const [videoActive, setVideoActive] = useState(false)
  const [didInitVideo, setDidInitVideo] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const [didJustSnap, setDidJustSnap] = useState(false)
  const [facingMode, setFacingMode] = useState('user')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const dummyFile = new File(['dummy'], 'dummy.jpg', {type: 'image/jpeg'})
    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({files: [dummyFile]})
    ) {
      setCanShare(true)
    }
  }, [])

  const startVideo = async mode => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop())
    }

    setDidInitVideo(true)

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
      setVideoActive(true)

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
      setVideoActive(false)
      setDidInitVideo(false)
    }
  }

  const switchCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newMode)
    startVideo(newMode)
  }

  const takePhoto = () => {
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
    snapPhoto(canvas.toDataURL('image/jpeg'))
    setDidJustSnap(true)
    setTimeout(() => setDidJustSnap(false), 1000)
  }

  const handleFileSelect = e => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = e => {
      snapPhoto(e.target.result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const downloadImage = () => {
    const a = document.createElement('a')
    a.href = gifUrl || imageData.outputs[focusedId]
    a.download = `fotographer.${gifUrl ? 'gif' : 'jpg'}`
    a.click()
  }

  const shareImage = async () => {
    const imageUrl = gifUrl || imageData.outputs[focusedId]
    if (!imageUrl) return

    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const extension = gifUrl ? 'gif' : 'jpg'
      const file = new File([blob], `fotographer-image.${extension}`, {
        type: blob.type
      })

      await navigator.share({
        title: 'صنعت بواسطة فوتوغرفر!',
        text: 'شوف هالصورة اللي عملتها باستخدام Gemini و فوتوغرفر.',
        files: [file]
      })
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error sharing the image:', err)
      }
    }
  }

  return (
    <main>
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
          hideGif()
          setFocusedId(null)
        }}
      >
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          disablePictureInPicture="true"
          style={{transform: facingMode === 'user' ? 'rotateY(180deg)' : 'none'}}
        />
        {didJustSnap && <div className="flash" />}
        {!videoActive && (
          <div className="startButton">
            <h1>📸 فوتوغرفر</h1>
            <p>
              {didInitVideo
                ? 'لحظة...'
                : 'ابدأ باستخدام الكاميرا أو حمّل صورة.'}
            </p>
            <div className="start-actions">
              <button className="button" onClick={() => startVideo(facingMode)}>
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

        {videoActive && (
          <div className="videoControls">
            <div className="shutter-controls">
              <button
                className="switch-camera-button upload-button"
                aria-label="تحميل صورة"
                onClick={() => fileInputRef.current.click()}
              >
                <span className="icon">upload</span>
              </button>
              <button onClick={takePhoto} className="shutter">
                <span className="icon">camera</span>
              </button>
              {hasMultipleCameras && (
                <button
                  onClick={switchCamera}
                  className="switch-camera-button"
                  aria-label="تبديل الكاميرا"
                >
                  <span className="icon">flip_camera_ios</span>
                </button>
              )}
            </div>
          </div>
        )}

        {(focusedId || gifUrl) && (
          <div className="focusedPhoto" onClick={e => e.stopPropagation()}>
            <button
              className="circleBtn"
              onClick={() => {
                hideGif()
                setFocusedId(null)
              }}
            >
              <span className="icon">close</span>
            </button>
            <img
              src={gifUrl || imageData.outputs[focusedId]}
              alt="photo"
              draggable={false}
            />
            <div className="focusedPhoto-actions">
              <button className="button" onClick={downloadImage}>
                <span className="icon">download</span> تنزيل
              </button>
              {canShare && (
                <button className="button share-button" onClick={shareImage}>
                  <span className="icon">share</span> مشاركة
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {videoActive && (
        <>
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
                      onClick={() => setCustomPrompt(item.prompt)}
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="results">
        <ul>
          {photos.length
            ? photos.map(({id, mode, isBusy}) => (
                <li className={c({isBusy})} key={id}>
                  <button
                    className="circleBtn deleteBtn"
                    onClick={() => {
                      deletePhoto(id)
                      if (focusedId === id) {
                        setFocusedId(null)
                      }
                    }}
                  >
                    <span className="icon">delete</span>
                  </button>
                  <button
                    className="photo"
                    onClick={() => {
                      if (!isBusy) {
                        setFocusedId(id)
                        hideGif()
                      }
                    }}
                  >
                    <img
                      src={
                        isBusy ? imageData.inputs[id] : imageData.outputs[id]
                      }
                      draggable={false}
                    />
                    <p className="emoji">
                      {mode === 'custom' ? '✏️' : modes[mode].emoji}
                    </p>
                  </button>
                </li>
              ))
            : videoActive && (
                <li className="empty" key="empty">
                  <p>
                    <span className="icon">camera</span> 👈
                  </p>
                  صوّر صورة لتبدأ.
                </li>
              )}
        </ul>
        {photos.filter(p => !p.isBusy).length > 0 && (
          <button
            className="button makeGif"
            onClick={makeGif}
            disabled={gifInProgress}
          >
            {gifInProgress ? 'لحظة...' : 'اصنع صورة متحركة!'}
          </button>
        )}
      </div>
    </main>
  )
}