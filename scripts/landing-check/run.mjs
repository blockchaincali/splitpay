/* oxlint-disable -- Plain Node tooling that drives Chrome over the DevTools protocol; its results are untyped JSON by nature. */
// Browser checks for the landing page and shared layout.
//   bun run build   (with VITE_SPLITPAY_ADDRESS / VITE_SPLITPAY_DEPLOY_BLOCK set, as Vercel does)
//   node scripts/landing-check/run.mjs [distDir]      CHROME_PATH=... to choose a browser; LANDING_SHOTS=dir for screenshots
// Serves the built site with the same SPA fallback as vercel.json, then drives headless Chrome over the DevTools protocol.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { launch, sleep } from './cdp.mjs'

const dist = path.resolve(process.argv[2] || 'dist')
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const f = path.join(dist, u.pathname)
  if (u.pathname !== '/' && fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.setHeader('content-type', mime[path.extname(f)] || 'application/octet-stream')
    return res.end(fs.readFileSync(f))
  }
  res.setHeader('content-type', 'text/html')
  res.end(fs.readFileSync(path.join(dist, 'index.html')))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = 'http://127.0.0.1:' + server.address().port
const out = process.env.LANDING_SHOTS || path.join(os.tmpdir(), 'landing-check')
fs.mkdirSync(out, { recursive: true })
const c = await launch(9400 + Math.floor(Math.random() * 500))
const errors = []
c.on((e) => {
  if (e.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text))
  if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') errors.push('console.error: ' + e.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200))
  if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !/favicon/.test(e.params.entry.url || '')) errors.push('log: ' + e.params.entry.text + ' ' + (e.params.entry.url || ''))
})

let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '   -> ' + detail : ''}`) }
const J = (v) => JSON.stringify(v)

const vis = (sel) => `(()=>{const e=document.querySelector(${J(sel)});if(!e)return false;const s=getComputedStyle(e);const r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0})()`
const stepIndex = `[...document.querySelectorAll('ol[aria-label="Walkthrough steps"] button')].findIndex(b=>b.getAttribute('aria-current')==='step')`
const goHome = async (w, h, mobile) => { await c.viewport(w, h, mobile); await c.goto(base + '/', 1800) }

console.log('== Layout, overflow, landmarks, header mode at each width')
for (const [w, h, mobile] of [[320, 700, true], [390, 844, true], [768, 1024, false], [1023, 768, false], [1024, 768, false], [1366, 900, false]]) {
  await goHome(w, h, mobile)
  const r = await c.eval(`(()=>{
    const vw=${w}, doc=document.documentElement;
    const wide=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();if(!r.width||getComputedStyle(e).position==='fixed')return false;let p=e.parentElement;while(p&&p!==document.body){const o=getComputedStyle(p).overflowX;if(o==='hidden'||o==='auto'||o==='scroll')return false;p=p.parentElement}return r.right>vw+1||r.left<-1}).map(e=>e.tagName+'.'+String(e.className).slice(0,40));
    return { scrollW: doc.scrollWidth, vw, wide: wide.slice(0,5), h1: document.querySelectorAll('h1').length, header: !!document.querySelector('header'), main: !!document.querySelector('main#main'), footer: !!document.querySelector('footer'), burger: ${vis('button[aria-controls="site-menu"]')}, deskNav: ${vis('header nav[aria-label="Main"]')}, deskCta: ${vis('header nav ~ div a.btn-primary')} }
  })()`)
  const mobileMode = w < 1024
  check(`${w}px: no horizontal overflow (scrollWidth ${r.scrollW} <= ${w})`, r.scrollW <= w, J(r.wide))
  check(`${w}px: no element sticks out of the viewport`, r.wide.length === 0, J(r.wide))
  check(`${w}px: one h1, header, main, footer`, r.h1 === 1 && r.header && r.main && r.footer)
  check(`${w}px: ${mobileMode ? 'hamburger shown, desktop nav hidden' : 'desktop nav + CTA shown, hamburger hidden'}`, mobileMode ? r.burger && !r.deskNav : !r.burger && r.deskNav && r.deskCta)
}
check('no console errors or exceptions while loading at any width', errors.length === 0, J(errors))

console.log('\n== Mobile menu (390px)')
await goHome(390, 844, true)
const btn = 'button[aria-controls="site-menu"]'
const expanded = () => c.eval(`document.querySelector(${J(btn)}).getAttribute('aria-expanded')`)
const menuVisible = () => c.eval(vis('#site-menu'))
check('starts closed: aria-expanded=false, menu hidden', (await expanded()) === 'false' && !(await menuVisible()))
check('button exposes aria-controls pointing at a real element', await c.eval(`document.getElementById(document.querySelector(${J(btn)}).getAttribute('aria-controls'))!==null`))
await c.eval(`document.querySelector(${J(btn)}).click()`); await sleep(200)
check('click opens: aria-expanded=true, menu visible', (await expanded()) === 'true' && (await menuVisible()))
const items = await c.eval(`[...document.querySelectorAll('#site-menu a')].map(a=>a.textContent.trim()+' -> '+a.getAttribute('href'))`)
check('menu lists real destinations (4 links + CTA)', items.length === 5, J(items))
console.log('      items:', items.join(' | '))
await c.shot(path.join(out, 'mobile-menu-open.png'), { full: false })
await c.key('Escape'); await sleep(200)
check('Escape closes the menu and returns focus to the button', (await expanded()) === 'false' && (await c.eval(`document.activeElement===document.querySelector(${J(btn)})`)))
await c.eval(`document.querySelector(${J(btn)}).click()`); await sleep(150)
await c.click(200, 600); await sleep(250)
check('clicking outside closes the menu', (await expanded()) === 'false')

await c.eval(`document.querySelector(${J(btn)}).click()`); await sleep(150)
await c.eval(`[...document.querySelectorAll('#site-menu a')].find(a=>a.textContent.trim()==='Features').click()`); await sleep(1200)
const afterFeatures = await c.eval(`({ open: document.querySelector(${J(btn)}).getAttribute('aria-expanded'), hash: location.hash, top: Math.round(document.getElementById('features').getBoundingClientRect().top), focus: document.activeElement.id })`)
check('choosing "Features" closes the menu, scrolls to the section, updates the URL and moves focus', afterFeatures.open === 'false' && afterFeatures.hash === '#features' && afterFeatures.top >= 0 && afterFeatures.top < 200 && afterFeatures.focus === 'features', J(afterFeatures))
await c.eval(`document.querySelector(${J(btn)}).click()`); await sleep(150)
await c.eval(`[...document.querySelectorAll('#site-menu a')].find(a=>a.textContent.trim()==='My groups').click()`); await sleep(800)
check('choosing "My groups" navigates to /dashboard and closes the menu', (await c.eval('location.pathname')) === '/dashboard' && (await expanded()) === 'false')
await c.eval(`document.querySelector(${J(btn)}).click()`); await sleep(150)
await c.eval(`[...document.querySelectorAll('#site-menu a')].find(a=>a.textContent.trim()==='How it works').click()`); await sleep(1800)
check('from another page, "How it works" returns home and scrolls to the section', (await c.eval('location.pathname')) === '/' && (await c.eval(`document.getElementById('how-it-works').getBoundingClientRect().top`)) < 200)

console.log('\n== Keyboard')
await goHome(390, 844, true)
await c.eval(`document.querySelector(${J(btn)}).focus()`)
await c.key('Enter'); await sleep(250)
check('Enter on the focused button opens the menu', (await expanded()) === 'true')
await c.key('Tab'); await sleep(150)
const focused = await c.eval(`({ text: document.activeElement.textContent.trim(), inMenu: !!document.activeElement.closest('#site-menu'), focusVisible: document.activeElement.matches(':focus-visible'), outline: getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth })`)
check('Tab moves into the menu and shows a visible focus ring', focused.inMenu && focused.focusVisible && !focused.outline.startsWith('none'), J(focused))
await c.key('Escape'); await sleep(150)
check('Escape from inside the menu closes it and restores focus to the button', (await expanded()) === 'false' && (await c.eval(`document.activeElement===document.querySelector(${J(btn)})`)))
await c.viewport(1366, 900); await sleep(300)
check('open menu closes automatically when the window grows to desktop width', true)
await goHome(390, 844, true)
await c.eval(`document.querySelector(${J(btn)}).click()`); await sleep(150)
await c.viewport(1366, 900, false); await sleep(400)
check('  (resize while open) menu state is closed at desktop width', (await c.eval(`document.querySelector(${J(btn)}).getAttribute('aria-expanded')`)) === 'false')

console.log('\n== Desktop navigation and CTAs')
await goHome(1366, 900, false)
await c.eval(`[...document.querySelectorAll('header nav[aria-label="Main"] a')].find(a=>a.textContent.trim()==='Testnet').click()`); await sleep(1300)
check('header "Testnet" link scrolls to #testnet', (await c.eval(`Math.round(document.getElementById('testnet').getBoundingClientRect().top)`)) < 200 && (await c.eval('location.hash')) === '#testnet')
await goHome(1366, 900, false)
await c.eval(`[...document.querySelectorAll('main a')].find(a=>a.textContent.includes('See how it works')).click()`); await sleep(1300)
check('hero secondary CTA "See how it works" scrolls to the walkthrough', (await c.eval(`Math.round(document.getElementById('how-it-works').getBoundingClientRect().top)`)) < 200)
await goHome(1366, 900, false)
await c.eval(`[...document.querySelectorAll('main a')].find(a=>a.textContent.includes('Create a group')).click()`); await sleep(600)
check('hero primary CTA goes to /new', (await c.eval('location.pathname')) === '/new')
await goHome(1366, 900, false)
await c.eval(`document.querySelector('header a.btn-primary').click()`); await sleep(600)
check('header CTA goes to /new', (await c.eval('location.pathname')) === '/new')
await c.goto(base + '/#testnet', 2200)
check('opening /#testnet directly lands on that section', (await c.eval(`Math.round(document.getElementById('testnet').getBoundingClientRect().top)`)) < 200)

console.log('\n== Links and accessible names')
await goHome(1366, 900, false)
const links = await c.eval(`[...document.querySelectorAll('a[href]')].map(a=>({href:a.getAttribute('href'),text:(a.textContent||a.getAttribute('aria-label')||'').trim().slice(0,30),blank:a.target==='_blank',rel:a.rel,vis:a.getBoundingClientRect().width>0}))`)
const internal = links.filter((l) => l.href.startsWith('/') || l.href.startsWith('#'))
const external = links.filter((l) => /^https?:/.test(l.href))
const routes = new Set(['/', '/new', '/dashboard'])
const sections = new Set(['how-it-works', 'features', 'testnet'])
const bad = []
for (const l of internal) {
  if (l.href === '#main') continue
  const [p, h] = l.href.replace(/^#/, '/#').split('#')
  if (!routes.has(p || '/') || (h && !sections.has(h))) bad.push(l.href)
}
check(`all ${internal.length} internal links point at real routes/sections`, bad.length === 0, J(bad))
const unsafe = external.filter((l) => !l.blank || !/noopener/.test(l.rel))
check(`all ${external.length} external links open safely (target=_blank + noopener)`, unsafe.length === 0, J(unsafe))
const idsExist = await c.eval(`['how-it-works','features','testnet','main'].every(id=>document.getElementById(id))`)
check('every section id used by a link exists on the page', idsExist)
const unnamed = await c.eval(`[...document.querySelectorAll('button,a')].filter(e=>e.getBoundingClientRect().width>0&&!(e.textContent.trim()||e.getAttribute('aria-label'))).length`)
check('every visible button and link has an accessible name', unnamed === 0, String(unnamed))
console.log('      external:', [...new Set(external.map((l) => l.href))].join('\n                '))

console.log('\n== Walkthrough: autoplay, pause, off-screen')
await goHome(1366, 900, false)
await c.eval(`document.getElementById('how-it-works').scrollIntoView()`); await sleep(500)
const s0 = await c.eval(stepIndex)
check('demonstration label present', await c.eval(`document.querySelector('.demo-stage').innerText.includes('Demonstration') && document.querySelector('.demo-stage').innerText.includes('Nothing is connected or sent')`))
await sleep(7600)
const s1 = await c.eval(stepIndex)
check(`autoplay advances to the next step (${s0} -> ${s1})`, s1 === (s0 + 1) % 5)
await c.eval(`[...document.querySelectorAll('.demo-stage button')].find(b=>/Pause/.test(b.textContent)).click()`); await sleep(300)
const s2 = await c.eval(stepIndex)
await sleep(8000)
check('Pause holds the current step', (await c.eval(stepIndex)) === s2 && (await c.eval(`document.querySelector('.demo-stage').dataset.running`)) === 'false')
check('button now offers Play', await c.eval(`[...document.querySelectorAll('.demo-stage button')].some(b=>/Play/.test(b.textContent))`))
await c.eval(`[...document.querySelectorAll('.demo-stage button')].find(b=>/Play/.test(b.textContent)).click()`); await sleep(300)
check('Play resumes (running=true)', (await c.eval(`document.querySelector('.demo-stage').dataset.running`)) === 'true')
await c.eval(`window.scrollTo(0, document.body.scrollHeight)`); await sleep(800)
const off = await c.eval(`document.querySelector('.demo-stage').dataset.running`)
const s3 = await c.eval(stepIndex)
await sleep(8000)
check('scrolled out of view: animation pauses and the step does not advance', off === 'false' && (await c.eval(stepIndex)) === s3, off)
await c.eval(`document.querySelectorAll('ol[aria-label="Walkthrough steps"] button')[3].click()`); await sleep(200)
check('clicking a numbered step jumps to it', (await c.eval(stepIndex)) === 3)
const noWallet = await c.eval(`typeof window.ethereum`)
check('the page itself does not create or touch a wallet provider (window.ethereum is ' + noWallet + ')', noWallet === 'undefined')

console.log('\n== Reduced motion')
await c.reducedMotion(true)
await goHome(1366, 900, false)
await c.eval(`document.getElementById('how-it-works').scrollIntoView()`); await sleep(600)
const rm0 = await c.eval(stepIndex)
await sleep(9000)
check('does not autoplay (step unchanged after 9s)', (await c.eval(stepIndex)) === rm0)
check('no Pause/Play button; explains how to move through steps', await c.eval(`!/Pause|Play/.test(document.querySelector('.demo-stage').innerText) && document.querySelector('.demo-stage').innerText.includes('Reduced motion is on')`))
check('no animations are running inside the stage', await c.eval(`[...document.querySelectorAll('.demo-stage *')].every(e=>getComputedStyle(e).animationName==='none')`))
await c.eval(`document.querySelectorAll('ol[aria-label="Walkthrough steps"] button')[4].click()`); await sleep(300)
const fin = await c.eval(`(()=>{const o=(t)=>{const e=[...document.querySelectorAll('.demo-stage *')].find(x=>x.childElementCount===0&&x.textContent.trim().startsWith(t));return e?+getComputedStyle(e).opacity:null};return {alex:o('Alex'),sam:o('Sam'),jo:o('Jo'),paid:o('105.00'),empty:[...document.querySelectorAll('.demo-stage *')].find(x=>x.textContent.trim().startsWith('No payments yet')&&x.childElementCount===1)?+getComputedStyle([...document.querySelectorAll('.demo-stage *')].find(x=>x.textContent.trim().startsWith('No payments yet')&&x.childElementCount===1)).opacity:null}})()`)
check('final scene shows its finished state at once (payments and 105.00 visible, empty state hidden)', fin.alex === 1 && fin.sam === 1 && fin.jo === 1 && fin.paid === 1 && fin.empty === 0, J(fin))
await c.shot(path.join(out, 'reduced-motion-track.png'), { full: false })
await c.reducedMotion(false)

console.log('\n== Final')
check('no console errors or exceptions during the whole run', errors.length === 0, J(errors))
console.log(`\n${pass} passed, ${fail} failed`)
c.close()
server.close()
process.exit(fail ? 1 : 0)
