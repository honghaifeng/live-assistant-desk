import { app, BrowserWindow, systemPreferences, ipcMain, dialog } from 'electron';
import path from 'path';
import { format as formatUrl } from 'url';
import { systemCommand } from './constants/messageCommand'

const isDevelopment = process.env.NODE_ENV !== 'production';
app.allowRendererProcessReuse = false;

if (systemPreferences.askForMediaAccess) {
  systemPreferences.askForMediaAccess('camera');
  systemPreferences.askForMediaAccess('microphone');
}

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow;

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 720,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
    //titleBarStyle: 'hidden',
    //titleBarOverlay: false,
  });
  window.setMinimumSize(1200,720)
  window.setBackgroundColor('#000000')
  window.webContents.openDevTools({
    mode: 'detach',
    activate: true,
  });

  if (isDevelopment) {
    window.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`);
  } else {
    window.loadURL(
      formatUrl({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file',
        slashes: true,
      })
    );
  }

  window.on('closed', () => {
    mainWindow = null;
  });

  window.webContents.on('devtools-opened', () => {
    window.focus();
    setImmediate(() => {
      window.focus();
    });
  });

  return window;
}

const registerIpcMainEvent = () => {
  ipcMain.on(systemCommand.OPEN_SELECT_FILE_DIALOG, (event, args) => {
    console.log('----------args: ',args)
    let filters = [];
    if (args === 'image') {
      filters = [
        { name: 'Images', extensions: ['jpg', 'png'] },
      ];
    } else if (args === 'gif') {
      filters = [
        { name: 'GIF', extensions: ['gif'] },
      ];
    } else if (args === 'video') {
      filters = [
        { name: 'Videos', extensions: ['mp4', 'avi'] },
      ];
    }
    console.log('------------filter: ',filters)
    dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters
    }).then((result) => {
      const filePaths = result.filePaths;
      console.log('------------result: ', result)
      console.log('Selected file paths:', filePaths);
      let ret = {
        type: args,
        filePaths: result.canceled ? [] : result.filePaths
      }
      mainWindow.webContents.send(systemCommand.GET_FILE_PATH, ret)
      // 根据文件路径执行相应的操作
    })
    .catch((error) => {
      console.error('Error while opening file dialog:', error);
    });
  })
}
// quit application when all windows are closed
app.on('window-all-closed', () => {
  // on macOS it is common for applications to stay open until the user explicitly quits
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // on macOS it is common to re-create a window even after all windows have been closed
  if (mainWindow === null) {
    mainWindow = createMainWindow();
  }
});

// create main BrowserWindow when electron is ready
app.on('ready', () => {
  mainWindow = createMainWindow();
  registerIpcMainEvent()
});
