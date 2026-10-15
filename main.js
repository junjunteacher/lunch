const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const neis = require('./neis');

// ---------- 설정 저장 (userData/config.json) ----------
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = {
  school: null,                          // {code,name,office,officeName,kind}
  mealTypes: { 1: true, 2: true, 3: true },  // 조식/중식/석식
  gradeFilter: 0,                        // 0=전체
  showCal: true, showAllergy: true, expandOrigin: false,
  color: 'pink', opacity: 92, alwaysOnTop: true, showOnStart: true,
  allergies: [],                         // 내 알레르기 번호
  bounds: null,                          // 창 위치
};
let config = { ...DEFAULTS };
function loadConfig() {
  try { config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8')) }; } catch { config = { ...DEFAULTS }; }
}
function saveConfig(patch) {
  config = { ...config, ...patch };
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(config, null, 2));
}

// ---------- 창 ----------
let postit = null, settingsWin = null, tray = null;

function createPostit() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const b = config.bounds || { x: width - 320, y: 60, width: 280, height: 420 };
  postit = new BrowserWindow({
    ...b, minWidth: 220, minHeight: 200,
    frame: false, transparent: true, resizable: true, skipTaskbar: true,
    alwaysOnTop: config.alwaysOnTop, hasShadow: false, show: config.showOnStart,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  postit.loadFile(path.join(__dirname, 'renderer', 'postit.html'));
  postit.setAlwaysOnTop(config.alwaysOnTop, 'floating');
  const remember = () => { if (!postit.isDestroyed()) saveConfig({ bounds: postit.getBounds() }); };
  postit.on('moved', remember); postit.on('resized', remember);
  postit.on('close', e => { if (!app.isQuiting) { e.preventDefault(); postit.hide(); } });
  postit.webContents.on('did-finish-load', () => {
    if (!config.school) openSettings();
  });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 520, height: 600, title: '급식쪽지 설정', resizable: false, minimizable: false,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
}

function toggle() { if (!postit) return; postit.isVisible() ? postit.hide() : postit.show(); }

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('급식쪽지 — made by junjunT');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '쪽지 보이기/숨기기', click: toggle },
    { label: '지금 갱신', click: () => { cache = {}; postit?.webContents.send('refresh'); } },
    { label: '설정…', click: openSettings },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuiting = true; app.quit(); } },
  ]));
  tray.on('click', toggle);
}

// ---------- 자정 자동 갱신 ----------
function scheduleMidnight() {
  const now = new Date();
  const next = new Date(now); next.setHours(24, 0, 5, 0);
  setTimeout(() => { postit?.webContents.send('refresh'); scheduleMidnight(); }, next - now);
}

// ---------- IPC ----------
ipcMain.handle('config:get', () => config);
ipcMain.handle('config:set', (_, patch) => {
  saveConfig(patch);
  if (postit && !postit.isDestroyed()) {
    postit.setAlwaysOnTop(config.alwaysOnTop, 'floating');
    postit.webContents.send('config-changed', config);
  }
  return config;
});
// ---------- 디스크 캐시 (같은 날 재호출 방지 — 인증키 하루 한도 절약) ----------
const CACHE_PATH = () => path.join(app.getPath('userData'), 'cache.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_PATH(), 'utf8')); } catch { cache = {}; }
const todayKey = () => new Date().toISOString().slice(0, 10);
async function cached(key, fn) {
  const k = `${config.school?.code}|${key}|${todayKey()}`;
  if (cache[k]) return cache[k];
  const v = await fn();
  if (!v.error) {
    Object.keys(cache).forEach(x => { if (!x.endsWith(todayKey())) delete cache[x]; });
    cache[k] = v;
    try { fs.writeFileSync(CACHE_PATH(), JSON.stringify(cache)); } catch {}
  }
  return v;
}
ipcMain.handle('neis:searchSchool', (_, name) => neis.searchSchool(null, name).catch(e => ({ rows: [], error: e.message })));
ipcMain.handle('neis:meals', (_, ymd) => config.school ? cached('meal' + ymd, () => neis.meals(null, config.school.office, config.school.code, ymd).catch(e => ({ rows: [], error: e.message }))) : { rows: [] });
ipcMain.handle('neis:mealDays', (_, yyyymm) => config.school ? cached('days' + yyyymm, () => neis.mealDays(null, config.school.office, config.school.code, yyyymm).catch(e => ({ rows: [], error: e.message }))) : { rows: [] });
ipcMain.handle('neis:schedule', (_, yyyymm) => config.school ? cached('sched' + yyyymm, () => neis.schedule(null, config.school.office, config.school.code, yyyymm).catch(e => ({ rows: {}, error: e.message }))) : { rows: {} });
ipcMain.on('cache:clear', () => { cache = {}; try { fs.unlinkSync(CACHE_PATH()); } catch {} });
ipcMain.on('win:openSettings', openSettings);
ipcMain.on('win:hide', () => postit?.hide());
ipcMain.on('win:closeSettings', () => settingsWin?.close());
ipcMain.on('win:resize', (_, h) => { if (postit && !postit.isDestroyed()) { const b = postit.getBounds(); postit.setBounds({ ...b, height: Math.max(200, Math.min(h, 900)) }); } });
ipcMain.on('open-external', (_, url) => shell.openExternal(url));

// ---------- 앱 ----------
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => postit?.show());
app.whenReady().then(() => {
  loadConfig();
  createPostit(); createTray(); scheduleMidnight();
  app.setLoginItemSettings({ openAtLogin: true });
});
app.on('window-all-closed', e => e.preventDefault());
