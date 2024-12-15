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
}

// constants
const DISCORD_CONTENT_LIMIT = 2000
const DISCORD_FILE_SIZE_LIMIT = 8 * 1024 * 1024

const app = new Hono()
// log requests
app.use(logger())
// handle errors
app.onError(async (err, c) => {
  console.error(err)
  const text = 'Unexpected error: Could not send to Discord.'
  await ky.post(env<Env>(c).DISCORD_URL, {
    json: { content: `@everyone\n${text}` },
    throwHttpErrors: false,
  })
  return c.text(text, 500)
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
    const text = 'Invalid Content-Type'
    console.error(text)
    return c.text(text, 400)
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
  await ky.post(env<Env>(c).DISCORD_URL, { json: { content: content } })
  // return 200
  return c.text('ok')
})

app.post('/svg', async c => {
  // check Content-Type is image/svg+xml
  if (c.req.header('Content-Type') !== 'image/svg+xml') {
    const text = 'Invalid Content-Type'
    console.error(text)
    return c.text(text, 400)
  }
  // get svg
  const svg = await c.req.text()
  // check size
  if (svg.length > DISCORD_FILE_SIZE_LIMIT) {
    const text = 'File size too large'
    console.error(text)
    return c.text(text, 400)
  }
  // create Blob
  const blob = new Blob([svg])
  // create FormData
  const formData = new FormData()
  // attach file
  formData.append('file', blob, 'out.svg')
  // get geolocation
  const { countryCode, region, city } = getGeo(c)
  // set content
  const content = `@everyone\n${countryCode} ${region} ${city}`
  // log content
  console.info(content)
  // attach content
  formData.append('content', content)
  // send to discord
  await ky.post(env<Env>(c).DISCORD_URL, { body: formData })
  // return 200
  return c.text('ok')
})

export default app
