import type { IncomingRequestCfProperties } from '@cloudflare/workers-types'
import { Hono } from 'hono'
import { logger } from 'hono/logger'

type Bindings = {
  readonly DISCORD_URL: string
  // biome-ignore lint/suspicious/noExplicitAny:
  readonly RATE_LIMITER: any
}

// biome-ignore lint/style/useNamingConvention:
const app = new Hono<{ Bindings: Bindings }>()

app.use(logger())

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'An unexpected error occurred.' }, 500)
})

app.get('/', async c => {
  // rate limit
  const { success } = await c.env.RATE_LIMITER.limit({ key: c.env.DISCORD_URL })
  if (!success) {
    return c.json({ error: 'Rate limit exceeded' }, 429)
  }

  // get geolocation
  const { cf } = c.req.raw as { cf?: IncomingRequestCfProperties }
  const { country, region, city } = cf || {}

  const geolocation = {
    country,
    region,
    city,
    hi: 'Hello',
  }

  return c.json(geolocation)
})

export default app
