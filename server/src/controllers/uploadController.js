const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { PrismaClient } = require('@prisma/client')
const { addAudioJob } = require('../jobs/queue')
const prisma = new PrismaClient()

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads'
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    },
})

const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'audio/mpeg',
            'audio/mp3',
            'audio/wav',
            'audio/wave',
            'audio/x-wav',
            'audio/flac',
            'audio/ogg',
            'audio/vorbis',
            'audio/m4a',
            'audio/x-m4a',
            'audio/aac',
            'audio/webm',
            'audio/opus',
            'audio/x-aac',
            'audio/x-ms-wma',
        ]

        // Also check file extension as fallback
        const allowedExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.webm', '.opus', '.wma']
        const fileExt = path.extname(file.originalname).toLowerCase()

        if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
            cb(null, true)
        } else {
            cb(new Error(
                `Unsupported file type: ${ file.mimetype || 'unknown' }. ` +
                `Supported formats: MP3, WAV, FLAC, OGG, M4A, AAC, WebM, Opus, WMA`
            ))
        }
    },
})

/**
 * Handle file upload and create processing job
 */
async function uploadAudio(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please select an audio file to upload.',
                supportedFormats: ['MP3', 'WAV', 'FLAC', 'OGG', 'M4A', 'AAC', 'WebM', 'Opus', 'WMA']
            })
        }

        const { jobType = 'metadata', outputFormat, startTime, endTime } = req.body

        // Save file metadata to database
        const audioFile = await prisma.audioFile.create({
            data: {
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: req.file.path,
                mimeType: req.file.mimetype,
                size: req.file.size,
            },
        })

        // Prepare job parameters based on job type
        const jobParams = {}
        if (jobType === 'convert' && outputFormat) {
            jobParams.outputFormat = outputFormat
        } else if (jobType === 'slice' && startTime && endTime) {
            jobParams.startTime = parseFloat(startTime)
            jobParams.endTime = parseFloat(endTime)
        }

        // Create processing job
        const job = await addAudioJob(audioFile.id, jobType, jobParams)

        res.status(201).json({
            message: 'File uploaded successfully',
            audioFile: {
                id: audioFile.id,
                filename: audioFile.filename,
                originalName: audioFile.originalName,
                size: audioFile.size,
            },
            job: {
                id: job.id,
                type: job.type,
                status: job.status,
            },
        })
    } catch (error) {
        console.error('Upload error:', error)
        res.status(500).json({ error: error.message || 'Failed to upload file' })
    }
}

module.exports = {
    upload: upload.single('audio'),
    uploadAudio,
};

