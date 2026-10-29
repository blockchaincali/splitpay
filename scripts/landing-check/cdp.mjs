/* oxlint-disable -- Plain Node tooling that drives Chrome over the DevTools protocol; its results are untyped JSON by nature. */
// Minimal Chrome DevTools Protocol helper: launch headless Chrome, open a page, return a small API.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
export const CHROME = CANDIDATES.find((p) => p && fs.existsSync(p))
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch(port) {
  if (!CHROME) throw new Error('Chrome not found. Set CHROME_PATH to a Chrome or Chromium executable.')
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-'))
  const child = spawn(CHROME, ['--headless=new', '--disable-gpu', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  await sleep(2500)
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (m) => {
    const e = JSON.parse(m.data)
    if (e.id && pending.has(e.id)) { const { res, rej } = pending.get(e.id); pending.delete(e.id); e.error ? rej(new Error(e.error.message)) : res(e.result); return }
    for (const l of listeners) l(e)
  }
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable')

  const api = {
    send,
    on: (fn) => listeners.push(fn),
    async goto(url, wait = 1500) { await send('Page.navigate', { url }); await sleep(wait) },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    },
    async viewport(width, height, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
    },
    async shot(file, { full = true, clip } = {}) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
    async key(key, code = key) {
      await send('Input.dispatchKeyEvent', { type: key === 'Enter' ? 'keyDown' : 'rawKeyDown', key, code, ...(key === 'Enter' ? { text: String.fromCharCode(13) } : {}), windowsVirtualKeyCode: { Escape: 27, Tab: 9, Enter: 13, ' ': 32 }[key] ?? 0 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code })
    },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    },
    async reducedMotion(on) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }] })
    },
    close() { try { ws.close() } catch { /* */ } child.kill(); try { fs.rmSync(prof, { recursive: true, force: true }) } catch { /* */ } },
  }
  return api
}
