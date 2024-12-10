import type { RateLimit } from '@cloudflare/workers-types'
import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare'
import { Hono } from 'hono'
import { GeoMiddleware, getGeo } from 'hono-geo-middleware'
import { logger } from 'hono/logger'

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
  // get message
  const { message } = await c.req.json()

  // get geolocation
  const { countryCode, region, city } = getGeo(c)

  // set content
  const content = `${countryCode} ${region} ${city}\n${message}`.substring(
    0,
    1000,
  )

  // send to discord
  // todo
  // biome-ignore lint/suspicious/noConsoleLog:
  console.log(content)

  // return 200
  return c.text('ok')
})

export default app
