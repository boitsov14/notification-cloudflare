import type { IncomingRequestCfProperties } from '@cloudflare/workers-types'
import { Hono } from 'hono'

type Bindings = {
  X_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.onError((err, c) => {
  console.log(err)
  return c.json({ error: 'An unexpected error occurred.' }, 500)
})

app.get('/', c => {
  const { cf } = c.req.raw as unknown as { cf?: IncomingRequestCfProperties }

  const geolocation = {
    country: cf?.country,
    region: cf?.region,
    city: cf?.city,
    key: c.env.X_API_KEY,
    hi: 'Hello',
  }

  return c.json(geolocation)
})

export default app
