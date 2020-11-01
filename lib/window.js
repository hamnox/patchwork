const Path = require('path')
const electron = require('electron')
const extend = require('xtend/mutable')

module.exports = function Window (config, path, opts) {
  const window = new electron.BrowserWindow(extend({
    show: false,
    webPreferences: {
      nodeIntegration: true // XXX: Maybe not always necessary (?)
    }
  }, opts))

  electron.ipcMain.on('ready-to-show', handleReadyToShow)

  window.webContents.on('dom-ready', function () {
    window.webContents.executeJavaScript(`
      var electron = require('electron')
      var rootView = require(${JSON.stringify(path)})
      var h = require('mutant/h')

      electron.webFrame.setVisualZoomLevelLimits(1, 1)

      var config = ${JSON.stringify(config)}
      var data = ${JSON.stringify(opts.data)}
      var title = ${JSON.stringify(opts.title || 'Patchwork')}

      document.documentElement.querySelector('head').appendChild(
        h('title', title)
      )

      var shouldShow = ${opts.show !== false}
      var shouldConnect = ${opts.connect !== false}

      document.documentElement.replaceChild(h('body', [
        rootView(config, data)
      ]), document.body)
    `)
  })

  // setTimeout(function () {
  //   window.show()
  // }, 3000)

  window.webContents.on('will-navigate', function (e, url) {
    e.preventDefault()
    electron.shell.openExternal(url)
  })

  window.webContents.on('new-window', function (e, url) {
    e.preventDefault()
    electron.shell.openExternal(url)
  })

  window.on('closed', function () {
    electron.ipcMain.removeListener('ready-to-show', handleReadyToShow)
  })

  window.loadURL('file://' + Path.join(__dirname, '..', 'assets', 'base.html'))
  return window

  // scoped

  function handleReadyToShow (ev) {
    if (ev.sender === window) {
      window.show()
      electron.ipcMain.removeListener('ready-to-show', handleReadyToShow)
    }
  }
}
