// Learners Portal for Windows.
//
// The phone apps (Capacitor, frontend/mobile) bundle the frontend; Windows has no Capacitor
// target, so this opens the live portal in its own window instead. It always shows the current
// website, so it never needs rebuilding for a portal change, and the website's cookie login works.
//
// First start shows the front door (the three schools); after that it reopens the school last used.
const { app, BrowserWindow, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const FRONT_DOOR = 'https://learnerspreschool.cloud';
const PORTAL_HOSTS = [
  'learnerspreschool.cloud',
  'www.learnerspreschool.cloud',
  'portal.learnersacademy.com.pk',
  'junior.learnersacademy.com.pk',
  'portal.marlbridge.com',
];
// The front door is only a chooser, so it is never remembered as "the school".
const SCHOOL_HOSTS = PORTAL_HOSTS.slice(2);

const stateFile = path.join(app.getPath('userData'), 'last-school.json');

function readLastSchool() {
  try {
    const { origin } = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return SCHOOL_HOSTS.includes(new URL(origin).hostname) ? origin : null;
  } catch {
    return null;
  }
}

function saveLastSchool(origin) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify({ origin }));
  } catch {
    // Not remembering the school only means the front door shows next time.
  }
}

function isPortal(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && PORTAL_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    title: 'Learners Portal',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  // Links to other sites (Teams, WhatsApp, ...) open in the normal browser; portal links that
  // ask for a new tab (target="_blank", e.g. take/grade an assessment) open in a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isPortal(url) || url.startsWith('blob:')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isPortal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.on('did-navigate', (_event, url) => {
    const u = new URL(url);
    if (SCHOOL_HOSTS.includes(u.hostname)) saveLastSchool(u.origin);
  });

  win.loadURL(readLastSchool() ?? FRONT_DOOR);
  return win;
}

// A small menu (Alt shows it): reload, zoom, and a way back to the three schools.
function buildMenu() {
  const template = [
    {
      label: 'Portal',
      submenu: [
        {
          label: 'Change school',
          click: (_item, win) => win && win.loadURL(FRONT_DOOR),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Back', accelerator: 'Alt+Left', click: (_i, win) => win && win.webContents.navigationHistory.goBack() },
        { label: 'Forward', accelerator: 'Alt+Right', click: (_i, win) => win && win.webContents.navigationHistory.goForward() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Opening a second copy just brings the first one forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    buildMenu();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
