import React, { useState, useRef, useEffect, useContext } from "react"
import { ipcRenderer } from 'electron'
import RtcEngineContext, { IAppContext } from "../../context/rtcEngineContext"
import styles from './livePreview.scss'
import { getResourcePath } from '../../utils/index'
import { DownOutlined,UpOutlined } from '@ant-design/icons'
import { message, Dropdown, Menu } from 'antd'
import CameraModal from '../CameraModal'
import VirtualBackgroundModal from '../VirtualBackgroundModal'
import CaptureWinModal from '../CaptureWinModal'
import SelectBox from '../SelectBox/index'
import Config from '../../config/agora.config'
import { 
  CameraCapturerConfiguration,
  VideoSourceType,
  VideoMirrorModeType, 
  RenderModeType,
  TranscodingVideoStream,
  IMediaPlayer,
  IMediaPlayerSourceObserver,
  MediaPlayerState,
  MediaPlayerError,
  ScreenCaptureSourceType
} from 'agora-electron-sdk'


const optConfig = [
  {
    id: 'camera',
    title: '摄像头',
    imgUrl: getResourcePath('camera.png')
  },
  {
    id: 'capture',
    title: '窗口捕捉',
    imgUrl: getResourcePath('capture.png')
  },
  {
    id: 'media',
    title: '多媒体',
    imgUrl: getResourcePath('media.png')
  },
  {
    id: 'virtual',
    title: '虚拟背景',
    imgUrl: getResourcePath('virtual.png')
  }
]
interface IDeviceCapacity {
  width: number,
  height: number,
  fps: number,
  modifyFps: number
}

interface IDevice {
  deviceId: string,
  deviceName: string
  capacity: IDeviceCapacity[]
}

interface IScreenInfo {
  isDisplay: boolean,
  windowId: number,
  width: number,
  heigth: number,
  title: string
}

const LivePreview: React.FC = () => {
  console.log('----render LivePreview')
  const [isHorizontal, setIsHorizontal] = useState(true)
  const isHorizontalRef = useRef(true)
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false)
  const [isVirtualBgModalOpen, setVirtualBgModalOpen] = useState(false)
  const [isCapWinModalOpen,setCapWinModalOpen] = useState(false)
  const [capWindowSources, setCapWindowSources] = useState<any>([])
  const [enableGreenScreen, setEnableGreenScreen] = useState(false)
  const [devices, setDevices] = useState<IDevice[]>([])
  const [deviceIndex, setDeviceIndex] = useState(0)
  const [capacityIndex, setCapacityIndex] = useState(0)
  const [isCaptureMenuOpen, setCaptureMenuOpen] = useState(false)
  const [isMediaMenuOpen, setMediaMenuOpen] = useState(false)
  const [isPreview, setPreview] = useState(false)
  const [checkIndex, setCheckIndex] = useState(-1)
  const videoRef = useRef<HTMLDivElement>(null)
  const mediaPlayer = useRef<IMediaPlayer | null>(null)
  const zoom = useRef(1)
  const sources = useRef<TranscodingVideoStream[]>([])
  const {rtcEngine, isAppIdExist, appId} = useContext(RtcEngineContext) as IAppContext
  const init_width = 300, init_height = 300
  const max_width = 1280, max_height = 720
  const [boxRect, setBoxRect] = useState({
    containerId: 'canvas-mask',
    top: 0,
    left: 0,
    width: init_width,
    height: init_height
  })
  useEffect(() => {
    if (isAppIdExist && appId.length > 0) {
      console.log('------Agora Engine init success')
      setDeviceIndex(0)
      setCapacityIndex(0)
      enumerateDevices()
      createMediaPlayer()
    }
  },[isAppIdExist, appId])

  useEffect(() => {
    registerIpcRenderEvent()
    window.addEventListener('mousedown', handleMouseDown)
    return () => {
      sources.current = []
      window.removeEventListener('mousedown', handleMouseDown)
    }
  },[])

  useEffect(() => {
    if (isPreview) {
      console.log('-------updateCanvasConfig preview is true')
      setTimeout(() => {
        updateCanvasConfig()
      }, 500);
    }
  },[isPreview])

  useEffect(() => {
    isHorizontalRef.current = isHorizontal
    console.log('layout is change isHorizontal: ',isHorizontalRef.current)
    handleStopPreview()
  }, [isHorizontal])

  const updateCanvasConfig = () => {
    console.log('----videoRef: ',videoRef.current)
    const canvas:any = videoRef.current?.querySelector('canvas')
    console.log('---canvas: ',canvas)
    zoom.current = Number.parseFloat(canvas?.style.zoom || '1');
    console.log('------zoom: ',zoom)
    const parentDom = videoRef.current?.querySelector('div')
    let width,height
    if (isHorizontalRef.current) {
      width = Math.floor(max_width*zoom.current)
      height = Math.floor(max_height*zoom.current)
    } else {
      width = Math.floor(max_height*zoom.current)
      height = Math.floor(max_width*zoom.current)
    }
    if (parentDom) {
      createCanvasMask(parentDom, width, height)
    }
  }

  const createCanvasMask = (parentDom: HTMLDivElement,width: number,height: number) => {
    const mask = document.getElementById('canvas-mask')
    if (mask) {
      //mask.removeEventListener('mousedown', handleMouseDown)
      parentDom.removeChild(mask)
    }
    console.log('----createCanvasMask width, height, parent: ',width,height,parentDom)
    const dom = document.createElement('div')
    dom.id = 'canvas-mask'
    dom.style.position = 'absolute'
    dom.style.width = width.toString()+'px'
    dom.style.height = height.toString() + 'px'
    //dom.style.pointerEvents = 'none'

    //添加mousedown事件
    //dom.addEventListener('mousedown', handleMouseDown)
    parentDom.insertBefore(dom, parentDom.firstChild)
    console.log('mask rect: ',dom.getBoundingClientRect())
  }

  const handleMouseDown = (e) => {
    console.log('----handleMouseDown offsetX: ','e.offsetY:', e.offsetY)
    console.log('-------handleMouseDown id: ',e.target.id)
    if (e.target.id === 'canvas-mask') {
      let index = getSelectNode(e.offsetX, e.offsetY)
      console.log('----select index: ',index)
      setCheckIndex(index)
      updateSelectBoxRect(index,0,0,0,0)
      console.log('----index: ',index)
    } else {
      if (e.target.id === 'delete') {
        handleDelete()
      } else if (e.target.id === 'moveUp') {
        handleMoveUp()
      } else if (e.target.id === 'moveDown') {
        handleMoveDown()
      } else if (e.target.id !=='select-react') {
        setCheckIndex(-1)
      }
    }
  }

  const getSelectNode = (posX, posY) => {
    let selectIndex = -1, zOrder = 0
    sources.current.forEach((item, index) => {
      let zoomX = Math.floor(item.x!*zoom.current)
      let zoomY = Math.floor(item.y!*zoom.current)
      let zoomW = Math.floor(item.width!*zoom.current)
      let zoomH = Math.floor(item.height!*zoom.current)
      if (posX >= zoomX && posY >= zoomY && posX <= (zoomX + zoomW) && posY <= (zoomY + zoomH)) {
        if (item.zOrder! >= zOrder) {
          selectIndex = index
          zOrder = item.zOrder!
        }
      }
    })
    return selectIndex
  }

  const updateSelectBoxRect = (selectIndex, dx=0, dy=0,dw=0,dh=0) => {
    if (selectIndex >= 0) {
      console.log('updateSelectBoxRect dx: ',Math.floor(sources.current[selectIndex].x! * zoom.current)+dx)
      console.log('updateSelectBoxRect dy: ',Math.floor(sources.current[selectIndex].y! * zoom.current)+dy)
      console.log('updateSelectBoxRect dw, dh: ',dw,dh)
      setBoxRect({
        ...boxRect,
        left:  Math.floor((sources.current[selectIndex].x! + dx) * zoom.current),
        top: Math.floor((sources.current[selectIndex].y!+dy) * zoom.current),
        width: Math.floor((sources.current[selectIndex].width!) * zoom.current + dw),
        height: Math.floor((sources.current[selectIndex].height!) * zoom.current + dh)
      })
    }
  }

  const getNewSources = (selectIndex: number, x: number, y: number, dw: number, dh:number):TranscodingVideoStream[] => {
    let newSources = sources.current.map((item, index) => {
      if (index === selectIndex) {
        let dx = Math.floor(x/zoom.current) - item.x!
        let dy = Math.floor(y/zoom.current) - item.y!
        console.log('----getNewSource dx, dy: ',dx,dy)
        console.log('----getNewSource dw, dh: ',dw,dh)
        return {
          ...item,
          x: item.x! + dx,
          y: item.y! + dy,
          //width: item.width! + dw1,
          //height: item.height! + dh1
          width: item.width! + Math.floor(dw/zoom.current),
          height: item.height! + Math.floor(dh/zoom.current)
        }
      }
      return item
    })
    console.log('-----getNewSources: ', newSources)
    return newSources
  }

  const updateSources = (index: number, x: number, y: number,dw: number,dh: number) => {
    if (index >= 0) {
      let newSources = getNewSources(index,x,y,dw,dh)
      console.log('----updateSources newSources: ',  newSources)
      handlePreview(newSources)
    }
  }

  const updateResize = (x, y, dw, dh, isResizing) => {
    console.log('----updateResize x, y, dw, dh, isResizing: ',x, y, dw,dh,isResizing)
    if (isResizing) {
      updateSources(checkIndex,x,y,dw,dh)
    } else {
      let lastSources = getNewSources(checkIndex, x, y, dw,dh)
      sources.current = lastSources
      handlePreview()
    }
  }

  const handleMoveUp = () => {
    if (checkIndex >= 0) {
      sources.current[checkIndex].zOrder! += 1
      handlePreview()
      setCheckIndex(-1)
    }
  }

  const handleMoveDown = () => {
    console.log('------checkIndex: ',checkIndex)
    if (checkIndex>=0 && sources.current[checkIndex].zOrder! >= 2) {
      sources.current[checkIndex].zOrder! =1
      handlePreview()
      setCheckIndex(-1)
    }
  }

  const handleDelete = () => {
    console.log('-----handleDelete checkIndex: ',checkIndex)
    if (checkIndex >= 0) {
      let newSource = sources.current.filter((item,index) => {
        return index !==checkIndex
      })
      sources.current = newSource
      handlePreview()
      setCheckIndex(-1)
    }
  }

  const registerIpcRenderEvent = () => {
    ipcRenderer.on('get-file-path', (event, args) => {
      console.log('---------getFilePath path: ',args.filePaths[0])
      if (args.filePaths && args.filePaths.length > 0) {
        handleAddMediaSource(args.filePaths[0], args.type)
      }
    })
    ipcRenderer.on('capture-complete', (event, rect) => {
      console.log('----registerIpcRenderEvent capture-complete rect: ',rect)
      addScreenAreaSource(rect)
    })
  }

  const enumerateDevices = () => {
    const videoDevices = rtcEngine?.getVideoDeviceManager().enumerateVideoDevices()
    if (videoDevices&&videoDevices.length > 0) {
      let newDevices: IDevice[] = videoDevices.map((item) => {
        let nums = rtcEngine?.getVideoDeviceManager().numberOfCapabilities(item.deviceId!)
        let capacities: IDeviceCapacity[] = []
        if (nums&&nums>0) {
          for (let i = 0; i < nums; i++) {
            let cap = rtcEngine?.getVideoDeviceManager().getCapability(item.deviceId!, i)
            console.log('---------cap: ',cap)
            if (cap !== undefined) {
              capacities.push({
                width: cap.width!,
                height: cap.height!,
                fps: cap.fps!,
                modifyFps: cap.fps!
              });
            }
          }
        }
        return {
          deviceId: item.deviceId || '',
          deviceName: item.deviceName || '',
          capacity: capacities,
        }
      })
      console.log('----newDevices: ',newDevices)
      setDevices(newDevices)
    }
  }

  const MediaPlayerListener: IMediaPlayerSourceObserver = {
    onPlayerSourceStateChanged(state: MediaPlayerState, ec: MediaPlayerError) {
      console.log('onPlayerSourceStateChanged', 'state', state, 'ec', ec);
      switch (state) {
        case MediaPlayerState.PlayerStateIdle:
          break
        case MediaPlayerState.PlayerStateOpening:
          break
        case MediaPlayerState.PlayerStateOpenCompleted:
          console.log('------state is PlayerStateOpenCompleted')
          mediaPlayer.current?.play()
          //this.setState({ open: true });
          // Auto play on this case
          //setOpenPlayer(true)
          //player.current?.play()
          break
      }
    }
  }

  const createMediaPlayer = () => {
    mediaPlayer.current = rtcEngine?.createMediaPlayer()!
    mediaPlayer.current.registerPlayerSourceObserver(MediaPlayerListener)
  }

  const handleAddCamera = (selectIndex, selectCapIndex) => {
    console.log('---handleAddCamera','selectIndex: ',selectIndex,'selectCapIndex: ',selectCapIndex)
    if (devices.length < 1) {
      console.log('----There is no camera!')
      return 
    }
    let configuration: CameraCapturerConfiguration = {
      deviceId: devices[selectIndex].deviceId,
      format: {
        width: devices[selectIndex].capacity[selectCapIndex].width,
        height: devices[selectIndex].capacity[selectCapIndex].height,
        fps: devices[selectIndex].capacity[selectCapIndex].modifyFps
      }
    }
    console.log('---configuration: ',configuration)
    let type = selectIndex > 0 ? VideoSourceType.VideoSourceCameraSecondary : VideoSourceType.VideoSourceCameraPrimary
    let ret = rtcEngine?.startCameraCapture(type, configuration)
    console.log('-----ret: ',ret)
    console.log('-----videoRef: ',videoRef.current)
    let existIndex = sources.current.findIndex((item) => {
      return item.sourceType === type
    })
    if (existIndex < 0) {
      sources.current.push({
        sourceType: type,
        x: 0,
        y: 0,
        //width: devices[selectIndex].capacity[selectCapIndex].width,
        //height: devices[selectIndex].capacity[selectCapIndex].height,
        width: init_width,
        height: init_height,
        zOrder: sources.current.length+2,
        alpha: 1
      })
    }
    handlePreview()
  }

  const handleAddFullScreenSource = () => {
    let capScreenSources = rtcEngine?.getScreenCaptureSources({ width: 1920, height: 1080 }, { width: 64, height: 64 }, true)
    const fullScreenSource = capScreenSources?.find((item) => {
      return item.type === ScreenCaptureSourceType.ScreencapturesourcetypeScreen
    })
    console.log('-----handleAddFullScreenSource capScreenSources: ', fullScreenSource)
    if (fullScreenSource) {
      //let ret1 = rtcEngine?.startScreenCaptureBySourceType()
      let ret = rtcEngine?.startScreenCaptureByDisplayId(
        fullScreenSource.sourceId,
        { width: 0, height: 0, x: 0, y: 0 },
        {
          dimensions: { width: 1920, height: 1080 },
          bitrate: 1000,
          frameRate: 15,
          captureMouseCursor: false,
          windowFocus: false,
          excludeWindowList: [],
          excludeWindowCount: 0,
        }
      )
      console.log('---startScreenCaptureByDisplayId ret: ',ret)
      if (ret === 0) {
        sources.current.push({
          sourceType: VideoSourceType.VideoSourceScreenPrimary,
          x: 0,
          y: 0,
          width: init_width,
          height: init_height,
          zOrder: sources.current.length+2,
          alpha: 1
        })
        handlePreview()
      } else {
        console.error('Capture Screen is failed')
      }
    }
  }

  const handleAddScreenArea = () => {
    let capScreenSources = rtcEngine?.getScreenCaptureSources({ width: 1920, height: 1080 }, { width: 64, height: 64 }, true)
    const areaScreenSource = capScreenSources?.find((item) => {
      return item.type === ScreenCaptureSourceType.ScreencapturesourcetypeScreen
    })
    console.log('----handleAddScreenArea source: ',areaScreenSource)
    ipcRenderer.send('area-capture',areaScreenSource?.position)
  }

  const addScreenAreaSource = (rect) => {
    console.log('----addScreenAreaSource rect: ',rect)
    let capScreenSources = rtcEngine?.getScreenCaptureSources({ width: 1920, height: 1080 }, { width: 64, height: 64 }, true)
    const areaScreenSource = capScreenSources?.find((item) => {
      return item.type === ScreenCaptureSourceType.ScreencapturesourcetypeScreen
    })
    let ret1 = rtcEngine?.stopScreenCaptureBySourceType(VideoSourceType.VideoSourceScreenPrimary)
    console.log('---stop screen capture ret1: ',ret1)
    let ret = rtcEngine?.startScreenCaptureByDisplayId(
      areaScreenSource!.sourceId,
      { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
      {
        dimensions: { width: 1920, height: 1080 },
        bitrate: 1000,
        frameRate: 15,
        captureMouseCursor: false,
        windowFocus: false,
        excludeWindowList: [],
        excludeWindowCount: 0,
      }
    )
    console.log('---addScreenAreaSource ret: ',ret)
    if (ret === 0) {
      sources.current.push({
        sourceType: VideoSourceType.VideoSourceScreenPrimary,
        x: 0,
        y: 0,
        width: init_width,
        height: init_height,
        zOrder: sources.current.length+2,
        alpha: 1
      })
      handlePreview()
    } else {
      console.error('Capture Screen is failed')
    }

  } 

  const handleAddWindowSource = () => {
    let capScreenSources = rtcEngine?.getScreenCaptureSources({ width: 320, height: 160 }, { width: 80, height: 80 }, true)
    console.log('------capScreenSources: ',capScreenSources,'rtcEngine: ',rtcEngine)
    const capWinSources = capScreenSources!.filter((item) => {
      return item.type === ScreenCaptureSourceType.ScreencapturesourcetypeWindow
    }).map(item => {
      return {
        id: item.sourceId,
        sourceName: item.sourceName,
        thumbImage: item.thumbImage,
      }
    })
    if (capWinSources) {
      setCapWindowSources(capWinSources)
      setCapWinModalOpen(true)
    }
    console.log('----handleAddWindowSource capWinSources: ',capWinSources)
  }

  const handleAddMediaSource = (srcUrl: string, type: string) => {
    console.log('-----handleAddMediaSource srcUrl: ',srcUrl, 'type: ', type)
    let sourceType
    if (type === 'image') {
      if(srcUrl.endsWith('.png')) {
        sourceType = VideoSourceType.VideoSourceRtcImagePng
      } else {
        sourceType = VideoSourceType.VideoSourceRtcImageJpeg
      }
    } else if (type === 'gif') {
      sourceType = VideoSourceType.VideoSourceRtcImageGif
    } else if (type === 'video') {
      sourceType = VideoSourceType.VideoSourceMediaPlayer
    }
    if (type === 'image' || type === 'gif') {
      sources.current.push({
        sourceType,
        x: 0,
        y: 0,
        width: init_width,
        height: init_height,
        zOrder: sources.current.length+2,
        alpha: 1,
        imageUrl: srcUrl
      })
    } else if (type === 'video') {
      let ret = mediaPlayer.current?.open(srcUrl,0)
      console.log('----mediaPlaye ret: ',ret)
      let sourceId = mediaPlayer.current!.getMediaPlayerId();
      console.log('-----sourceId: ', sourceId)
      sources.current.push({
        sourceType,
        x: 0,
        y: 0,
        width: init_width,
        height: init_height,
        zOrder: sources.current.length+2,
        alpha: 1,
        mediaPlayerId: sourceId
      })
    }
    handlePreview()
  }

  const handleStopPreview = () => {
    console.log('--------handleStopPreview isPreview: ',isPreview)
    if (isPreview) {
      let ret = rtcEngine?.stopLocalVideoTranscoder()
      ret = rtcEngine?.setupLocalVideo({
        sourceType: VideoSourceType.VideoSourceTranscoded,
        view: null,
        uid: Config.uid,
        mirrorMode: VideoMirrorModeType.VideoMirrorModeDisabled,
        renderMode: RenderModeType.RenderModeFit,
      });
      sources.current = []
      setPreview(false)
      while (videoRef.current?.firstChild) {
        videoRef.current?.removeChild(videoRef.current?.firstChild);
      }
      console.log('--------stop localTranscoder ret: ',ret)
    }
  }

  const handlePreview = (newSources?: any) =>{
    console.log('------handlePreview source: ', sources.current)
    console.log('----isPreview: ',isPreview)
    if(!isPreview)
    {
      let ret = rtcEngine?.startLocalVideoTranscoder(calcTranscoderOptions(sources.current));
      console.log('-------startLocalVideoTranscoder ret: ',ret)
      ret = rtcEngine?.setupLocalVideo({
        sourceType: VideoSourceType.VideoSourceTranscoded,
        view: videoRef.current,
        uid: Config.uid,
        mirrorMode: VideoMirrorModeType.VideoMirrorModeDisabled,
        renderMode: RenderModeType.RenderModeFit,
      });
      console.log('--------setupLocalVideo ret: ',ret)
      setPreview(true)
    }
    else{
      let ret
      if (newSources) {
        ret = rtcEngine?.updateLocalTranscoderConfiguration(calcTranscoderOptions(newSources))
      } else {
        ret = rtcEngine?.updateLocalTranscoderConfiguration(calcTranscoderOptions(sources.current))
      }
      console.log('---updateLocalTranscoderConfiguration ret: ',ret)

    }
  }

  const calcTranscoderOptions = (sources) => {
    let videoInputStreams = sources.map(s => {
      return Object.assign({connectionId: 0}, s)
    }) 
    //dimensions 参数设置输出的画面横竖屏
    console.log('-------calcTranscoderOptions isHorizontalRef: ',isHorizontalRef)
    let videoOutputConfigurationobj = {
      dimensions: isHorizontalRef.current ? { width: 1280, height: 720 } : { width: 720, height: 1280 },
      frameRate: 25,
      bitrate: 0,
      minBitrate: -1,
      orientationMode: 0,
      degradationPreference: 0,
      mirrorMode: 0
    }

    return {
      streamCount: sources.length,
      videoInputStreams: videoInputStreams,
      videoOutputConfiguration: videoOutputConfigurationobj
    }
  }

  const updateSelectedDeviceInfo = (data) => {
    setDeviceIndex(data.selectdDevice)
    setCapacityIndex(data.selectCap)
    setDevices((preDevices) => {
      const newDevices = [...preDevices]
      const device = newDevices[data.selectdDevice]
      if (device) {
        const capacity = device.capacity[data.selectCap]
        if (capacity) {
          capacity.modifyFps = parseInt(data.fps)
        }
      }
      console.log(newDevices)
      return newDevices
    })
  }
 
  const onLayoutClick = (e) => {
    console.log('-------id: ',e.target.id)
    if (e.target.id === 'horizontal' && !isHorizontal) {
      console.log('setIsHorizontal true')
      setIsHorizontal(true)
    }
    if (e.target.id === 'vertical') {
      console.log('setIsHorizontal false')
      setIsHorizontal(false)
    }
  }

  const handleOptClick = (e) => {
    console.log(e.target.id)
    console.log(`handleOptClick`)
    console.log(isAppIdExist)
    if (!isAppIdExist) {
      message.info('请输入正确App ID')
      return
    }
    if (e.target.id === 'camera') {
      setIsCameraModalOpen(true)
    }
    if (e.target.id === 'virtual') {
      setVirtualBgModalOpen(true)
    }
  }

  const handleCameraModalOk = (data) => {
    console.log('-----handleCameraModalOk: ',data)
    updateSelectedDeviceInfo(data)
    handleAddCamera(data.selectdDevice, data.selectCap)
    setIsCameraModalOpen(false)
  }

  const handleCameraModalCancal = () => {
    setIsCameraModalOpen(false)
  }

  const handleVirtualBgModalCancal = () => {
    setVirtualBgModalOpen(false)
  }

  const handleCapWinModalCancel = () => {
    setCapWinModalOpen(false)
  }

  const handleSelectCaptureWinSource = (selectCapWin) => {
    console.log('-----handleSelectCaptureWInSource selectCapWin: ', selectCapWin)
    let ret = rtcEngine?.startScreenCaptureByWindowId(
      selectCapWin.id,
      { width: 0, height: 0, x: 0, y: 0 },
      {
        dimensions: { width: 1920, height: 1080 },
        bitrate: 1000,
        frameRate: 15,
        captureMouseCursor: false,
        windowFocus: false,
        excludeWindowList: [],
        excludeWindowCount: 0,
      }
    )
    console.log('------handleSelectCaptureWinSource ret: ',ret)
    if (ret == 0) {
      sources.current.push({
        sourceType: VideoSourceType.VideoSourceScreenPrimary,
        x: 0,
        y: 0,
        width: init_width,
        height: init_width,
        zOrder: sources.current.length+2,
        alpha: 1
      })
      handlePreview()
    } else {
      console.error('Transcode window failed!')
    }
    setCapWinModalOpen(false)
  }
  const handleEnableGreenScreen = (isEnable) => {
    setEnableGreenScreen(isEnable)
  }

  const captureMenuOpenChange = (value) => {
    console.log('----handleOnOpenChange value: ',value)
    setCaptureMenuOpen(value)
  }

  const mediaMenuOpenChange = (value) => {
    console.log('----mediaMenuOpenChange value: ',value)
    setMediaMenuOpen(value)
  }

  const handleCaptureMenuClick = (e) => {
    console.log('-----handleCaptureMenuClick key: ',e.key)
    setCaptureMenuOpen(false)
    if (!isAppIdExist) {
      message.info('请输入正确App ID')
      return
    }
    if (e.key === 'fullscreen') {
      handleAddFullScreenSource()
    } else if (e.key === 'winCapture') {
      handleAddWindowSource()
    } else if (e.key === 'areaCapture') {
      //ipcRenderer.send('area-capture')
      handleAddScreenArea()
    }
  }

  const handleMediaMenuClick = (e) => {
    console.log('-----handleMediaMenuClick key: ',e.key)
    setMediaMenuOpen(false)
    if (!isAppIdExist) {
      message.info('请输入正确App ID')
      return
    }
    ipcRenderer.send('open-select-file-dialog', e.key)
  }

  const captureMenu = (
    <Menu onClick={handleCaptureMenuClick} items={[
      {key: 'winCapture', label: '窗口捕获'},
      {key: 'fullscreen', label: '全屏捕获'},
      {key: 'areaCapture', label: '区域捕获'},
    ]}/>
  )

  const mediaMenu = (
    <Menu onClick={handleMediaMenuClick} items={
      [
        {key: 'image', label: '静态图片(jpg/png)'},
        {key: 'gif', label: '动态图片(gif)'},
        {key: 'video', label: '视频(推荐使用声网mpk播放)'}
      ]
    }/>
  )

  const renderOptListItem = (item) => {
    if (item.id === 'camera' || item.id === 'virtual') {
      return (
        <div key={item.id} id={item.id} className={styles.item} onClick={handleOptClick}>
          <img src={`file://${item.imgUrl}`} alt="" style={{pointerEvents: 'none'}}/>
          <span style={{pointerEvents: 'none'}}>{item.title}</span>
        </div>
      )
    } else if (item.id === 'capture') {
      return (
        <div key={item.id} id={item.id} className={styles.item}>
          <img src={`file://${item.imgUrl}`} alt="" style={{pointerEvents: 'none'}}/>
          <div className={styles.desc}>
            <Dropdown
              trigger={['click']}
              onOpenChange={captureMenuOpenChange}
              overlay={captureMenu}>
              <div>
                <span className={styles.title}>{item.title}</span>
                {isCaptureMenuOpen ? <UpOutlined className={styles.arrow}/> : <DownOutlined className={styles.arrow}/>}
              </div>
            </Dropdown>
          </div>
        </div>
      ) 
    } else if (item.id === 'media') {
      return (
        <div key={item.id} id={item.id} className={styles.item}>
          <img src={`file://${item.imgUrl}`} alt="" style={{pointerEvents: 'none'}}/>
          <div className={styles.desc}>
            <Dropdown
              trigger={['click']}
              onOpenChange={mediaMenuOpenChange}
              overlay={mediaMenu}>
              <div>
                <span className={styles.title}>{item.title}</span>
                {isMediaMenuOpen ? <UpOutlined className={styles.arrow}/> : <DownOutlined className={styles.arrow}/>}
              </div>
            </Dropdown>
          </div>
        </div>
      ) 
    }
  }
  
  return (
    <div className={styles.livePreview}>
      <div className={styles.header}>
        <div className={styles.title}>直播预览</div>
        <div className={styles.layoutSetting} onClick={onLayoutClick}>
          <div id="horizontal" className={`${isHorizontal ? styles.active : ''} ${styles.button}`}>
            <span>横屏</span>
          </div>
          <div id="vertical" className={`${isHorizontal ? '' : styles.active} ${styles.button}`}>
            <span>竖屏</span>
          </div>
        </div>
      </div>
      <div className={isHorizontal ? styles.previewRow : styles.previewColum}>
        <div className={styles.area} id="video-wapper" ref={videoRef}></div>
        {
          (checkIndex>=0)&&(<SelectBox {...boxRect} resizingCallBack={updateResize} handleDelete={handleDelete} handleMoveDown={handleMoveDown} handleMoveUp={handleMoveUp}/>)
        }
        <div className={styles.options}>
          {
            optConfig.map(item => {
              return renderOptListItem(item)
            })
          }
        </div>
      </div>
      {isCameraModalOpen && (
        <CameraModal 
          isOpen={isCameraModalOpen} 
          onOk={handleCameraModalOk}
          deviceIndex={deviceIndex} 
          capacityIndex={capacityIndex} 
          devices={devices} 
          onCancel={handleCameraModalCancal}/>
      )}
      {isVirtualBgModalOpen && (
        <VirtualBackgroundModal
          onCancel={handleVirtualBgModalCancal}
          isHorizontal = { isHorizontal }
          enableGreenScreen = {enableGreenScreen}
          onGreenScreenCb = { handleEnableGreenScreen}
          isOpen={isVirtualBgModalOpen} />
      )}
      {isCapWinModalOpen && (
        <CaptureWinModal
          onCancel={handleCapWinModalCancel}
          onSelect={handleSelectCaptureWinSource}
          captureWinSources = {capWindowSources}
          isOpen={isCapWinModalOpen} />
      )}
    </div>
  )
}

export default LivePreview