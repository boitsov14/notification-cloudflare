import type { RateLimit } from '@cloudflare/workers-types'
import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare'
import { Hono } from 'hono'
import { GeoMiddleware, getGeo } from 'hono-geo-middleware'
import { env } from 'hono/adapter'
import { logger } from 'hono/logger'
import ky from 'ky'

type Env = {
  readonly DISCORD_URL: string
  readonly RATE_LIMITER: RateLimit
  readonly LATEX_URL: string
}

// constants
const DISCORD_CONTENT_LIMIT = 2000
const DISCORD_FILE_SIZE_LIMIT = 8 * 1024 * 1024 // 8MB

const app = new Hono()
// log requests
app.use(logger())
// handle errors
app.onError(async (err, c) => {
  console.error(`Unexpected error: ${err}`)
  await ky.post(env<Env>(c).DISCORD_URL, {
    json: { content: '@everyone\nUnexpected error: discord-notification' },
    throwHttpErrors: false,
  })
  return c.text('Unexpected error', 500)
})
// rate limiter
app.use(
  cloudflareRateLimiter({
    rateLimitBinding: c => env<Env>(c).RATE_LIMITER,
    keyGenerator: () => '',
  }),
)
// get geolocation
app.use('/*', GeoMiddleware())

app.post('/text', async c => {
  // check Content-Type is text/plain
  if (c.req.header('Content-Type') !== 'text/plain') {
    console.error('Invalid Content-Type')
    return c.text('Invalid Content-Type', 400)
  }
  // get text
  const text = await c.req.text()
  // get geolocation
  const { countryCode, region, city } = getGeo(c)
  // set content
  const content =
    `@everyone\n${countryCode} ${region} ${city}\n${text}`.substring(
      0,
      DISCORD_CONTENT_LIMIT,
    )
  // log content
  console.info(content)
  // send to discord
  console.info('Sending to discord')
  await ky.post(env<Env>(c).DISCORD_URL, { json: { content: content } })
  console.info('Success!')
  return c.text('ok')
})

app.post('/svg', async c => {
  // check Content-Type is image/svg+xml
  if (c.req.header('Content-Type') !== 'image/svg+xml') {
    console.error('Invalid Content-Type')
    return c.text('Invalid Content-Type', 400)
  }
  // get svg
  const svg = await c.req.text()
  // check size
  if (svg.length > DISCORD_FILE_SIZE_LIMIT) {
    console.error('File size too large')
    return c.text('File size too large', 400)
  }
  // create FormData
  const formData = new FormData()
  // attach file
  formData.append('file', new Blob([svg]), 'out.svg')
  // get geolocation
  const { countryCode, region, city } = getGeo(c)
  // set content
  const content = `@everyone\n${countryCode} ${region} ${city}`
  // log content
  console.info(content)
  // attach content
  formData.append('content', content)
  // send to discord
  console.info('Sending to discord')
  await ky.post(env<Env>(c).DISCORD_URL, { body: formData })
  console.info('Success!')
  return c.text('ok')
})

app.post('/tex-to-png', async c => {
  // check Content-Type is application/x-tex
  if (c.req.header('Content-Type') !== 'application/x-tex') {
    console.error('Invalid Content-Type')
    return c.text('Invalid Content-Type', 400)
  }
  // get tex
  const tex = await c.req.text()
  // get png
  console.info('Sending to latex server')
  const res = await ky.post(env<Env>(c).LATEX_URL, {
    headers: { 'Content-Type': 'application/x-tex' },
    body: tex,
  })
  // get png
  const png = await res.arrayBuffer()
  console.info('Success!')
  // check size
  if (png.byteLength > DISCORD_FILE_SIZE_LIMIT) {
    console.error('File size too large')
    return c.text('File size too large', 400)
  }
  // create FormData
  const formData = new FormData()
  // attach file
  formData.append('file', new Blob([png]), 'out.png')
  // get geolocation
  const { countryCode, region, city } = getGeo(c)
  // set content
  const content = `@everyone\n${countryCode} ${region} ${city}`
  // log content
  console.info(content)
  // attach content
  formData.append('content', content)
  // send to discord
  console.info('Sending to discord')
  await ky.post(env<Env>(c).DISCORD_URL, { body: formData })
  console.info('Success!')
  return c.text('ok')
})

export default app
