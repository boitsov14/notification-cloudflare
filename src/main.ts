import type { RateLimit } from '@cloudflare/workers-types'
import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare'
import { Hono } from 'hono'
import { GeoMiddleware, getGeo } from 'hono-geo-middleware'
import { bodyLimit } from 'hono/body-limit'
import { logger } from 'hono/logger'
import ky from 'ky'
import { z } from 'zod'

type Bindings = {
  readonly DISCORD_URL: string
  readonly RATE_LIMITER: RateLimit
}

// biome-ignore lint/style/useNamingConvention:
const app = new Hono<{ Bindings: Bindings }>()

// log requests
app.use(logger())

// handle errors
app.onError((err, c) => {
  console.error(err)
  return c.text('An unexpected error occurred.', 500)
})

// rate limiter
app.use(
  // biome-ignore lint/style/useNamingConvention:
  cloudflareRateLimiter<{ Bindings: Bindings }>({
    rateLimitBinding: c => c.env.RATE_LIMITER,
    keyGenerator: () => '',
  }),
)

// get geolocation
app.use('/*', GeoMiddleware())

app.post('/text', async c => {
  // get text
  const text = await c.req.text()
  // get geolocation
  const { countryCode, region, city } = getGeo(c)
  // set content
  const content =
    `@everyone\n${countryCode} ${region} ${city}\n${text}`.substring(0, 2000)
  // log content
  console.info(content)
  // send to discord
  await ky.post(c.env.DISCORD_URL, { json: { content: content } })
  // return 200
  return c.text('ok')
})

app.post('/file', bodyLimit({ maxSize: 8 * 1024 * 1024 }), async c => {
  // get multipart data
  const body = await c.req.parseBody()
  // get file
  // biome-ignore lint/complexity/useLiteralKeys:
  const file = body['file'] as File
  z.instanceof(File).parse(file)
  // get geolocation
  const { countryCode, region, city } = getGeo(c)
  // set content
  const content = `@everyone\n${countryCode} ${region} ${city}`.substring(
    0,
    2000,
  )
  // log content
  console.info(content)
  // read file as buffer
  const buffer = await file.arrayBuffer()
  // create Blob
  const blob = new Blob([buffer])
  // create FormData
  const formData = new FormData()
  // attach content
  formData.append('content', content)
  // attach file
  formData.append('file', blob, file.name)
  // send to discord
  await ky.post(c.env.DISCORD_URL, { body: formData })
  // return 200
  return c.text('ok')
})

// TODO: add more routes
// path: /latex
// get latex code and render it to png and send it to discord

export default app
