# Universal Media Extractor - Electron Desktop App

This project can be run as a native Windows desktop app using Electron.

## Development

```bash
npm install
npm run electron:dev
```

This starts the Node server plus the Vite client and loads the app in Electron.

## Production build

```bash
npm run dist:win
```

This generates a Windows installer and portable app in `dist-electron/`.

## Notes

- The app starts the backend server automatically on launch.
- The client loads from the local server URL.
- The generated install is a standard Windows `.exe` installer.
