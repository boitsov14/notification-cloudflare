import type { IncomingRequestCfProperties } from '@cloudflare/workers-types'
import { Hono } from 'hono'
import { logger } from 'hono/logger'

type Bindings = {
  readonly X_API_KEY: string
}

// biome-ignore lint/style/useNamingConvention:
const app = new Hono<{ Bindings: Bindings }>()
app.use(logger())

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'An unexpected error occurred.' }, 500)
})

app.get('/', async c => {
  const { cf } = c.req.raw as { cf?: IncomingRequestCfProperties }
  const { country, region, city } = cf || {}

  const geolocation = {
    country,
    region,
    city,
    key: c.env.X_API_KEY,
    hi: 'Hello',
  }

  // throw new Error('An error occurred')
  // wait 1 seconds
  await new Promise(resolve => setTimeout(resolve, 1000))

  return c.json(geolocation)
})

export default app
