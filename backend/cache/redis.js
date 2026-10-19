const Redis = require('ioredis')

let client = null
if (process.env.REDIS_URL) {
    client = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    client.on('ready', () => console.log('Redis connected'))
    client.on('error', (err) => console.error('Redis error:', err.message))
}

const ready = () => !!client && client.status === 'ready'

const get = async (key) => {
    if (!ready()) return null
    try {
        const value = await client.get(key)
        return value ? JSON.parse(value) : null
    } catch (error) {
        return null
    }
}

const set = async (key, value, ttl) => {
    if (!ready()) return
    try {
        await client.set(key, JSON.stringify(value), 'EX', ttl)
    } catch (error) { }
}

const delPattern = async (pattern) => {
    if (!ready()) return
    try {
        let cursor = '0'
        do {
            const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
            if (keys.length) await client.del(...keys)
            cursor = next
        } while (cursor !== '0')
    } catch (error) { }
}

const escapeKey = (value) => String(value).replace(/([*?[\]\\])/g, '\\$1')

const close = async () => {
    if (!client) return
    if (ready()) await client.quit().catch(() => { })
    else client.disconnect()
}

module.exports = { get, set, delPattern, escapeKey, close }
