import {Hono} from 'hono'

type Bindings = {
    X_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.onError((err, c) => {
    console.log(err)
    return c.json({error: "An unexpected error occurred."}, 500)
})

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
