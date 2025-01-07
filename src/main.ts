import type { RateLimit } from '@cloudflare/workers-types'
import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare'
import { Hono } from 'hono'
import { GeoMiddleware, getGeo } from 'hono-geo-middleware'
import { env } from 'hono/adapter'
import { cors } from 'hono/cors'
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
// set CORS
app.use('*', cors())

app.post('/text', GeoMiddleware(), c => {
  const main = async () => {
    try {
      // get text
      let text = ''
      if (c.req.header('Content-Type') === 'text/plain') {
        text = await c.req.text()
      } else if (
        c.req.header('Content-Type')?.startsWith('multipart/form-data')
      ) {
        const formData = await c.req.formData()
        formData.forEach((value, key) => {
          text += `${key}: ${value}\n`
        })
      } else {
        console.error(`Invalid Content-Type: ${c.req.header('Content-Type')}`)
        return
      }
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
      console.info('Succeeded to send to discord')
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
        console.error(`Invalid Content-Type: ${c.req.header('Content-Type')}`)
        return
      }
      // get svg
      const svg = await c.req.text()
      // check size
      if (svg.length > DISCORD_FILE_SIZE_LIMIT) {
        await handleFileTooLargeError(env<Env>(c).DISCORD_URL)
        return
      }
      // create FormData
      const formData = new FormData()
      // attach file
      formData.append('file', new Blob([svg]), 'out.svg')
      // attach content
      formData.append('content', '@everyone')
      // send to discord
      console.info('Sending to discord')
      await ky.post(env<Env>(c).DISCORD_URL, { body: formData })
      console.info('Succeeded to send to discord')
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
        console.error(`Invalid Content-Type: ${c.req.header('Content-Type')}`)
        return
      }
      // get tex
      const tex = await c.req.text()
      // send to latex server
      console.info('Sending to latex server')
      const res = await ky.post(env<Env>(c).LATEX_URL, {
        headers: { 'Content-Type': 'application/x-tex' },
        body: tex,
      })
      const png = await res.arrayBuffer()
      console.info('Succeeded to get png')
      // check size
      if (png.byteLength > DISCORD_FILE_SIZE_LIMIT) {
        await handleFileTooLargeError(env<Env>(c).DISCORD_URL)
        return
      }
      // create FormData
      const formData = new FormData()
      // attach file
      formData.append('file', new Blob([png]), 'out.png')
      // attach content
      formData.append('content', '@everyone')
      // send to discord
      console.info('Sending to discord')
      await ky.post(env<Env>(c).DISCORD_URL, { body: formData })
      console.info('Succeeded to send to discord')
    } catch (err) {
      await handleError(err, env<Env>(c).DISCORD_URL)
    }
  }
  c.executionCtx.waitUntil(main())
  return c.text('ok')
})

const handleFileTooLargeError = async (discordUrl: string) => {
  console.error('File too large')
  console.info('Sending error to discord')
  await ky.post(discordUrl, {
    json: { content: '@everyone\ndiscord-notification: File size too large' },
  })
  console.info('Succeeded to send error to discord')
}

const handleError = async (err: unknown, discordUrl: string) => {
  console.error(`Unexpected error: ${err}`)
  console.info('Sending error to discord!')
  try {
    await ky.post(discordUrl, {
      json: { content: '@everyone\ndiscord-notification: Unexpected error' },
    })
    console.info('Succeeded to send error to discord')
  } catch (err) {
    console.error(`Could not send error to discord: ${err}`)
  }
}

export default app
