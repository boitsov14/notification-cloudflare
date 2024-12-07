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
  return c.text('An unexpected error occurred.', 500)
})

app.post('/', async c => {
  // rate limit
  const { success } = await c.env.RATE_LIMITER.limit({ key: c.env.DISCORD_URL })
  if (!success) {
    return c.text('Rate limit exceeded', 429)
  }

  // get body
  const { source, message } = await c.req.json()

  // get geolocation
  const { cf } = c.req.raw as { cf?: IncomingRequestCfProperties }
  const { country, region, city } = cf || {}

  // set content
  const content =
    `${source}\n${country} ${region} ${city}\n${message}`.substring(0, 1000)

  // send to discord
  // todo
  // biome-ignore lint/suspicious/noConsoleLog:
  console.log(content)

  // return 200
  return c.text('ok')
})

export default app
