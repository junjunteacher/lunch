const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  searchSchool: (name) => ipcRenderer.invoke('neis:searchSchool', name),
  clearCache: () => ipcRenderer.send('cache:clear'),
  meals: (ymd) => ipcRenderer.invoke('neis:meals', ymd),
  mealDays: (yyyymm) => ipcRenderer.invoke('neis:mealDays', yyyymm),
  schedule: (yyyymm) => ipcRenderer.invoke('neis:schedule', yyyymm),
  openSettings: () => ipcRenderer.send('win:openSettings'),
  hide: () => ipcRenderer.send('win:hide'),
  closeSettings: () => ipcRenderer.send('win:closeSettings'),
  resize: (h) => ipcRenderer.send('win:resize', h),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onRefresh: (cb) => ipcRenderer.on('refresh', cb),
  onConfigChanged: (cb) => ipcRenderer.on('config-changed', (_, c) => cb(c)),
});
