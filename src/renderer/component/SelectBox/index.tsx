import ReactDOM from 'react-dom';
import { useEffect, useState, useRef } from 'react';
import { Rnd } from 'react-rnd'


import styles from './index.scss'

interface ConfigProps {
  containerId: string,
  left: number,
  top: number,
  width: number,
  height: number,
  resizingCallBack? : (x: number, y: number, dw: number, dh: number,isResizing: boolean) => void
}
const SelectBox = (props : ConfigProps) => {
  const [mounted, setMounted] = useState(false);
  const parentDom = useRef<any>(null);
  const [position, setPosition] = useState({x: props.left, y: props.top})
  const [size, setSize] = useState({width: props.width, height: props.height})
  console.log('------render selectBox')
  useEffect(() => {
    setMounted(true);
    setPosition({
      x: props.left,
      y: props.top
    })
    setSize({
      width: props.width,
      height: props.height
    })
    parentDom.current = document.getElementById(props.containerId)
    console.log('------ selectbox parentDom: ',parentDom)
    return () => {
      setMounted(false);
    }
  }, [props])

  const handleMouseUp = (e) => {
    console.log('-------dddddd')
  }

  
  if (!mounted || !parentDom.current) {
    return null;
  }

  return ReactDOM.createPortal(
    <Rnd 
      style={{position: 'relative',border: '1px dotted #ccc'}}
      bounds={parentDom.current}
      id = 'select-react'
      onMouseUp={handleMouseUp}
      size = {size}
      position = {position}
      onDrag = {(e,d) => {
        setPosition({x: d.x, y:d.y})
        props.resizingCallBack!(d.x, d.y, 0, 0, true)
      }}
      onDragStop={(e, d) => {
        setPosition({x: d.x, y:d.y})
        props.resizingCallBack!(d.x, d.y, 0, 0, false)
      }}
      onResize={(e, direction, ref, delta, position) => {
        setPosition({
          ...position
        })
        setSize({
          width: ref.offsetWidth,
          height: ref.offsetHeight
        })
        props.resizingCallBack!(position.x, position.y, delta.width, delta.height, true)
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        console.log('onResizeStop: ',ref.offsetWidth,ref.offsetHeight)
        setPosition({
          ...position
        })
        setSize({
          width: ref.offsetWidth,
          height: ref.offsetHeight
        })
        props.resizingCallBack!(position.x, position.y, delta.width, delta.height, false)
      }}
    >
      <div className={[styles['resizer'], styles['top-left']].join(' ')} ></div>
      <div className={[styles['resizer'], styles['top-right']].join(' ')} ></div>
      <div className={[styles['resizer'], styles['bottom-left']].join(' ')} ></div>
      <div className={[styles['resizer'], styles['bottom-right']].join(' ')} ></div>
    </Rnd>,
    parentDom.current
  )
}

export default SelectBox