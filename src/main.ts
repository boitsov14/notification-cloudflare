import type { RateLimit } from '@cloudflare/workers-types'
import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare'
import { type Context, Hono } from 'hono'
import { GeoMiddleware, getGeo } from 'hono-geo-middleware'
import { env } from 'hono/adapter'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import _ky from 'ky'

// environment variables
type Env = {
  readonly DISCORD_URL: string
  readonly RATE_LIMITER: RateLimit
  readonly LATEX_URL: string
}

// constants
const DISCORD_CONTENT_LIMIT = 2000

// override ky
const ky = _ky.create({
  retry: { methods: ['post'] },
  hooks: { afterResponse: [() => console.info('Success')] },
})

const app = new Hono()
// log requests
app.use(logger())
// rate limiter
app.use(
  cloudflareRateLimiter({
    rateLimitBinding: c => env<Env>(c).RATE_LIMITER,
    keyGenerator: () => '',
  }),
)
// set CORS
app.use('*', cors())
// use GeoMiddleware
app.use(GeoMiddleware())

app.post('/text', async c => {
  // get text
  const text = await c.req.text()
  const main = async () => {
    try {
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
    } catch (err) {
      await handleError(err, c)
    }
  }
  c.executionCtx.waitUntil(main())
  return c.text('ok')
})

app.post('/tex-to-png', async c => {
  // get tex
  const tex = await c.req.text()
  const main = async () => {
    try {
      // send to latex server
      console.info('Sending to latex server')
      const response = await ky.post(env<Env>(c).LATEX_URL, { body: tex })
      // check content type
      if (response.headers.get('content-type') !== 'image/png') {
        // get text
        const text = await response.text()
        console.error(text)
        console.info('Sending error to discord')
        const content = `@everyone\ndiscord-notification: ${text}`
        await ky.post(env<Env>(c).DISCORD_URL, { json: { content: content } })
        return
      }
      const png = await response.blob()
      // create FormData
      const formData = new FormData()
      // attach content
      formData.append('content', '@everyone')
      // attach file
      formData.append('file', png, 'out.png')
      // send to discord
      console.info('Sending to discord')
      await ky.post(env<Env>(c).DISCORD_URL, { body: formData })
    } catch (err) {
      await handleError(err, c)
    }
  }
  c.executionCtx.waitUntil(main())
  return c.text('ok')
})

const handleError = async (err: unknown, c: Context) => {
  console.error(`Unexpected error: ${err}`)
  console.info('Sending error to discord')
  const content = '@everyone\ndiscord-notification: Unexpected error'
  await ky.post(env<Env>(c).DISCORD_URL, { json: { content: content } })
}

export default app
