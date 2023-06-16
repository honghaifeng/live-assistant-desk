import React, { useState } from 'react'
import { Modal, Button, Switch } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import styles from './virtualBackgroundModal.scss'

interface IProps {
  isOpen: boolean
  onCancel: () => void
}

const VirtualBackgroundModal: React.FC<IProps> = ({ isOpen, onCancel }) => {
  const [enableGreenScreen, setEnableGreenScreen] = useState(false)

  const onGreenScreenChange = (isEnable) => {
    console.log('onGreenScreenChange value: ', isEnable)
    if (isEnable) {
      Modal.confirm({
        title: '确定开启绿幕功能吗?',
        content: '为了保证虚拟背景的效果，我们推荐您在搭设绿幕作为背景后再开启绿幕功能',
        okText: '确认开启',
        cancelText: '暂不开启',
        onCancel() { 
          console.log('onCancel')
        },
        onOk() {
          setEnableGreenScreen(isEnable)
          console.log('onOk')
        }
      })
    } else {
      setEnableGreenScreen(isEnable)
    }
  }
  return (
    <Modal
      open={isOpen}
      onCancel={onCancel}
      centered={true}
      closable={false}
      title='虚拟背景'
      footer={[
        <div key='greenScreen' className={styles.footer}>
          <div>
            <span>我有绿幕</span>
            <InfoCircleOutlined />
          </div>
          <Switch onChange={onGreenScreenChange} checked={enableGreenScreen}></Switch>
        </div>
      ]}
    >
      <div className={styles.content}>
        <Button onClick={onCancel} type="primary">无</Button>
        <Button type="primary">模糊</Button>
        <Button type="primary">蜜桃</Button>
      </div>
    </Modal>
  )
}

export default VirtualBackgroundModal