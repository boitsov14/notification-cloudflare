import {Hono} from 'hono'

const app = new Hono()

app.get('/', (c) => {
    const cf = c.req.raw.cf

    const geolocation = {
        country: cf?.country,
        region: cf?.region,
        city: cf?.city,
    }

    return c.json(geolocation)
})

export default app
