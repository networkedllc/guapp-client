import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import { io } from 'socket.io-client';
import net from 'node:net';
import { updateElectronApp } from 'update-electron-app';
import AutoLaunch from 'auto-launch';
import pkg from '../package.json';
import type { Socket } from 'socket.io-client';
import storage from 'electron-json-storage';

updateElectronApp();

const autoLauncher = new AutoLaunch({
	name: 'ProxyClient'
});

let socket: Socket;

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let win: BrowserWindow = null;
let quitting = false;

const createWindow = (): void => {
  // Create the browser window.
  win = new BrowserWindow({
    icon: 'src/assets/guapp_icon.ico',
    height: 403,
    width: 361,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

    win.setMenu(null)
    win.setMenuBarVisibility(false);
  

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // and load the index.html of the app.
  win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  win.on('close', (event) => {
    if (quitting) {
      win = null
    } else {
      event.preventDefault()
      win.hide()
    }
  })
};

type Settings = {
  autobootEnabled: boolean
  clientEnabled: boolean
}

const settings = storage.getSync("settings") as Settings ?? {
  autobootEnabled: false,
  clientEnabled: false
}

console.log("got settings", settings)

const connectSocket = () => {
  socket = io("http://command.wtfproxy.com:9988", {
    extraHeaders: {
      "x-guapp-version": pkg.version
    }
  });

  socket.on("gateway", async ({ host, port, head, connectionId }) => {
    console.log(host, port, head, connectionId);
    try {
      const svrSocket = net.connect(port, host);
      svrSocket.on("data", data => {
        console.log("serverdata", data);
        socket.emit(`data:${connectionId}`, data)
      })
      console.log(connectionId)
      socket.on(`data:${connectionId}`, (data) => {
        console.log("clientdata", data)
        svrSocket.write(data)
      })
      svrSocket.write(head);
      socket.emit(`data:${connectionId}`,`HTTP/1.0 200 Connection Established\r\nProxy-agent: guapp (v1.0)\r\n\r\n`);
    } catch (err) {
      console.error(err)
    }
  });
}


if(settings.clientEnabled) connectSocket();

const handleQuit = () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}

const handleClientToggle = async () => {
  settings.clientEnabled = !settings.clientEnabled;
  console.log("Client toggle", settings.clientEnabled);
  if(settings.clientEnabled) {
    connectSocket();
  } else if (!settings.clientEnabled) {
    socket.close();
  }
  storage.set("settings", settings, (error) => {
   if(error) console.error(error)  
  })
}

const handleAutobootToggle = () => {
  settings.autobootEnabled = !settings.autobootEnabled;
  console.log("Boot toggle", settings.autobootEnabled);
  if(settings.autobootEnabled) {
    autoLauncher.enable();
  } else if (!settings.autobootEnabled) {
    autoLauncher.disable();
  }
  storage.set("settings", settings, (error) => {
    if(error) console.error(error)  
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  createWindow();
  ipcMain.handle('client:toggle', handleClientToggle)
  ipcMain.handle('autoboot:toggle', handleAutobootToggle)
  const icon = nativeImage.createFromPath('src/assets/guapp_icon.ico')
  const tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: "Show", type: "normal", click: () => win.show() },
    { label: "Quit", type: "normal", click: handleQuit },
  ]);
  tray.setToolTip("Guapp");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => win.show())
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
  win.show();
});

app.on('before-quit', () => quitting = true)


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
