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
  readonly LATEX_URL: string
}

// constants
const DISCORD_CONTENT_LIMIT = 2000
const DISCORD_FILE_SIZE_LIMIT = 8 * 1024 * 1024 // 8MB

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
// get geolocation
app.use('/*', GeoMiddleware())

app.post('/text', c => {
  const main = async () => {
    try {
      // check Content-Type is text/plain
      if (c.req.header('Content-Type') !== 'text/plain') {
        console.error('Invalid Content-Type')
        return
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
      console.info('Sending to discord')
      await ky.post(env<Env>(c).DISCORD_URL, { json: { content: content } })
      console.info('Success!')
    } catch (err) {
      await handleError(err, env<Env>(c).DISCORD_URL)
    }
  }
  c.executionCtx.waitUntil(main())
  return c.text('ok')
})

app.post('/svg', c => {
  const main = async () => {
    try {
      // check Content-Type is image/svg+xml
      if (c.req.header('Content-Type') !== 'image/svg+xml') {
        console.error('Invalid Content-Type')
        return
      }
      // get geolocation
      const { countryCode, region, city } = getGeo(c)
      // set content
      const content = `@everyone\n${countryCode} ${region} ${city}`
      // log content
      console.info(content)
      // get svg
      const svg = await c.req.text()
      // check size
      if (svg.length > DISCORD_FILE_SIZE_LIMIT) {
        await handleFileTooLarge(content, env<Env>(c).DISCORD_URL)
        return
      }
      // create FormData
      const formData = new FormData()
      // attach file
      formData.append('file', new Blob([svg]), 'out.svg')
      // attach content
      formData.append('content', content)
      // send to discord
      console.info('Sending to discord')
      await ky.post(env<Env>(c).DISCORD_URL, { body: formData })
      console.info('Success!')
    } catch (err) {
      await handleError(err, env<Env>(c).DISCORD_URL)
    }
  }
  c.executionCtx.waitUntil(main())
  return c.text('ok')
})

app.post('/tex-to-png', c => {
  const main = async () => {
    try {
      // check Content-Type is application/x-tex
      if (c.req.header('Content-Type') !== 'application/x-tex') {
        console.error('Invalid Content-Type')
        return
      }
      // get geolocation
      const { countryCode, region, city } = getGeo(c)
      // set content
      const content = `@everyone\n${countryCode} ${region} ${city}`
      // log content
      console.info(content)
      // get tex
      const tex = await c.req.text()
      // get png
      console.info('Sending to latex server')
      const res = await ky.post(env<Env>(c).LATEX_URL, {
        headers: { 'Content-Type': 'application/x-tex' },
        body: tex,
      })
      const png = await res.arrayBuffer()
      console.info('Success!')
      // check size
      if (png.byteLength > DISCORD_FILE_SIZE_LIMIT) {
        await handleFileTooLarge(content, env<Env>(c).DISCORD_URL)
        return
      }
      // create FormData
      const formData = new FormData()
      // attach file
      formData.append('file', new Blob([png]), 'out.png')
      // attach content
      formData.append('content', content)
      // send to discord
      console.info('Sending to discord')
      await ky.post(env<Env>(c).DISCORD_URL, { body: formData })
      console.info('Success!')
    } catch (err) {
      await handleError(err, env<Env>(c).DISCORD_URL)
    }
  }
  c.executionCtx.waitUntil(main())
  return c.text('ok')
})

const handleFileTooLarge = async (content: string, discordUrl: string) => {
  console.error('File too large')
  console.info('Sending error to discord')
  await ky.post(discordUrl, {
    json: { content: `${content}\nFile size too large` },
  })
  console.info('Success!')
}

const handleError = async (err: unknown, discordUrl: string) => {
  console.error(`Unexpected error: ${err}`)
  console.info('Sending error to discord!')
  try {
    await ky.post(discordUrl, {
      json: { content: '@everyone\nUnexpected error: discord-notification' },
    })
    console.info('Success!')
  } catch (err) {
    console.error(`Could not send error to discord: ${err}`)
  }
}

export default app
