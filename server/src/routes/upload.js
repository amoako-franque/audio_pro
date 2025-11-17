const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const router = express.Router()
const { upload, uploadAudio } = require('../controllers/uploadController')
const { getJobStatus } = require('../jobs/queue')
const { PrismaClient } = require('@prisma/client')
const { validateFileExists, getMimeType, formatFileSize } = require('../middleware/fileValidation')
const prisma = new PrismaClient()

// Endpoint to check feature availability
router.get('/features', async (req, res) => {
    try {
        let ffmpegStatus = false

        // Check if FFmpeg package is installed (without requiring the worker module)
        try {
            require.resolve('@ffmpeg/ffmpeg')
            // Package exists, but we need to check if it actually works
            // Don't require the worker module as it may cause circular dependencies or initialization issues
            // Instead, just check if the package is installed
            ffmpegStatus = true
        } catch (e) {
            // Package not installed
            ffmpegStatus = false
        }

        res.json({
            ffmpeg: {
                available: ffmpegStatus,
                features: ffmpegStatus ? ['convert', 'slice', 'waveform'] : [],
                message: ffmpegStatus
                    ? 'FFmpeg is available and ready to use'
                    : 'FFmpeg is not available. Convert, Slice, and Waveform features are disabled.'
            },
            metadata: {
                available: true,
                features: ['metadata', 'analyze']
            }
        })
    } catch (error) {
        console.error('Error checking features:', error)
        // Always return a safe default response
        res.json({
            ffmpeg: {
                available: false,
                features: [],
                message: 'Unable to check FFmpeg status. Features may be limited.'
            },
            metadata: {
                available: true,
                features: ['metadata', 'analyze']
            }
        })
    }
})

// Upload endpoint with error handling
router.post('/', upload, (err, req, res, next) => {
    // Handle multer errors
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large',
                message: 'Maximum file size is 100MB. Please upload a smaller file.',
                code: 'FILE_TOO_LARGE',
                maxSize: '100MB'
            })
        }
        return res.status(400).json({
            error: 'Upload error',
            message: err.message,
            code: err.code
        })
    }

    // Handle file filter errors and other upload errors
    if (err) {
        return res.status(400).json({
            error: 'File upload failed',
            message: err.message || 'Invalid file. Please ensure you are uploading a valid audio file.',
            supportedFormats: ['MP3', 'WAV', 'FLAC', 'OGG', 'M4A', 'AAC', 'WebM', 'Opus', 'WMA']
        })
    }

    next(err)
}, uploadAudio)

// Get job status
router.get('/job/:jobId', async (req, res) => {
    try {
        const job = await getJobStatus(req.params.jobId)
        res.json(job)
    } catch (error) {
        res.status(404).json({ error: error.message })
    }
})

// Get all jobs
router.get('/jobs', async (req, res) => {
    try {
        const jobs = await prisma.job.findMany({
            include: {
                audioFile: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 50,
        })
        res.json(jobs)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// Get audio file by ID
router.get('/file/:fileId', async (req, res) => {
    try {
        const file = await prisma.audioFile.findUnique({
            where: { id: req.params.fileId },
            include: {
                jobs: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                },
            },
        })

        if (!file) {
            return res.status(404).json({ error: 'File not found' })
        }

        res.json(file)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// Get file URL for visualization (returns public URL)
router.get('/file/:fileId/url', async (req, res) => {
    try {
        const file = await prisma.audioFile.findUnique({
            where: { id: req.params.fileId },
        })

        if (!file) {
            return res.status(404).json({ error: 'File not found' })
        }

        const baseUrl = req.protocol + '://' + req.get('host')
        const fileUrl = `${ baseUrl }/uploads/${ file.filename }`

        res.json({
            id: file.id,
            filename: file.filename,
            originalName: file.originalName,
            url: fileUrl,
            size: file.size,
            mimeType: file.mimeType,
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// Get job result with file URLs for visualization
router.get('/job/:jobId/result', async (req, res) => {
    try {
        const job = await prisma.job.findUnique({
            where: { id: req.params.jobId },
            include: {
                audioFile: true,
            },
        })

        if (!job) {
            return res.status(404).json({ error: 'Job not found' })
        }

        if (!job.result) {
            return res.status(404).json({ error: 'Job result not available' })
        }

        const baseUrl = req.protocol + '://' + req.get('host')
        const result = JSON.parse(job.result)

        // Add file URLs for visualization
        if (result.outputPath) {
            // Handle both relative and absolute paths
            const fileName = result.outputPath.includes(path.sep)
                ? result.outputPath.split(path.sep).pop()
                : result.outputPath

            const uploadDir = process.env.UPLOAD_DIR || './uploads'
            const filePath = path.join(uploadDir, fileName)

            // Validate file exists
            const validation = validateFileExists(filePath)
            if (validation.valid) {
                result.fileUrl = `${ baseUrl }/uploads/${ fileName }`
                result.downloadUrl = `${ baseUrl }/uploads/${ fileName }`
                result.mimeType = getMimeType(filePath)
                result.fileSize = validation.stats.size
                result.fileSizeFormatted = formatFileSize(validation.stats.size)
            }
        }

        // Add original file URL
        const originalFilePath = path.join(process.env.UPLOAD_DIR || './uploads', job.audioFile.filename)
        const originalValidation = validateFileExists(originalFilePath)
        if (originalValidation.valid) {
            result.originalFileUrl = `${ baseUrl }/uploads/${ job.audioFile.filename }`
        }

        res.json({
            jobId: job.id,
            jobType: job.type,
            status: job.status,
            progress: job.progress,
            result: result,
            audioFile: {
                id: job.audioFile.id,
                originalName: job.audioFile.originalName,
                url: `${ baseUrl }/uploads/${ job.audioFile.filename }`,
                size: job.audioFile.size,
                mimeType: job.audioFile.mimeType,
            },
            createdAt: job.createdAt,
            completedAt: job.completedAt,
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// Get all jobs with visualization-ready data
router.get('/jobs/visualization', async (req, res) => {
    try {
        const baseUrl = req.protocol + '://' + req.get('host')
        const uploadDir = process.env.UPLOAD_DIR || './uploads'
        const jobs = await prisma.job.findMany({
            include: {
                audioFile: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 50,
        })

        // Enhance jobs with visualization data
        const enhancedJobs = jobs.map(job => {
            const jobData = {
                ...job,
                audioFile: {
                    ...job.audioFile,
                    url: `${ baseUrl }/uploads/${ job.audioFile.filename }`,
                },
            }

            // Parse result and add file URLs
            if (job.result) {
                try {
                    const result = JSON.parse(job.result)
                    if (result.outputPath) {
                        // Handle both relative and absolute paths
                        const fileName = result.outputPath.includes(path.sep)
                            ? result.outputPath.split(path.sep).pop()
                            : result.outputPath

                        const filePath = path.join(uploadDir, fileName)
                        const validation = validateFileExists(filePath)

                        if (validation.valid) {
                            result.fileUrl = `${ baseUrl }/uploads/${ fileName }`
                            result.downloadUrl = `${ baseUrl }/uploads/${ fileName }`
                            result.mimeType = getMimeType(filePath)
                            result.fileSize = validation.stats.size
                            result.fileSizeFormatted = formatFileSize(validation.stats.size)
                        }
                    }
                    jobData.result = result
                } catch (e) {
                    // Keep original result if parsing fails
                }
            }

            return jobData
        })

        res.json(enhancedJobs)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// Delete a job by ID
router.delete('/job/:jobId', async (req, res) => {
    try {
        const job = await prisma.job.findUnique({
            where: { id: req.params.jobId },
            include: {
                audioFile: true,
            },
        })

        if (!job) {
            return res.status(404).json({
                error: 'Job not found',
                message: 'The job you are trying to delete does not exist. It may have already been deleted.',
                code: 'JOB_NOT_FOUND'
            })
        }

        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads')
        let filesDeleted = []

        // Delete associated output file if it exists
        if (job.result) {
            try {
                const result = JSON.parse(job.result)
                if (result.outputPath) {
                    const fileName = result.outputPath.includes(path.sep)
                        ? result.outputPath.split(path.sep).pop()
                        : result.outputPath
                    const filePath = path.join(uploadDir, fileName)

                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath)
                        filesDeleted.push(fileName)
                        console.log(`✅ Deleted output file: ${ fileName }`)
                    }
                }
            } catch (e) {
                console.warn(`⚠️  Warning: Could not delete output file: ${ e.message }`)
            }
        }

        // Delete original uploaded file
        if (job.audioFile && job.audioFile.filename) {
            try {
                const originalFilePath = path.join(uploadDir, job.audioFile.filename)
                if (fs.existsSync(originalFilePath)) {
                    fs.unlinkSync(originalFilePath)
                    filesDeleted.push(job.audioFile.filename)
                    console.log(`✅ Deleted original file: ${ job.audioFile.filename }`)
                }
            } catch (e) {
                console.warn(`⚠️  Warning: Could not delete original file: ${ e.message }`)
            }
        }

        // Delete the job first (cascade will handle audioFile if it's the only job)
        // But we need to check if there are other jobs using the same audioFile
        let audioFileId = job.audioFile?.id

        // Check if there are other jobs using this audioFile
        const otherJobs = await prisma.job.findMany({
            where: {
                audioFileId: audioFileId,
                id: { not: req.params.jobId },
            },
        })

        // Delete the job
        await prisma.job.delete({
            where: { id: req.params.jobId },
        })

        // Only delete audioFile if no other jobs are using it
        if (audioFileId && otherJobs.length === 0) {
            try {
                await prisma.audioFile.delete({
                    where: { id: audioFileId },
                })
                console.log(`✅ Deleted audio file record: ${ audioFileId }`)
            } catch (e) {
                // Audio file might have been cascade deleted or already deleted
                console.log(`ℹ️  Audio file record may have been cascade deleted`)
            }
        } else if (audioFileId && otherJobs.length > 0) {
            console.log(`ℹ️  Keeping audio file record (${ otherJobs.length } other job(s) still using it)`)
        }

        console.log(`🗑️  Deleted job ${ req.params.jobId } and ${ filesDeleted.length } file(s)`)

        res.json({
            message: 'Job deleted successfully',
            jobId: req.params.jobId,
            filesDeleted: filesDeleted
        })
    } catch (error) {
        console.error('❌ Delete job error:', error)

        // Provide more specific error messages
        let errorMessage = 'Failed to delete job'
        let errorCode = 'DELETE_ERROR'

        if (error.code === 'P2025') {
            errorMessage = 'Job not found. It may have already been deleted.'
            errorCode = 'JOB_NOT_FOUND'
        } else if (error.code === 'P2003') {
            errorMessage = 'Cannot delete job due to database constraints.'
            errorCode = 'CONSTRAINT_ERROR'
        } else if (error.message) {
            errorMessage = error.message
        }

        res.status(500).json({
            error: errorMessage,
            code: errorCode,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        })
    }
})

module.exports = router;

