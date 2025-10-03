/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {useRef, useState, useCallback, useEffect} from 'react'
import c from 'clsx'
import {
  snapPhoto,
  setMode,
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
const modeKeys = Object.keys(modes)

export default function App() {
  const photos = useStore.use.photos()
  const customPrompt = useStore.use.customPrompt()
  const activeMode = useStore.use.activeMode()
  const gifInProgress = useStore.use.gifInProgress()
  const gifUrl = useStore.use.gifUrl()
  const [videoActive, setVideoActive] = useState(false)
  const [didInitVideo, setDidInitVideo] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const [didJustSnap, setDidJustSnap] = useState(false)
  const [hoveredMode, setHoveredMode] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({top: 0, left: 0})
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [facingMode, setFacingMode] = useState('user')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const videoRef = useRef(null)

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

  const downloadImage = () => {
    const a = document.createElement('a')
    a.href = gifUrl || imageData.outputs[focusedId]
    a.download = `gembooth.${gifUrl ? 'gif' : 'jpg'}`
    a.click()
  }

  const shareImage = async () => {
    const imageUrl = gifUrl || imageData.outputs[focusedId]
    if (!imageUrl) return

    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const extension = gifUrl ? 'gif' : 'jpg'
      const file = new File([blob], `gembooth-image.${extension}`, {
        type: blob.type
      })

      await navigator.share({
        title: 'Made with GemBooth!',
        text: 'Check out this photo I made using Gemini and GemBooth.',
        files: [file]
      })
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error sharing the image:', err)
      }
    }
  }

  const handleModeHover = useCallback((modeInfo, event) => {
    if (!modeInfo) {
      setHoveredMode(null)
      return
    }

    setHoveredMode(modeInfo)

    const rect = event.currentTarget.getBoundingClientRect()
    const tooltipTop = rect.top
    const tooltipLeft = rect.left + rect.width / 2

    setTooltipPosition({
      top: tooltipTop,
      left: tooltipLeft
    })
  }, [])

  return (
    <main>
      <div
        className="video"
        onClick={() => {
          hideGif()
          setFocusedId(null)
        }}
      >
        {showCustomPrompt && (
          <div className="customPrompt">
            <button
              className="circleBtn"
              onClick={() => {
                setShowCustomPrompt(false)

                if (customPrompt.trim().length === 0) {
                  setMode(modeKeys[0])
                }
              }}
            >
              <span className="icon">close</span>
            </button>
            <textarea
              type="text"
              placeholder="Enter a custom prompt"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setShowCustomPrompt(false)
                }
              }}
            />
          </div>
        )}
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
          <button className="startButton" onClick={() => startVideo(facingMode)}>
            <h1>📸 GemBooth</h1>
            <p>{didInitVideo ? 'One sec…' : 'Tap anywhere to start webcam'}</p>
          </button>
        )}

        {videoActive && (
          <div className="videoControls">
            <div className="shutter-controls">
              <button onClick={takePhoto} className="shutter">
                <span className="icon">camera</span>
              </button>
              {hasMultipleCameras && (
                <button
                  onClick={switchCamera}
                  className="switch-camera-button"
                  aria-label="Switch camera"
                >
                  <span className="icon">flip_camera_ios</span>
                </button>
              )}
            </div>
            <ul className="modeSelector">
              <li
                key="custom"
                onMouseEnter={e =>
                  handleModeHover({key: 'custom', prompt: customPrompt}, e)
                }
                onMouseLeave={() => handleModeHover(null)}
              >
                <button
                  className={c({active: activeMode === 'custom'})}
                  onClick={() => {
                    setMode('custom')
                    setShowCustomPrompt(true)
                  }}
                >
                  <span>✏️</span> <p>Custom</p>
                </button>
              </li>
              {Object.entries(modes).map(([key, {name, emoji, prompt}]) => (
                <li
                  key={key}
                  onMouseEnter={e => handleModeHover({key, prompt}, e)}
                  onMouseLeave={() => handleModeHover(null)}
                >
                  <button
                    onClick={() => setMode(key)}
                    className={c({active: key === activeMode})}
                  >
                    <span>{emoji}</span> <p>{name}</p>
                  </button>
                </li>
              ))}
            </ul>
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
                <span className="icon">download</span> Download
              </button>
              {canShare && (
                <button className="button share-button" onClick={shareImage}>
                  <span className="icon">share</span> Share
                </button>
              )}
            </div>
          </div>
        )}
      </div>

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
                    👉 <span className="icon">camera</span>
                  </p>
                  Snap a photo to get started.
                </li>
              )}
        </ul>
        {photos.filter(p => !p.isBusy).length > 0 && (
          <button
            className="button makeGif"
            onClick={makeGif}
            disabled={gifInProgress}
          >
            {gifInProgress ? 'One sec…' : 'Make GIF!'}
          </button>
        )}
      </div>

      {hoveredMode && (
        <div
          className={c('tooltip', {isFirst: hoveredMode.key === 'custom'})}
          role="tooltip"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translateX(-50%)'
          }}
        >
          {hoveredMode.key === 'custom' && !hoveredMode.prompt.length ? (
            <p>Click to set a custom prompt</p>
          ) : (
            <>
              <p>"{hoveredMode.prompt}"</p>
              <h4>Prompt</h4>
            </>
          )}
        </div>
      )}
    </main>
  )
}