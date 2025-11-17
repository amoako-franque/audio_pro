const { audioQueue } = require('../config/redis')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

/**
 * Add a job to the audio processing queue
 */
async function addAudioJob(audioFileId, jobType = 'metadata', jobParams = {}) {
    try {
        const job = await prisma.job.create({
            data: {
                audioFileId,
                type: jobType,
                status: 'PENDING',
            },
        })

        // Add to Redis queue with job parameters
        await audioQueue.add(
            {
                jobId: job.id,
                audioFileId,
                jobType,
                ...jobParams,
            },
            {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            }
        )

        return job
    } catch (error) {
        console.error('Error adding job to queue:', error)
        throw error
    }
}

/**
 * Get job status
 */
async function getJobStatus(jobId) {
    try {
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: {
                audioFile: true,
            },
        })

        if (!job) {
            throw new Error('Job not found')
        }

        return job
    } catch (error) {
        console.error('Error getting job status:', error)
        throw error
    }
}

module.exports = {
    addAudioJob,
    getJobStatus,
};

