/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {useRef, useState, useEffect} from 'react'
import c from 'clsx'
import {
  snapPhoto,
  setCustomPrompt,
  initApp,
  regeneratePhoto,
  deletePhoto,
  loadPhotoData,
  addPromptToHistory,
  updatePromptInHistory,
  deletePromptFromHistory,
  restorePrompts
} from '../lib/actions'
import useStore from '../lib/store'
import imageData from '../lib/imageData'

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')

function InfoModal({isOpen, onClose, title, children}) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="close-button">
            <span className="icon">close</span>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button onClick={onClose} className="confirm-btn">
            حسنًا
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmText = 'تأكيد',
  confirmClass = 'confirm-btn'
}) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="close-button">
            <span className="icon">close</span>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button onClick={onClose}>إلغاء</button>
          <button onClick={onConfirm} className={confirmClass}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

function PromptManagerModal({isOpen, onClose}) {
  const promptHistory = useStore(state => state.promptHistory)
  const fileInputRef = useRef(null)

  const [editingId, setEditingId] = useState(null)
  const [editedPrompt, setEditedPrompt] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [promptToDelete, setPromptToDelete] = useState(null)

  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false)
  const [promptsToRestore, setPromptsToRestore] = useState(null)
  const [restoreConfirmMessage, setRestoreConfirmMessage] = useState('')

  const [infoModalContent, setInfoModalContent] = useState({
    isOpen: false,
    title: '',
    message: ''
  })

  useEffect(() => {
    if (!isOpen) {
      setEditingId(null)
      setNewPrompt('')
      setIsAdding(false)
      setIsDeleteConfirmOpen(false)
      setPromptToDelete(null)
      setIsRestoreConfirmOpen(false)
      setPromptsToRestore(null)
    }
  }, [isOpen])

  const showInfoModal = (title, message) => {
    setInfoModalContent({isOpen: true, title, message})
  }

  const handleEdit = prompt => {
    setEditingId(prompt.id)
    setEditedPrompt(prompt.prompt)
  }

  const handleSaveEdit = () => {
    if (editedPrompt.trim()) {
      updatePromptInHistory(editingId, editedPrompt.trim())
    }
    setEditingId(null)
  }

  const handleDeleteRequest = id => {
    setPromptToDelete(id)
    setIsDeleteConfirmOpen(true)
  }

  const handleConfirmPromptDelete = () => {
    if (promptToDelete) {
      deletePromptFromHistory(promptToDelete)
    }
    setIsDeleteConfirmOpen(false)
    setPromptToDelete(null)
  }

  const handleUsePrompt = prompt => {
    setCustomPrompt(prompt)
    onClose()
  }

  const handleAddNewPrompt = async () => {
    if (newPrompt.trim()) {
      setIsAdding(true)
      const success = await addPromptToHistory(newPrompt.trim())
      setIsAdding(false)
      if (success) {
        setNewPrompt('')
      } else {
        showInfoModal(
          'فشل إنشاء العنوان',
          'تعذر إنشاء عنوان للوصف. يرجى المحاولة مرة أخرى.'
        )
      }
    }
  }

  const handleBackup = () => {
    if (promptHistory.length === 0) {
      showInfoModal(
        'لا توجد أوصاف',
        'مكتبة الأوصاف فارغة. أضف بعض الأوصاف أولاً لإنشاء نسخة احتياطية.'
      )
      return
    }
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(promptHistory, null, 2)
    )}`
    const link = document.createElement('a')
    link.href = jsonString
    link.download = 'smart-camera-prompts-backup.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleRestoreClick = () => {
    fileInputRef.current.click()
  }

  const handleFileChange = async event => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const parsedData = JSON.parse(e.target.result)

        if (!Array.isArray(parsedData)) {
          throw new Error(
            'ملف النسخ الاحتياطي غير صالح. يجب أن يحتوي على قائمة من الأوصاف.'
          )
        }

        const validPrompts = parsedData.filter(
          p => p && typeof p === 'object' && p.id && p.prompt
        )

        if (validPrompts.length === 0) {
          showInfoModal(
            'لا توجد أوصاف صالحة',
            'لم يتم العثور على أوصاف صالحة في ملف النسخ الاحتياطي.'
          )
          return
        }

        const totalPromptsInFile = parsedData.length
        const restoredCount = validPrompts.length
        let confirmationMessage

        if (restoredCount < totalPromptsInFile) {
          confirmationMessage = `تم العثور على ${restoredCount} وصفًا صالحًا من إجمالي ${totalPromptsInFile} في الملف. سيتم تجاهل الأوصاف غير الصالحة. هل تريد المتابعة واستبدال مكتبتك الحالية؟`
        } else {
          confirmationMessage = `تم العثور على ${restoredCount} وصفًا. هل تريد استبدال جميع الأوصاف المحفوظة الحالية بتلك الموجودة في هذا الملف؟ لا يمكن التراجع عن هذا الإجراء.`
        }

        setPromptsToRestore(validPrompts)
        setRestoreConfirmMessage(confirmationMessage)
        setIsRestoreConfirmOpen(true)
      } catch (error) {
        console.error('Failed to restore prompts:', error)
        showInfoModal(
          'فشل الاستعادة',
          `فشل في استعادة الأوصاف. يرجى التأكد من أن الملف هو ملف نسخ احتياطي صالح. الخطأ: ${error.message}`
        )
      }
    }
    reader.readAsText(file)
    event.target.value = null
  }

  const handleConfirmRestore = async () => {
    if (promptsToRestore) {
      await restorePrompts(promptsToRestore)
      showInfoModal(
        'نجاح',
        `تم استعادة ${promptsToRestore.length} وصفًا بنجاح!`
      )
    }
    setIsRestoreConfirmOpen(false)
    setPromptsToRestore(null)
    setRestoreConfirmMessage('')
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>مكتبة الأوصاف</h2>
          <button onClick={onClose} className="close-button">
            <span className="icon">close</span>
          </button>
        </div>
        <div className="modal-body">
          <div className="add-prompt-section">
            <textarea
              placeholder="إضافة وصف جديد..."
              value={newPrompt}
              onChange={e => setNewPrompt(e.target.value)}
            />
            <button
              onClick={handleAddNewPrompt}
              disabled={isAdding || !newPrompt.trim()}
            >
              <span className={c('icon', {'is-loading': isAdding})}>
                {isAdding ? 'progress_activity' : 'add'}
              </span>
              {isAdding ? 'جاري الحفظ...' : 'حفظ الوصف'}
            </button>
          </div>
          <ul className="prompt-list">
            {promptHistory.length > 0 ? (
              promptHistory.map(p => (
                <li key={p.id}>
                  {editingId === p.id ? (
                    <div className="prompt-edit-view">
                      <textarea
                        value={editedPrompt}
                        onChange={e => setEditedPrompt(e.target.value)}
                      />
                      <div className="prompt-item-actions">
                        <button onClick={handleSaveEdit}>حفظ</button>
                        <button onClick={() => setEditingId(null)}>إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <div className="prompt-display-view">
                      <div className="prompt-info">
                        <strong>{p.title}</strong>
                        <p>{p.prompt}</p>
                      </div>
                      <div className="prompt-item-actions">
                        <button onClick={() => handleUsePrompt(p.prompt)}>
                          استخدام
                        </button>
                        <button onClick={() => handleEdit(p)}>
                          <span className="icon">edit</span>
                        </button>
                        <button onClick={() => handleDeleteRequest(p.id)}>
                          <span className="icon">delete</span>
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))
            ) : (
              <p className="empty-prompt-list">
                لا توجد أوصاف محفوظة. أضف وصفاً جديداً للبدء.
              </p>
            )}
          </ul>
        </div>
        <div className="modal-footer">
          <button onClick={handleBackup}>
            <span className="icon">download</span>
            نسخ احتياطي للأوصاف
          </button>
          <button onClick={handleRestoreClick}>
            <span className="icon">upload</span>
            استعادة الأوصاف
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{display: 'none'}}
            accept="application/json,.json"
          />
        </div>
      </div>

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleConfirmPromptDelete}
        title="تأكيد حذف الوصف"
        confirmText="نعم، حذف"
        confirmClass="confirm-delete-btn"
      >
        <p>
          هل أنت متأكد من أنك تريد حذف هذا الوصف نهائياً؟ لا يمكن التراجع عن
          هذا الإجراء.
        </p>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={isRestoreConfirmOpen}
        onClose={() => setIsRestoreConfirmOpen(false)}
        onConfirm={handleConfirmRestore}
        title="تأكيد استعادة الأوصاف"
        confirmText="نعم، استبدال"
      >
        <p>{restoreConfirmMessage}</p>
      </ConfirmationModal>

      <InfoModal
        isOpen={infoModalContent.isOpen}
        onClose={() =>
          setInfoModalContent({isOpen: false, title: '', message: ''})
        }
        title={infoModalContent.title}
      >
        <p>{infoModalContent.message}</p>
      </InfoModal>
    </div>
  )
}

function SettingsModal({isOpen, onClose}) {
  const modelProvider = useStore(state => state.modelProvider)
  const setModelProvider = provider =>
    useStore.setState({modelProvider: provider})
  const huggingFaceApiKey = useStore(state => state.huggingFaceApiKey)
  const setHuggingFaceApiKey = key =>
    useStore.setState({huggingFaceApiKey: key})

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>الإعدادات</h2>
          <button onClick={onClose} className="close-button">
            <span className="icon">close</span>
          </button>
        </div>
        <div className="modal-body">
          <div className="settings-group">
            <div className="settings-item">
              <label htmlFor="provider-select">مزود النموذج:</label>
              <select
                id="provider-select"
                value={modelProvider}
                onChange={e => setModelProvider(e.target.value)}
              >
                <option value="gemini">Gemini</option>
                <option value="huggingface">Hugging Face</option>
              </select>
            </div>
            {modelProvider === 'huggingface' && (
              <>
                <div className="settings-item">
                  <label htmlFor="hf-api-key">مفتاح Hugging Face API:</label>
                  <input
                    id="hf-api-key"
                    type="password"
                    value={huggingFaceApiKey}
                    onChange={e => setHuggingFaceApiKey(e.target.value)}
                    placeholder="يبدأ بـ 'hf_...'"
                  />
                </div>
                <div className="api-key-helper">
                  <a
                    href="https://huggingface.co/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    احصل على مفتاح API الخاص بك من هنا
                    <span className="icon">open_in_new</span>
                  </a>
                </div>
                <p className="provider-note">
                  ملاحظة: يتجاهل نموذج Hugging Face الصورة المُدخلة حاليًا
                  ويستخدم الوصف النصي فقط.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const customPrompt = useStore(state => state.customPrompt)
  const promptHistory = useStore(state => state.promptHistory)
  const imageIds = useStore(state => state.imageIds)
  const modelProvider = useStore(state => state.modelProvider)
  const huggingFaceApiKey = useStore(state => state.huggingFaceApiKey)

  const [appMode, setAppMode] = useState('idle') // idle, camera, uploaded
  const [uploadedImage, setUploadedImage] = useState({
    dataUrl: null,
    mimeType: null
  })
  const [focusedId, setFocusedId] = useState(null)
  const [activeTab, setActiveTab] = useState('generated')
  const [didJustSnap, setDidJustSnap] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [generationVersion, setGenerationVersion] = useState(0)
  const [error, setError] = useState(null)
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const clickTimeout = useRef(null)

  useEffect(() => {
    initApp()
  }, [])

  useEffect(() => {
    if (focusedId) {
      setActiveTab('generated')
    }
  }, [focusedId])

  useEffect(() => {
    const videoEl = videoRef.current

    const setupCamera = async () => {
      if (!videoEl) return

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: {ideal: 1920},
            height: {ideal: 1080},
            facingMode: {ideal: facingMode}
          },
          audio: false
        })
        videoEl.srcObject = stream

        if (!hasMultipleCameras) {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (devices.filter(d => d.kind === 'videoinput').length > 1) {
            setHasMultipleCameras(true)
          }
        }

        videoEl.onloadedmetadata = () => {
          const {videoWidth, videoHeight} = videoEl
          const squareSize = Math.min(videoWidth, videoHeight)
          canvas.width = squareSize
          canvas.height = squareSize
        }
      } catch (err) {
        console.error('Failed to start video', err)
        setError(
          'لم نتمكن من الوصول إلى الكاميرا. يرجى التحقق من الأذونات والمحاولة مرة أخرى.'
        )
        setAppMode('idle')
      }
    }

    if (appMode === 'camera') {
      setupCamera()
    }

    return () => {
      if (videoEl?.srcObject) {
        videoEl.srcObject.getTracks().forEach(track => track.stop())
        videoEl.srcObject = null
      }
    }
  }, [appMode, facingMode])

  const isShutterDisabled =
    !customPrompt.trim() ||
    isGenerating ||
    isRegenerating ||
    (modelProvider === 'huggingface' && !huggingFaceApiKey.trim())

  const switchCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newMode)
  }

  const handleFileSelect = e => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = e => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop())
      }
      setUploadedImage({dataUrl: e.target.result, mimeType: file.type})
      setAppMode('uploaded')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleGenerate = async () => {
    if (isShutterDisabled) return

    setIsGenerating(true)
    setError(null)
    setDidJustSnap(true)
    setTimeout(() => setDidJustSnap(false), 300)

    let b64, mimeType

    if (appMode === 'camera' && videoRef.current) {
      const video = videoRef.current
      const {videoWidth, videoHeight} = video
      const squareSize = Math.min(videoWidth, videoHeight)
      const sx = (videoWidth - squareSize) / 2
      const sy = (videoHeight - squareSize) / 2
      ctx.drawImage(
        video,
        sx,
        sy,
        squareSize,
        squareSize,
        0,
        0,
        squareSize,
        squareSize
      )
      b64 = canvas.toDataURL('image/jpeg')
      mimeType = 'image/jpeg'
    } else if (appMode === 'uploaded' && uploadedImage.dataUrl) {
      b64 = uploadedImage.dataUrl
      mimeType = uploadedImage.mimeType
    } else {
      console.warn('No image source available to generate.')
      setIsGenerating(false)
      return
    }

    try {
      const id = await snapPhoto(
        b64,
        mimeType,
        modelProvider,
        huggingFaceApiKey
      )
      setFocusedId(id)
    } catch (e) {
      console.error('Failed to generate photo', e)
      setError(e.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerate = async () => {
    if (!focusedId || isRegenerating) return
    setIsRegenerating(true)
    setError(null)
    try {
      await regeneratePhoto(focusedId)
      setGenerationVersion(v => v + 1)
    } catch (e) {
      console.error('Failed to regenerate photo', e)
      setError(e.message)
    } finally {
      setIsRegenerating(false)
    }
  }

  const openDeleteConfirmation = () => {
    setIsDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!focusedId) return
    const currentId = focusedId
    const currentIndex = imageIds.indexOf(currentId)
    const nextIndex =
      imageIds.length > 1 ? (currentIndex + 1) % imageIds.length : -1

    if (nextIndex !== -1 && nextIndex !== currentIndex) {
      setFocusedId(imageIds[nextIndex])
    } else {
      setFocusedId(null)
    }

    await deletePhoto(currentId)
    setIsDeleteConfirmOpen(false)
  }

  const navigatePhotos = direction => {
    if (!focusedId) return
    const currentIndex = imageIds.indexOf(focusedId)
    const newIndex =
      (currentIndex + direction + imageIds.length) % imageIds.length
    setFocusedId(imageIds[newIndex])
  }

  const handleImageClick = e => {
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current)
      clickTimeout.current = null
      setActiveTab(activeTab === 'original' ? 'generated' : 'original')
    } else {
      clickTimeout.current = setTimeout(() => {
        clickTimeout.current = null
        // Single click action (if any)
      }, 250)
    }
  }

  const downloadImage = () => {
    if (!focusedId) return
    const dataUrl = imageData.outputs[focusedId]
    if (dataUrl) {
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `smart-camera-${focusedId}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const focusedPhoto = focusedId ? imageData.outputs[focusedId] : null
  const originalPhoto = focusedId ? imageData.inputs[focusedId] : null

  useEffect(() => {
    if (focusedId) {
      loadPhotoData(focusedId)
    }
  }, [focusedId])

  if (!process.env.API_KEY) {
    return (
      <main>
        <div className="config-error-screen">
          <span className="icon">emergency</span>
          <h1>تهيئة مطلوبة</h1>
          <p>
            مفتاح Gemini API غير مهيأ. يرجى تهيئة{' '}
            <code>process.env.API_KEY</code> في ملف <code>.env</code>.
          </p>
          <a
            href="https://ai.google.dev/gemini-api/docs/api-key"
            target="_blank"
            rel="noopener noreferrer"
            className="button"
          >
            احصل على مفتاح API
          </a>
        </div>
      </main>
    )
  }

  return (
    <main>
      {error && (
        <div className="error-banner">
          <span className="icon">error</span>
          {error}
          <button onClick={() => setError(null)} className="close-error-btn">
            <span className="icon">close</span>
          </button>
        </div>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <PromptManagerModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
      />

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="تأكيد حذف الصورة"
        confirmText="نعم، حذف"
        confirmClass="confirm-delete-btn"
      >
        <p>هل أنت متأكد من أنك تريد حذف هذه الصورة نهائياً؟</p>
      </ConfirmationModal>

      <div className="video">
        {didJustSnap && <div className="flash" />}

        {appMode === 'idle' && (
          <div className="start-screen">
            <div className="start-content">
              <h1 className="start-title">
                الكاميرا الذكية
                <span className="icon">auto_awesome</span>
              </h1>
              <p className="start-description">
                جرّب تأثيرات الصور الاحترافية باستخدام كاميرا الويب أو عن طريق
                تحميل صورة.
              </p>
            </div>
            <div className="start-visuals">
              <div className="photo-showcase">
                <div className="photo-card original-photo" />
                <div className="photo-card generated-photo" />
              </div>
            </div>
            <div className="start-actions">
              <button
                className="button"
                onClick={() => {
                  setAppMode('camera')
                  setUploadedImage({dataUrl: null, mimeType: null})
                }}
              >
                <span className="icon">photo_camera</span>
                فتح الكاميرا
              </button>
              <button
                className="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="icon">upload_file</span>
                تحميل صورة
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{display: 'none'}}
                accept="image/*"
              />
            </div>
          </div>
        )}

        {appMode === 'camera' && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'}}
          />
        )}

        {appMode === 'uploaded' && uploadedImage.dataUrl && (
          <img
            src={uploadedImage.dataUrl}
            alt="Preview"
            className="video-preview"
          />
        )}

        {isGenerating && (
          <div className="processing-overlay">
            <div className="processing-animation">
              <div className="scan-line"></div>
            </div>
            <p>...جاري إنشاء الصورة</p>
          </div>
        )}

        {focusedId && (
          <>
            <div className="focusedPhoto">
              <div className="focusedPhoto-content">
                <div className="image-display-container">
                  <div className="tab-content" onClick={handleImageClick}>
                    {activeTab === 'original' && originalPhoto && (
                      <>
                        <img src={originalPhoto} alt="Original" />
                        <span className="image-badge">الأصلية</span>
                      </>
                    )}
                    {activeTab === 'generated' && focusedPhoto && (
                      <>
                        <img
                          key={generationVersion}
                          src={focusedPhoto}
                          alt="Generated"
                        />
                        <span className="image-badge">المُنشأة</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="focused-actions">
                  <button
                    className="button back-button"
                    onClick={() => setFocusedId(null)}
                  >
                    <span className="icon">arrow_back</span>
                    عودة
                  </button>
                  <button
                    className="button"
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                  >
                    <span
                      className={c('icon', {'is-loading': isRegenerating})}
                    >
                      {isRegenerating ? 'progress_activity' : 'refresh'}
                    </span>
                    إعادة إنشاء
                  </button>
                  <button
                    className="button download-button"
                    onClick={downloadImage}
                  >
                    <span className="icon">download</span>
                    تنزيل
                  </button>
                  <button
                    className="button delete-button"
                    onClick={openDeleteConfirmation}
                  >
                    <span className="icon">delete</span>
                    حذف
                  </button>
                </div>
              </div>
            </div>
            {imageIds.length > 1 && (
              <>
                <button
                  className="navBtn prevBtn"
                  onClick={() => navigatePhotos(-1)}
                  aria-label="Previous"
                >
                  <span className="icon">arrow_back_ios</span>
                </button>
                <button
                  className="navBtn nextBtn"
                  onClick={() => navigatePhotos(1)}
                  aria-label="Next"
                >
                  <span className="icon">arrow_forward_ios</span>
                </button>
              </>
            )}
          </>
        )}
      </div>

      {(appMode === 'camera' || appMode === 'uploaded') && (
        <div className="controls-panel">
          <div className="prompt-container">
            <button
              className="manage-prompts-btn"
              onClick={() => setIsPromptModalOpen(true)}
              aria-label="إدارة الأوصاف"
            >
              <span className="icon">history</span>
            </button>
            <textarea
              placeholder="اكتب وصفاً..."
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              rows="3"
            />
            <button
              className="manage-prompts-btn"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="الإعدادات"
            >
              <span className="icon">settings</span>
            </button>
          </div>
          <div className="shutter-controls">
            <div className="gallery-preview">
              {/* Future gallery preview */}
            </div>
            <button
              className="shutter"
              onClick={handleGenerate}
              disabled={isShutterDisabled}
            >
              <span className={c('icon', {'is-loading': isGenerating})}>
                {isGenerating ? 'progress_activity' : 'auto_awesome'}
              </span>
            </button>
            <div className="camera-controls">
              {appMode === 'camera' && hasMultipleCameras && (
                <button
                  className="switch-camera-button"
                  onClick={switchCamera}
                  aria-label="تبديل الكاميرا"
                >
                  <span className="icon">cameraswitch</span>
                </button>
              )}
            </div>
          </div>
          <div className="prompt-history">
            <ul>
              {promptHistory.slice(0, 5).map(p => (
                <li
                  key={p.id}
                  className="prompt-chip"
                  onClick={() => setCustomPrompt(p.prompt)}
                >
                  {p.title}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {appMode === 'idle' && imageIds.length > 0 && (
        <button
          className="force-camera-btn"
          onClick={() => {
            setFocusedId(imageIds[0])
          }}
        >
          <span className="icon">photo_library</span>
        </button>
      )}

      {appMode !== 'idle' && !focusedId && (
        <button
          className="force-camera-btn"
          onClick={() => {
            if (videoRef.current?.srcObject) {
              videoRef.current.srcObject
                .getTracks()
                .forEach(track => track.stop())
            }
            setAppMode('idle')
            setUploadedImage({dataUrl: null, mimeType: null})
          }}
        >
          <span className="icon">home</span>
        </button>
      )}
    </main>
  )
}
