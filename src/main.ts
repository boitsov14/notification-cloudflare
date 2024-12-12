import type { RateLimit } from '@cloudflare/workers-types'
import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare'
import { Hono } from 'hono'
import { GeoMiddleware, getGeo } from 'hono-geo-middleware'
import { env } from 'hono/adapter'
import { bodyLimit } from 'hono/body-limit'
import { logger } from 'hono/logger'
import ky from 'ky'
import { z } from 'zod'

type Env = {
  readonly DISCORD_URL: string
  readonly RATE_LIMITER: RateLimit
}

const app = new Hono()
// log requests
app.use(logger())
// handle errors
app.onError(async (err, c) => {
  console.error(err)
  const text = 'An unexpected error occurred: Could not send to Discord.'
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
  await ky.post(env<Env>(c).DISCORD_URL, { json: { content: content } })
  // return 200
  return c.text('ok')
})

app.post('/file', bodyLimit({ maxSize: 8 * 1024 * 1024 }), async c => {
  // get multipart data
  const body = await c.req.parseBody()
  // get file
  const { file } = z.object({ file: z.instanceof(File) }).parse(body)
  // if file is tex
  if (file.name.endsWith('.tex')) {
    // TODO: compile tex
  }
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
  await ky.post(env<Env>(c).DISCORD_URL, { body: formData })
  // return 200
  return c.text('ok')
})

export default app
