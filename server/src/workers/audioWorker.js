const { audioQueue } = require('../config/redis')
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')
const mm = require('music-metadata')
const { createFFmpeg, fetchFile } = require('@ffmpeg/ffmpeg')
const prisma = new PrismaClient()

// Initialize FFmpeg instance
let ffmpegInstance = null
let ffmpegAvailable = false

// Export ffmpegAvailable for status checks
module.exports.ffmpegAvailable = () => ffmpegAvailable

async function initFFmpeg() {
    try {
        console.log('Initializing FFmpeg (WASM)...')
        // Configure FFmpeg with core p ath for Node.js
        const coreModulePath = require.resolve('@ffmpeg/core/package.json')
        const coreDir = path.dirname(coreModulePath)
        const corePath = path.join(coreDir, 'dist', 'umd', 'ffmpeg-core.js')
        const wasmPath = path.join(coreDir, 'dist', 'umd')

        ffmpegInstance = createFFmpeg({
            log: false,
            corePath: corePath,
            wasmPath: wasmPath,
        })
        await ffmpegInstance.load()
        ffmpegAvailable = true
        console.log('✅ FFmpeg (WASM) initialized successfully')
    } catch (error) {
        console.warn('⚠️  Failed to initialize FFmpeg:', error.message)
        console.warn('   Some features (convert, slice, waveform) will be disabled.')
        ffmpegAvailable = false
    }
}

// Initialize FFmpeg on startup
initFFmpeg()

/**
 * Extract metadata from audio file
 */
async function extractMetadata(filePath) {
    try {
        const metadata = await mm.parseFile(filePath)
        return {
            title: metadata.common.title || null,
            artist: metadata.common.artist || null,
            album: metadata.common.album || null,
            year: metadata.common.year || null,
            genre: metadata.common.genre || null,
            duration: metadata.format.duration || null,
            bitrate: metadata.format.bitrate || null,
            codec: metadata.format.codec || null,
            container: metadata.format.container || null,
            sampleRate: metadata.format.sampleRate || null,
            numberOfChannels: metadata.format.numberOfChannels || null,
            size: fs.statSync(filePath).size,
        }
    } catch (error) {
        console.error('Metadata extraction error:', error)
        throw error
    }
}

/**
 * Get audio file info using music-metadata (more reliable than parsing FFmpeg logs)
 */
async function getAudioInfo(filePath) {
    // Use music-metadata for reliable metadata extraction
    // FFmpeg is mainly used for conversion/slicing/waveform generation
    try {
        const metadata = await mm.parseFile(filePath)
        return {
            duration: metadata.format.duration || null,
            bitrate: metadata.format.bitrate || null,
            codec: metadata.format.codec || null,
            sampleRate: metadata.format.sampleRate || null,
            channels: metadata.format.numberOfChannels || null,
            format: metadata.format.container || path.extname(filePath).slice(1),
        }
    } catch (error) {
        throw new Error(`Failed to get audio info: ${ error.message }`)
    }
}

/**
 * Convert audio file to different format
 */
async function convertAudio(inputPath, outputFormat, jobId) {
    if (!ffmpegAvailable || !ffmpegInstance) {
        throw new Error('FFmpeg is not available. Please ensure FFmpeg is initialized.')
    }

    try {
        const outputDir = path.dirname(inputPath)
        const inputName = path.basename(inputPath, path.extname(inputPath))
        const outputFileName = `${ inputName }_converted.${ outputFormat }`
        const outputPath = path.join(outputDir, outputFileName)

        // Read input file
        const fileData = fs.readFileSync(inputPath)
        const inputFileName = path.basename(inputPath)

        // Write input file to FFmpeg virtual filesystem
        ffmpegInstance.FS('writeFile', inputFileName, fileData)

        // Convert audio
        console.log(`Converting ${ inputFileName } to ${ outputFormat }...`)
        await ffmpegInstance.run(
            '-i', inputFileName,
            '-codec:a', 'libmp3lame',
            '-b:a', '192k',
            '-y', // Overwrite output file
            outputFileName
        )

        // Read output file from virtual filesystem
        const outputData = ffmpegInstance.FS('readFile', outputFileName)

        // Write output file to disk
        fs.writeFileSync(outputPath, outputData)

        // Clean up virtual filesystem
        ffmpegInstance.FS('unlink', inputFileName)
        ffmpegInstance.FS('unlink', outputFileName)

        const stats = fs.statSync(outputPath)
        return {
            outputPath,
            outputFormat,
            size: stats.size,
            message: `Audio converted to ${ outputFormat.toUpperCase() }`,
        }
    } catch (error) {
        throw new Error(`Failed to convert audio: ${ error.message }`)
    }
}

/**
 * Slice audio clip from start to end time
 */
async function sliceAudio(inputPath, startTime, endTime, jobId) {
    if (!ffmpegAvailable || !ffmpegInstance) {
        throw new Error('FFmpeg is not available. Please ensure FFmpeg is initialized.')
    }

    try {
        const outputDir = path.dirname(inputPath)
        const inputName = path.basename(inputPath, path.extname(inputPath))
        const ext = path.extname(inputPath)
        const outputFileName = `${ inputName }_clip_${ startTime }-${ endTime }${ ext }`
        const outputPath = path.join(outputDir, outputFileName)
        const duration = endTime - startTime

        // Read input file
        const fileData = fs.readFileSync(inputPath)
        const inputFileName = path.basename(inputPath)

        // Write input file to FFmpeg virtual filesystem
        ffmpegInstance.FS('writeFile', inputFileName, fileData)

        // Slice audio
        console.log(`Slicing ${ inputFileName } from ${ startTime }s to ${ endTime }s...`)
        await ffmpegInstance.run(
            '-i', inputFileName,
            '-ss', startTime.toString(),
            '-t', duration.toString(),
            '-y', // Overwrite output file
            outputFileName
        )

        // Read output file from virtual filesystem
        const outputData = ffmpegInstance.FS('readFile', outputFileName)

        // Write output file to disk
        fs.writeFileSync(outputPath, outputData)

        // Clean up virtual filesystem
        ffmpegInstance.FS('unlink', inputFileName)
        ffmpegInstance.FS('unlink', outputFileName)

        const stats = fs.statSync(outputPath)
        return {
            outputPath,
            startTime,
            endTime,
            duration,
            size: stats.size,
            message: `Audio clip created from ${ startTime }s to ${ endTime }s`,
        }
    } catch (error) {
        throw new Error(`Failed to slice audio: ${ error.message }`)
    }
}

/**
 * Generate waveform visualization
 */
async function generateWaveform(inputPath, jobId) {
    if (!ffmpegAvailable || !ffmpegInstance) {
        throw new Error('FFmpeg is not available. Please ensure FFmpeg is initialized.')
    }

    try {
        const outputDir = path.dirname(inputPath)
        const inputName = path.basename(inputPath, path.extname(inputPath))
        const outputFileName = `${ inputName }_waveform.png`
        const outputPath = path.join(outputDir, outputFileName)

        // Read input file
        const fileData = fs.readFileSync(inputPath)
        const inputFileName = path.basename(inputPath)

        // Write input file to FFmpeg virtual filesystem
        ffmpegInstance.FS('writeFile', inputFileName, fileData)

        // Generate waveform image using ffmpeg
        console.log(`Generating waveform for ${ inputFileName }...`)
        await ffmpegInstance.run(
            '-i', inputFileName,
            '-filter_complex', '[0:a]aformat=channel_layouts=mono,compand=gain=-6,showwavespic=s=1200x240:colors=0x9333ea[fg];color=s=1200x240:c=0xffffff[bg];[bg][fg]overlay=format=auto',
            '-frames:v', '1',
            '-y', // Overwrite output file
            outputFileName
        )

        // Read output file from virtual filesystem
        const outputData = ffmpegInstance.FS('readFile', outputFileName)

        // Write output file to disk
        fs.writeFileSync(outputPath, outputData)

        // Clean up virtual filesystem
        ffmpegInstance.FS('unlink', inputFileName)
        ffmpegInstance.FS('unlink', outputFileName)

        const stats = fs.statSync(outputPath)
        return {
            outputPath,
            format: 'png',
            size: stats.size,
            message: 'Waveform image generated',
        }
    } catch (error) {
        throw new Error(`Failed to generate waveform: ${ error.message }`)
    }
}

/**
 * Process audio job
 */
async function processAudioJob(jobData) {
    const { jobId, audioFileId, jobType, outputFormat, startTime, endTime } = jobData

    try {
        // Update job status to PROCESSING
        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: 'PROCESSING',
                progress: 10,
            },
        })

        // Get audio file
        const audioFile = await prisma.audioFile.findUnique({
            where: { id: audioFileId },
        })

        if (!audioFile) {
            throw new Error('Audio file not found')
        }

        const filePath = audioFile.path

        if (!fs.existsSync(filePath)) {
            throw new Error('Audio file does not exist')
        }

        let result = {}

        // Process based on job type
        switch (jobType) {
            case 'metadata':
                // Extract metadata using music-metadata
                const metadata = await extractMetadata(filePath)

                // Also get ffmpeg info for additional details (if available)
                if (ffmpegAvailable) {
                    try {
                        const ffmpegInfo = await getAudioInfo(filePath)
                        result = {
                            ...metadata,
                            ffmpeg: ffmpegInfo,
                        }
                    } catch (ffmpegError) {
                        console.warn('FFmpeg info extraction failed, using metadata only:', ffmpegError.message)
                        result = {
                            ...metadata,
                            note: 'FFmpeg info unavailable',
                        }
                    }
                } else {
                    result = {
                        ...metadata,
                        note: 'FFmpeg not installed - basic metadata only',
                    }
                }
                break

            case 'analyze':
                // Comprehensive analysis
                const analysis = await extractMetadata(filePath)

                if (ffmpegAvailable) {
                    try {
                        const info = await getAudioInfo(filePath)
                        result = {
                            metadata: analysis,
                            technical: info,
                            fileInfo: {
                                path: filePath,
                                size: audioFile.size,
                                mimeType: audioFile.mimeType,
                            },
                        }
                    } catch (ffmpegError) {
                        result = {
                            metadata: analysis,
                            technical: null,
                            fileInfo: {
                                path: filePath,
                                size: audioFile.size,
                                mimeType: audioFile.mimeType,
                            },
                            error: 'FFmpeg analysis failed: ' + ffmpegError.message,
                        }
                    }
                } else {
                    result = {
                        metadata: analysis,
                        technical: null,
                        fileInfo: {
                            path: filePath,
                            size: audioFile.size,
                            mimeType: audioFile.mimeType,
                        },
                        note: 'FFmpeg not installed - metadata only analysis',
                    }
                }
                break

            case 'convert':
                // Convert audio format
                if (!outputFormat) {
                    throw new Error('Output format is required for conversion')
                }
                const conversionResult = await convertAudio(filePath, outputFormat, jobId)
                result = {
                    ...conversionResult,
                    originalFile: audioFile.originalName,
                }
                break

            case 'slice':
                // Slice audio clip
                if (!startTime || !endTime) {
                    throw new Error('Start and end times are required for slicing')
                }
                const sliceResult = await sliceAudio(filePath, startTime, endTime, jobId)
                result = {
                    ...sliceResult,
                    originalFile: audioFile.originalName,
                }
                break

            case 'waveform':
                // Generate waveform
                const waveformResult = await generateWaveform(filePath, jobId)
                result = {
                    ...waveformResult,
                    originalFile: audioFile.originalName,
                }
                break

            default:
                // Default to metadata extraction
                result = await extractMetadata(filePath)
        }

        // Update job as completed
        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: 'COMPLETED',
                progress: 100,
                result: JSON.stringify(result),
                completedAt: new Date(),
            },
        })

        console.log(`Job ${ jobId } completed successfully`)
        return result
    } catch (error) {
        console.error(`Job ${ jobId } failed:`, error)

        // Update job as failed
        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: 'FAILED',
                error: error.message,
            },
        })

        throw error
    }
}

// Initialize worker
async function startWorker() {
    try {
        console.log('='.repeat(50))
        console.log('Starting Audio Processing Worker...')
        console.log('='.repeat(50))

        const redisHost = process.env.REDIS_HOST || 'localhost'
        const redisPort = process.env.REDIS_PORT || 6379
        console.log(`Connecting to Redis at ${ redisHost }:${ redisPort }...`)

        // Test Redis connection by checking queue health
        const queueHealth = await audioQueue.getJobCounts()
        console.log('Connected to Redis')
        console.log(`Queue status: ${ JSON.stringify(queueHealth) }`)

        // Wait for FFmpeg to initialize if not already done
        if (!ffmpegAvailable) {
            console.log('Waiting for FFmpeg initialization...')
            await initFFmpeg()
        }

        // Display FFmpeg status
        if (ffmpegAvailable) {
            console.log('✅ FFmpeg (WASM) available - All features enabled')
        } else {
            console.log('⚠️  FFmpeg not available - Convert/Slice/Waveform features disabled')
        }

        console.log('='.repeat(50))
        console.log('AUDIO WORKER STARTED SUCCESSFULLY')
        console.log('='.repeat(50))
        console.log('Listening for audio processing jobs...')
        console.log('Queue: audio-processing')
        console.log('='.repeat(50))
    } catch (error) {
        console.error('Failed to start worker:', error)
        process.exit(1)
    }
}

// Process jobs from the queue
audioQueue.process(async (job) => {
    console.log(`\nProcessing job ${ job.id }...`)
    return await processAudioJob(job.data)
})

// Event handlers
audioQueue.on('completed', (job, result) => {
    console.log(`Job ${ job.id } completed successfully`)
})

audioQueue.on('failed', (job, err) => {
    console.error(`Job ${ job.id } failed:`, err.message)
})

audioQueue.on('error', (error) => {
    console.error('Queue error:', error)
})

// Start the worker
startWorker()

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing queue...')
    await audioQueue.close()
    await prisma.$disconnect()
    process.exit(0)
})

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing queue...')
    await audioQueue.close()
    await prisma.$disconnect()
    process.exit(0)
});

