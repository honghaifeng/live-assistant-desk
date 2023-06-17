import React, { useState, useRef, useEffect, useContext } from "react"
import { ipcRenderer } from 'electron'
import RtcEngineContext, { IAppContext } from "../../context/rtcEngineContext"
import styles from './livePreview.scss'
import { getResourcePath } from '../../utils/index'
import { DownOutlined,UpOutlined } from '@ant-design/icons'
import { message, Dropdown, Menu } from 'antd'
import CameraModal from '../CameraModal'
import VirtualBackgroundModal from '../VirtualBackgroundModal'
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
  MediaPlayerError
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
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false)
  const [isVirtualBgModalOpen, setVirtualBgModalOpen] = useState(false)
  const [enableGreenScreen, setEnableGreenScreen] = useState(false)
  const [devices, setDevices] = useState<IDevice[]>([])
  const [sources, setSources] = useState<TranscodingVideoStream[]>([])
  const [deviceIndex, setDeviceIndex] = useState(0)
  const [capacityIndex, setCapacityIndex] = useState(0)
  const [isFirstScreenOpen, setFirstScreenState] = useState(false)
  const [isCaptureMenuOpen, setCaptureMenuOpen] = useState(false)
  const [isMediaMenuOpen, setMediaMenuOpen] = useState(false)
  const videoRef = useRef(null)
  const isPreview = useRef<boolean>(false)
  const mediaPlayer = useRef<IMediaPlayer | null>(null)
  const {rtcEngine, isAppIdExist, appId} = useContext(RtcEngineContext) as IAppContext
  const init_width = 600, init_height = 600
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
  },[])

  useEffect(() => {
    if (sources.length > 0) {
      console.log('transcoder sources change')
      handlePreview()
    }
  },[sources])

  const registerIpcRenderEvent = () => {
    ipcRenderer.on('get-file-path', (event, args) => {
      console.log('---------getFilePath path: ',args.filePaths[0])
      if (args.filePaths && args.filePaths.length > 0) {
        handleAddMediaSource(args.filePaths[0], args.type)
      }
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
    setSources((preSources) => {
      let index = preSources.findIndex((item) => {
        console.log('-----item: ',item)
        return item.sourceType === type
      })
      console.log('------index: ',index)
      if (index < 0) {
        return [
          ...preSources,
          {
            sourceType: type,
            x: 0,
            y: 0,
            //width: devices[selectIndex].capacity[selectCapIndex].width,
            //height: devices[selectIndex].capacity[selectCapIndex].height,
            width: init_width,
            height: init_height,
            zOrder: 1,
            alpha: 1
          }
        ]
      } else {
        handlePreview()
        return preSources
      }
    })
  }

  const handleAddScreen = (data) =>{
    let type = isFirstScreenOpen ? VideoSourceType.VideoSourceScreenSecondary : VideoSourceType.VideoSourceScreenPrimary
    if(data.isDisplay)
    {
      let config = {
        isCaptureWindow: false,
        displayId: data.windowId,
        ScreenCaptureParameters:{frameRate:15}
      }
      
      rtcEngine?.startScreenCaptureBySourceType(type, config);
    }
    else{
      let config = {
        isCaptureWindow: true,
        windowId: data.windowId,
        ScreenCaptureParameters:{frameRate:15}
      }

      rtcEngine?.startScreenCaptureBySourceType(type, config);
    }
    setSources((preSources) => {
      return [
        ...preSources,
        {
          sourceType: type,
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          zOrder: 1,
          alpha: 1
        }
      ]
    })
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
      setSources((preSource) => {
        return [
          ...preSource,
          {
            sourceType,
            x: 0,
            y: 0,
            width: init_width,
            height: init_height,
            zOrder: 1,
            alpha: 1,
            imageUrl: srcUrl
          }
        ]
      })
    } else if (type === 'video') {
      let ret = mediaPlayer.current?.open(srcUrl,0)
      console.log('----mediaPlaye ret: ',ret)
      let sourceId = mediaPlayer.current!.getMediaPlayerId();
      console.log('-----sourceId: ', sourceId)
      setSources((preSource) => {
        return [
          ...preSource,
          {
            sourceType,
            x: 0,
            y: 0,
            width: init_width,
            height: init_height,
            zOrder: 1,
            alpha: 1,
            mediaPlayerId: sourceId
          }
        ]
      })
    }
  }

  const handlePreview = () =>{
    console.log('------handlePreview: ', sources)
    console.log('----isPreview: ',isPreview.current)
    if(!isPreview.current)
    {
      let ret = rtcEngine?.startLocalVideoTranscoder(calcTranscoderOptions(sources));
      console.log('-------startLocalVideoTranscoder ret: ',ret)
      ret = rtcEngine?.setupLocalVideo({
        sourceType: VideoSourceType.VideoSourceTranscoded,
        view: videoRef.current,
        uid: Config.uid,
        mirrorMode: VideoMirrorModeType.VideoMirrorModeDisabled,
        renderMode: RenderModeType.RenderModeFit,
      });
      console.log('--------setupLocalVideo ret: ',ret)
      isPreview.current = true
    }
    else{
      console.log('----updateLocalTranscoderConfiguration isPreview: ',isPreview.current)
      let ret = rtcEngine?.updateLocalTranscoderConfiguration(calcTranscoderOptions(sources))
      console.log('---updateLocalTranscoderConfiguration ret: ',ret)

    }
  }

  const calcTranscoderOptions = (sources) => {
    let videoInputStreams = sources.map(s => {
      return Object.assign({connectionId: 0}, s)
    }) 
    //dimensions 参数设置输出的画面横竖屏
    let videoOutputConfigurationobj = {
      dimensions: isHorizontal ? { width: 1280, height: 720 } : { width: 720, height: 1280 },
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
    if (e.target.id === 'horizontal' && !isHorizontal) {
      setIsHorizontal(true)
    }
    if (e.target.id === 'vertical') {
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
    if (!isAppIdExist) {
      message.info('请输入正确App ID')
      return
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
              trigger={['hover']}
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
              trigger={['hover']}
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
        <div className={styles.area} id="videoWapper" ref={videoRef}></div>
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
    </div>
  )
}

export default LivePreview