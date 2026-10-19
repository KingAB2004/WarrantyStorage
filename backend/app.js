// const express = require('express')
const express=require('express')
const cors =require('cors')
const mongoose=require('mongoose')
const app=express()
require('dotenv').config()
app.use(express.json({ limit: '1mb' })); //dont forget ot add this in future
app.use(cors())
const route=require('./routes/routes')
const connectDB=require('./database/connectdb')
const cache=require('./cache/redis')
const queue=require('./queue/rabbit')
const startEmailWorker=require('./queue/emailWorker')
app.get('/',(req,res)=>{
    res.send("Something is there2")
})
app.get('/health',(req,res)=>{
    res.status(200).json({ ok: true })
})
// app.use(require('./middleware/ErrorHandler'));

app.use('/warranty/setup',route)
const port=process.env.PORT || 5000
const start =async () => {
    try {
        await connectDB(process.env.URI)
        startEmailWorker()
        await queue.connect()
        const server=app.listen(port,console.log('Server is on'))
        const shutdown=async () => {
            server.close()
            await queue.close()
            await cache.close()
            await mongoose.disconnect()
            process.exit(0)
        }
        process.on('SIGTERM',shutdown)
        process.on('SIGINT',shutdown)
    } catch (error) {
        console.log(error)
    }
}
start();
