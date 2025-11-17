const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

/**
 * Auto-cleanup service for old jobs
 * Runs periodically to delete completed jobs older than specified hours
 */
class CleanupService {
    constructor(intervalHours = 6, jobAgeHours = 24) {
        this.intervalHours = intervalHours // How often to run cleanup
        this.jobAgeHours = jobAgeHours // How old jobs must be to delete
        this.intervalId = null
    }

    /**
     * Delete old completed jobs and their associated files
     */
    async cleanupOldJobs() {
        try {
            const cutoffDate = new Date(Date.now() - this.jobAgeHours * 60 * 60 * 1000)

            console.log('🧹 Running automatic cleanup...')
            console.log(`   Looking for jobs older than ${ this.jobAgeHours } hours (before ${ cutoffDate.toISOString() })`)

            const oldJobs = await prisma.job.findMany({
                where: {
                    status: 'COMPLETED',
                    completedAt: {
                        lt: cutoffDate,
                    },
                },
                include: {
                    audioFile: true,
                },
            })

            if (oldJobs.length === 0) {
                console.log('   No old jobs to clean up')
                return { jobsDeleted: 0, filesDeleted: 0 }
            }

            let deletedCount = 0
            let filesDeleted = 0
            const uploadDir = process.env.UPLOAD_DIR || './uploads'

            for (const job of oldJobs) {
                // Delete associated output file
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
                                filesDeleted++
                            }
                        }
                    } catch (e) {
                        console.warn(`   Warning: Could not delete output file for job ${ job.id }: ${ e.message }`)
                    }
                }

                // Delete the job from database
                await prisma.job.delete({
                    where: { id: job.id },
                })
                deletedCount++
            }

            console.log(`✅ Cleanup complete: Deleted ${ deletedCount } jobs and ${ filesDeleted } files`)
            return { jobsDeleted: deletedCount, filesDeleted: filesDeleted }
        } catch (error) {
            console.error('❌ Cleanup error:', error.message)
            return { jobsDeleted: 0, filesDeleted: 0, error: error.message }
        }
    }

    /**
     * Start the automatic cleanup service
     */
    start() {
        if (this.intervalId) {
            console.log('⚠️  Cleanup service is already running')
            return
        }

        console.log('='.repeat(50))
        console.log('🧹 Starting Automatic Cleanup Service')
        console.log('='.repeat(50))
        console.log(`   Interval: Every ${ this.intervalHours } hours`)
        console.log(`   Job Age Threshold: ${ this.jobAgeHours } hours`)
        console.log('='.repeat(50))

        // Run cleanup immediately on start (with error handling)
        this.cleanupOldJobs().catch((error) => {
            console.error('❌ Initial cleanup failed:', error.message)
            // Don't crash - just log the error
        })

        // Schedule periodic cleanup
        this.intervalId = setInterval(() => {
            this.cleanupOldJobs().catch((error) => {
                console.error('❌ Periodic cleanup failed:', error.message)
                // Don't crash - just log the error
            })
        }, this.intervalHours * 60 * 60 * 1000)
    }

    /**
     * Stop the automatic cleanup service
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
            console.log('🧹 Cleanup service stopped')
        }
    }
}

module.exports = { CleanupService }

