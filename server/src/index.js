require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const uploadRoutes = require('./routes/upload')
const { redisClient } = require('./config/redis')
const { CleanupService } = require('./services/cleanup')

// Initialize cleanup service
const cleanupService = new CleanupService(6, 24) // Run every 6 hours, delete jobs older than 24 hours

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve uploaded files with proper headers for visualization
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    setHeaders: (res, filePath) => {
        // Set CORS headers for all files
        res.set('Access-Control-Allow-Origin', '*')
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')

        // Set appropriate content types
        const ext = path.extname(filePath).toLowerCase()
        if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp') {
            res.set('Content-Type', `image/${ ext.slice(1) }`)
            res.set('Cache-Control', 'public, max-age=31536000') // Cache images for 1 year
        } else if (ext === '.mp3') {
            res.set('Content-Type', 'audio/mpeg')
        } else if (ext === '.wav') {
            res.set('Content-Type', 'audio/wav')
        } else if (ext === '.flac') {
            res.set('Content-Type', 'audio/flac')
        } else if (ext === '.ogg') {
            res.set('Content-Type', 'audio/ogg')
        } else if (ext === '.m4a') {
            res.set('Content-Type', 'audio/mp4')
        } else if (ext === '.aac') {
            res.set('Content-Type', 'audio/aac')
        }
    }
}))

// Routes
app.use('/api/upload', uploadRoutes)

// Health check
app.get('/health', async (req, res) => {
    try {
        // Check Redis connection (with timeout)
        let redisStatus = 'unknown'
        try {
            await Promise.race([
                redisClient.ping(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ])
            redisStatus = 'connected'
        } catch (error) {
            redisStatus = 'disconnected'
        }

        res.json({
            status: 'ok',
            redis: redisStatus,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        res.status(503).json({
            status: 'error',
            redis: 'unknown',
            error: error.message,
        })
    }
})

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Audio Processing Framework API',
        version: '1.0.0',
        endpoints: {
            upload: 'POST /api/upload',
            jobStatus: 'GET /api/upload/job/:jobId',
            jobResult: 'GET /api/upload/job/:jobId/result',
            allJobs: 'GET /api/upload/jobs',
            jobsVisualization: 'GET /api/upload/jobs/visualization',
            fileInfo: 'GET /api/upload/file/:fileId',
            fileUrl: 'GET /api/upload/file/:fileId/url',
            staticFiles: 'GET /uploads/:filename',
        },
    })
})

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err)
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
    })
})

// Helper function to kill process on a port
async function killProcessOnPort(port) {
    return new Promise((resolve) => {
        const { exec } = require('child_process')
        const platform = process.platform

        let command
        if (platform === 'win32') {
            // Windows
            command = `netstat -ano | findstr :${ port }`
        } else {
            // Unix-like (macOS, Linux)
            command = `lsof -ti:${ port }`
        }

        exec(command, (error, stdout, stderr) => {
            if (error || !stdout.trim()) {
                // No process found on port
                resolve(false)
                return
            }

            if (platform === 'win32') {
                // Windows: Extract PID and kill
                const lines = stdout.trim().split('\n')
                const pids = new Set()
                lines.forEach(line => {
                    const parts = line.trim().split(/\s+/)
                    if (parts.length > 0) {
                        const pid = parts[parts.length - 1]
                        if (pid && !isNaN(pid)) {
                            pids.add(pid)
                        }
                    }
                })

                pids.forEach(pid => {
                    console.log(`   Killing process ${ pid } on port ${ port }...`)
                    exec(`taskkill /PID ${ pid } /F`, (killError) => {
                        if (killError) {
                            console.warn(`   Failed to kill process ${ pid }:`, killError.message)
                        } else {
                            console.log(`   ✅ Killed process ${ pid }`)
                        }
                    })
                })
                resolve(true)
            } else {
                // Unix-like: Kill directly
                const pids = stdout.trim().split('\n').filter(pid => pid && !isNaN(pid))
                if (pids.length > 0) {
                    pids.forEach(pid => {
                        console.log(`   Killing process ${ pid } on port ${ port }...`)
                        exec(`kill -9 ${ pid }`, (killError) => {
                            if (killError) {
                                console.warn(`   Failed to kill process ${ pid }:`, killError.message)
                            } else {
                                console.log(`   ✅ Killed process ${ pid }`)
                            }
                        })
                    })
                    // Wait a bit for processes to be killed
                    setTimeout(() => resolve(true), 1000)
                } else {
                    resolve(false)
                }
            }
        })
    })
}

// Start server
let server = null

async function startServer() {
    try {
        console.log('='.repeat(50))
        console.log(' Starting Audio Processing API Server...')
        console.log('='.repeat(50))

        // Check if port is in use and kill the process
        try {
            const { exec } = require('child_process')
            const platform = process.platform
            const checkCommand = platform === 'win32'
                ? `netstat -ano | findstr :${ PORT }`
                : `lsof -ti:${ PORT }`

            await new Promise((resolve) => {
                exec(checkCommand, async (error, stdout) => {
                    if (stdout && stdout.trim()) {
                        console.log(` ⚠️  Port ${ PORT } is already in use`)
                        console.log('   Attempting to kill the process...')
                        const killed = await killProcessOnPort(PORT)
                        if (killed) {
                            console.log('   Waiting for port to be released...')
                            // Wait a bit more for the port to be fully released
                            await new Promise(resolve => setTimeout(resolve, 1500))
                        }
                    }
                    resolve()
                })
            })
        } catch (portCheckError) {
            console.warn('   Could not check port status:', portCheckError.message)
        }

        // Connect to Redis with error handling
        try {
            // Check if already connected
            if (!redisClient.isOpen) {
                await redisClient.connect()
            }
            console.log(' ✅ Connected to Redis')
        } catch (redisError) {
            console.error(' ⚠️  Redis connection failed:', redisError.message)
            console.warn('   Server will continue but queue features may not work')
            // Don't exit - allow server to start without Redis
        }

        // Start Express server with error handling
        server = app.listen(PORT, () => {
            console.log('='.repeat(50))
            console.log(' ✅ API SERVER STARTED SUCCESSFULLY')
            console.log('='.repeat(50))
            console.log(` 🌐 Server URL: http://localhost:${ PORT }`)
            console.log(`API Base URL: http://localhost:${ PORT }/api`)
            console.log(`Health Check: http://localhost:${ PORT }/health`)
            console.log(`Upload directory: ${ process.env.UPLOAD_DIR || './uploads' }`)
            console.log('='.repeat(50))

            // Start automatic cleanup service (non-blocking)
            try {
                cleanupService.start()
            } catch (cleanupError) {
                console.warn(' ⚠️  Cleanup service failed to start:', cleanupError.message)
                // Don't throw - allow server to continue
            }
        })

        // Handle server errors gracefully
        server.on('error', async (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(` ❌ Port ${ PORT } is still in use after cleanup attempt`)
                console.error('   Attempting to kill process again...')
                await killProcessOnPort(PORT)
                // Wait and retry
                setTimeout(() => {
                    console.log('   Retrying server startup...')
                    startServer().catch(err => {
                        console.error('   Retry failed:', err.message)
                    })
                }, 2000)
            } else {
                console.error(' ❌ Server error:', error.message)
            }
            // Don't exit immediately - let nodemon handle restart
        })

    } catch (error) {
        console.error(' ❌ Failed to start server:', error)
        console.error('   Error details:', error.message)
        if (error.stack) {
            console.error('   Stack:', error.stack)
        }
        // Don't exit - let nodemon handle restart
        throw error
    }
}

// Start server with error handling
startServer().catch((error) => {
    console.error(' ❌ Server startup failed:', error.message)
    // Don't exit - let nodemon handle restart gracefully
})

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server...')
    try {
        if (server) {
            server.close()
        }
        cleanupService.stop()
    } catch (e) {
        console.warn('Cleanup service stop error:', e.message)
    }
    try {
        if (redisClient.isOpen) {
            await redisClient.quit()
        }
    } catch (e) {
        console.warn('Redis disconnect error:', e.message)
    }
    process.exit(0)
})

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing server...')
    try {
        if (server) {
            server.close()
        }
        cleanupService.stop()
    } catch (e) {
        console.warn('Cleanup service stop error:', e.message)
    }
    try {
        if (redisClient.isOpen) {
            await redisClient.quit()
        }
    } catch (e) {
        console.warn('Redis disconnect error:', e.message)
    }
    process.exit(0)
})

// Handle uncaught exceptions gracefully (don't crash on restart)
process.on('uncaughtException', (error) => {
    console.error(' ❌ Uncaught Exception:', error.message)
    if (error.stack) {
        console.error('   Stack:', error.stack)
    }
    // Don't exit - let nodemon handle restart
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error(' ❌ Unhandled Rejection at:', promise)
    console.error('   Reason:', reason)
    // Don't exit - let nodemon handle restart
})

