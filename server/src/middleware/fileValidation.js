const path = require('path')
const fs = require('fs')

/**
 * Validate that a file exists and is accessible
 */
function validateFileExists(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return { valid: false, error: 'File does not exist' }
        }

        const stats = fs.statSync(filePath)
        if (!stats.isFile()) {
            return { valid: false, error: 'Path is not a file' }
        }

        return { valid: true, stats }
    } catch (error) {
        return { valid: false, error: error.message }
    }
}

/**
 * Get file MIME type based on extension
 */
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.flac': 'audio/flac',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.webm': 'audio/webm',
        '.opus': 'audio/opus',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
    }
    return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
}

module.exports = {
    validateFileExists,
    getMimeType,
    formatFileSize,
}

