import type { RateLimit } from '@cloudflare/workers-types'
import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare'
import { Hono } from 'hono'
import { GeoMiddleware, getGeo } from 'hono-geo-middleware'
import { logger } from 'hono/logger'
import ky from 'ky'

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

app.post('/', async c => {
  // get text
  const text = await c.req.text()

  // get geolocation
  const { countryCode, region, city } = getGeo(c)

  // set content
  const content =
    `@everyone\n${countryCode} ${region} ${city}\n${text}`.substring(0, 1000)

  // log content
  console.info(content)

  // send to discord
  await ky.post(c.env.DISCORD_URL, { json: { content: content } })

  // return 200
  return c.text('ok')
})

export default app
