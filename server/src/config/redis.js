const Redis = require('redis')
const Bull = require('bull')

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
}

// Create Redis client
const redisClient = Redis.createClient({
    socket: {
        host: redisConfig.host,
        port: redisConfig.port,
    },
})

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err)
})

redisClient.on('connect', () => {
    console.log('Redis Client Connected')
})

// Create Bull queue
const audioQueue = new Bull('audio-processing', {
    redis: redisConfig,
})

module.exports = {
    redisClient,
    audioQueue,
}

