const amqp = require('amqplib')

const MAX_ATTEMPTS = 5
const RETRY_DELAY = 30000

const handlers = {}
let connection = null
let channel = null
let timer = null
let closing = false

const withHeartbeat = (url) => url.includes('heartbeat=') ? url : `${url}${url.includes('?') ? '&' : '?'}heartbeat=30`

const setup = async (ch, queue) => {
    await ch.assertQueue(queue, { durable: true })
    await ch.assertQueue(`${queue}.retry`, {
        durable: true,
        arguments: { 'x-message-ttl': RETRY_DELAY, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': queue },
    })
    await ch.assertQueue(`${queue}.dead`, { durable: true })
}

const attach = async (ch, queue) => {
    await ch.consume(queue, async (msg) => {
        if (!msg) return
        const headers = msg.properties.headers || {}
        const attempts = Number(headers['x-attempts'] || 0)
        try {
            await handlers[queue](JSON.parse(msg.content.toString()))
        } catch (error) {
            const target = attempts + 1 >= MAX_ATTEMPTS ? `${queue}.dead` : `${queue}.retry`
            console.error(`Job on ${queue} failed (attempt ${attempts + 1}), moving to ${target}:`, error.message)
            try {
                ch.sendToQueue(target, msg.content, {
                    persistent: true,
                    contentType: 'application/json',
                    headers: { 'x-attempts': attempts + 1, 'x-error': String(error.message).slice(0, 200) },
                })
            } catch (err) { }
        }
        try {
            ch.ack(msg)
        } catch (err) { }
    })
}

const reconnect = () => {
    if (closing || timer) return
    timer = setTimeout(() => {
        timer = null
        connect()
    }, 5000)
}

const connect = async () => {
    if (!process.env.AMQP_URL || closing) return
    try {
        connection = await amqp.connect(withHeartbeat(process.env.AMQP_URL))
        connection.on('error', (err) => console.error('RabbitMQ error:', err.message))
        connection.on('close', () => {
            channel = null
            reconnect()
        })
        const ch = await connection.createConfirmChannel()
        await ch.prefetch(5)
        for (const queue of Object.keys(handlers)) {
            await setup(ch, queue)
            await attach(ch, queue)
        }
        channel = ch
        console.log('RabbitMQ connected')
    } catch (error) {
        console.error('RabbitMQ connect failed:', error.message)
        channel = null
        if (connection) connection.close().catch(() => { })
        reconnect()
    }
}

const consume = (queue, handler) => {
    handlers[queue] = handler
}

const publish = async (queue, payload) => {
    if (channel) {
        try {
            const body = Buffer.from(JSON.stringify(payload))
            await new Promise((resolve, reject) => {
                channel.sendToQueue(queue, body, { persistent: true, contentType: 'application/json' }, (err) => err ? reject(err) : resolve())
            })
            return
        } catch (error) {
            console.error('Queue publish failed, running inline:', error.message)
        }
    }
    if (handlers[queue]) await handlers[queue](payload)
}

const close = async () => {
    closing = true
    if (timer) clearTimeout(timer)
    if (connection) await connection.close().catch(() => { })
}

module.exports = { connect, consume, publish, close }
