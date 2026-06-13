import { chromium } from 'playwright-core'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const out = process.argv[2] || 'shot'
const url = process.argv[3] || 'http://localhost:5173/'
const wait = Number(process.argv[4] || 1800)
const showTour = process.argv[5] === 'tour'

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } })
if (!showTour) await page.addInitScript(() => localStorage.setItem('de_tour_seen', '1'))
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(wait)
await page.screenshot({ path: `${out}.png`, fullPage: true })
console.log('shot', out, '| page errors:', errors.length)
errors.slice(0, 6).forEach((e) => console.log('  ', e))
await browser.close()
