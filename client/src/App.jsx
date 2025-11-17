import { useState, useEffect } from 'react'
import axios from 'axios'
import Select from 'react-select'
import toast, { Toaster } from 'react-hot-toast'
import {
    FaWaveSquare,
    FaMusic,
    FaCut,
    FaFileAudio,
    FaChartBar,
    FaDownload,
    FaCheckCircle,
    FaTimesCircle,
    FaSpinner,
    FaInfoCircle,
    FaTrash,
    FaMoon,
    FaSun
} from 'react-icons/fa'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:7667/api'

// Waveform Image Component with Loading State
function WaveformImageCard({ downloadUrl, isModal = false }) {
    const [imageLoading, setImageLoading] = useState(true)
    const [imageError, setImageError] = useState(false)

    const containerClass = isModal
        ? "relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border-2 border-gray-200 shadow-lg"
        : "relative bg-gray-50 rounded-lg border border-gray-200 overflow-hidden"

    return (
        <div className={containerClass}>
            {imageLoading && (
                <div className={`absolute inset-0 flex items-center justify-center ${ isModal ? 'bg-gray-50 rounded-xl' : 'bg-gray-100' }`}>
                    <div className="text-center">
                        <FaSpinner className={`animate-spin text-indigo-500 ${ isModal ? 'text-3xl' : 'text-2xl' } mx-auto mb-2`} />
                        <p className={`text-gray-500 ${ isModal ? 'text-sm' : 'text-xs' }`}>
                            {isModal ? 'Loading waveform...' : 'Loading...'}
                        </p>
                    </div>
                </div>
            )}
            {imageError ? (
                <div className={`text-center text-gray-400 ${ isModal ? 'p-12' : 'p-8' }`}>
                    <FaWaveSquare className={`mx-auto mb-2 ${ isModal ? 'text-5xl mb-3' : 'text-4xl mb-2' }`} />
                    <p className={isModal ? 'text-sm' : 'text-xs'}>
                        {isModal ? 'Failed to load waveform image' : 'Failed to load waveform'}
                    </p>
                </div>
            ) : (
                <img
                    src={downloadUrl}
                    alt="Waveform"
                    className={`w-full rounded-lg ${ isModal ? 'shadow-md' : 'shadow-sm' } transition-opacity duration-300 ${ imageLoading ? 'opacity-0' : 'opacity-100' }`}
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                        setImageLoading(false)
                        setImageError(true)
                    }}
                />
            )}
        </div>
    )
}

export default function App() {
    const [file, setFile] = useState(null)
    const [filePreviewUrl, setFilePreviewUrl] = useState(null)
    const [uploading, setUploading] = useState(false)
    const [jobs, setJobs] = useState([])
    const [selectedJob, setSelectedJob] = useState(null)
    const [jobType, setJobType] = useState('metadata')
    const [loading, setLoading] = useState(true)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [jobToDelete, setJobToDelete] = useState(null)
    const [features, setFeatures] = useState({ ffmpeg: { available: true, features: [] }, metadata: { available: true, features: [] } })
    const [darkMode, setDarkMode] = useState(() => {
        // Check localStorage or default to false
        try {
            const saved = localStorage.getItem('darkMode')
            if (saved === null) return false
            const parsed = JSON.parse(saved)
            return parsed === true
        } catch (e) {
            return false
        }
    })

    // Apply dark mode on mount and when darkMode changes
    useEffect(() => {
        const root = document.documentElement
        if (darkMode) {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
    }, [darkMode])

    // Toggle dark mode and save to localStorage
    const toggleDarkMode = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const newMode = !darkMode
        console.log('Toggling dark mode from', darkMode, 'to', newMode)
        setDarkMode(newMode)
        try {
            localStorage.setItem('darkMode', JSON.stringify(newMode))
        } catch (e) {
            console.error('Failed to save dark mode preference:', e)
        }
    }

    // Clip slicing parameters
    const [clipStart, setClipStart] = useState('0')
    const [clipEnd, setClipEnd] = useState('30')

    // Conversion parameters
    const [outputFormat, setOutputFormat] = useState('mp3')

    useEffect(() => {
        loadJobs()
        loadFeatures()
        const interval = setInterval(loadJobs, 2000)
        return () => clearInterval(interval)
    }, [])

    const loadFeatures = async () => {
        try {
            const response = await axios.get(`${ API_BASE_URL }/upload/features`)
            setFeatures(response.data)

            // If current job type is not available, switch to metadata
            if (!response.data.ffmpeg.available && ['convert', 'slice', 'waveform'].includes(jobType)) {
                setJobType('metadata')
                toast.info('FFmpeg features are not available. Switched to metadata extraction.', {
                    duration: 5000,
                })
            }
        } catch (error) {
            console.error('Error loading features:', error)
            // Default to assuming FFmpeg is not available on error
            setFeatures({
                ffmpeg: { available: false, features: [] },
                metadata: { available: true, features: ['metadata', 'analyze'] }
            })
        }
    }

    // Remove redundant loading state update - already handled in loadJobs

    const loadJobs = async () => {
        try {
            const response = await axios.get(`${ API_BASE_URL }/upload/jobs`)
            setJobs(response.data)
            setLoading(false)
        } catch (error) {
            console.error('Error loading jobs:', error)
            setLoading(false)
        }
    }

    const openDeleteModal = (job, event) => {
        // Stop event propagation to prevent opening the job modal
        event.stopPropagation()
        setJobToDelete(job)
        setDeleteModalOpen(true)
    }

    const closeDeleteModal = () => {
        setDeleteModalOpen(false)
        setJobToDelete(null)
    }

    const confirmDelete = async () => {
        if (!jobToDelete) return

        const loadingToast = toast.loading('Deleting job...')
        closeDeleteModal()

        try {
            const response = await axios.delete(`${ API_BASE_URL }/upload/job/${ jobToDelete.id }`)

            // Remove job from state
            setJobs(jobs.filter(job => job.id !== jobToDelete.id))

            // Close modal if the deleted job was selected
            if (selectedJob && selectedJob.id === jobToDelete.id) {
                setSelectedJob(null)
            }

            // Show success message with file count
            const fileCount = response.data.filesDeleted?.length || 0
            const fileText = fileCount === 1 ? 'file' : 'files'
            const warnings = response.data.warnings

            if (warnings && warnings.length > 0) {
                toast.success(
                    `Job deleted! ${ fileCount } ${ fileText } removed. Some files could not be deleted.`,
                    {
                        id: loadingToast,
                        duration: 5000,
                    }
                )
            } else {
                toast.success(
                    `Job deleted successfully! ${ fileCount } ${ fileText } removed.`,
                    {
                        id: loadingToast,
                        duration: 4000,
                    }
                )
            }
        } catch (error) {
            console.error('Error deleting job:', error)

            // Extract detailed error information
            const errorData = error.response?.data || {}
            let errorTitle = 'Failed to Delete Job'
            let errorMessage = errorData.error || errorData.message || error.message || 'An unexpected error occurred'

            // Provide user-friendly messages based on error code
            if (errorData.code === 'JOB_NOT_FOUND') {
                errorTitle = 'Job Not Found'
                errorMessage = 'This job does not exist. It may have already been deleted.'
            } else if (errorData.code === 'CONSTRAINT_ERROR') {
                errorTitle = 'Cannot Delete Job'
                errorMessage = 'This job cannot be deleted due to database constraints. Please try again later.'
            } else if (error.response?.status === 404) {
                errorTitle = 'Job Not Found'
                errorMessage = 'The job you are trying to delete does not exist.'
            } else if (error.response?.status === 500) {
                errorTitle = 'Server Error'
                errorMessage = 'An error occurred on the server. Please try again later.'
            }

            toast.error(
                <div>
                    <div className="font-semibold">{errorTitle}</div>
                    <div className="text-sm mt-1">{errorMessage}</div>
                </div>,
                {
                    id: loadingToast,
                    duration: 6000,
                    style: {
                        maxWidth: '400px',
                    },
                }
            )
        }
    }

    const handleFileChange = (e) => {
        if (e.target.files?.[0]) {
            const selectedFile = e.target.files[0]
            setFile(selectedFile)

            // Create preview URL for audio file
            if (filePreviewUrl) {
                URL.revokeObjectURL(filePreviewUrl)
            }
            const previewUrl = URL.createObjectURL(selectedFile)
            setFilePreviewUrl(previewUrl)
        }
    }

    // Cleanup preview URL on unmount or file change
    useEffect(() => {
        return () => {
            if (filePreviewUrl) {
                URL.revokeObjectURL(filePreviewUrl)
            }
        }
    }, [filePreviewUrl])

    const handleUpload = async () => {
        if (!file) {
            toast.error('Please select a file')
            return
        }

        // Validate clip times if slicing
        if (jobType === 'slice') {
            const start = parseFloat(clipStart)
            const end = parseFloat(clipEnd)
            if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
                toast.error('Invalid clip times. Start must be >= 0 and end must be > start.')
                return
            }
        }

        const formData = new FormData()
        formData.append('audio', file)
        formData.append('jobType', jobType)

        // Add job-specific parameters
        if (jobType === 'convert') {
            formData.append('outputFormat', outputFormat)
        } else if (jobType === 'slice') {
            formData.append('startTime', clipStart)
            formData.append('endTime', clipEnd)
        }

        setUploading(true)
        const uploadToast = toast.loading('Uploading file...')

        try {
            await axios.post(`${ API_BASE_URL }/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })

            toast.success('Upload successful! Processing job...', {
                id: uploadToast,
                duration: 4000,
            })

            // Cleanup preview URL
            if (filePreviewUrl) {
                URL.revokeObjectURL(filePreviewUrl)
            }
            setFile(null)
            setFilePreviewUrl(null)
            const fileInput = document.getElementById('file-input')
            if (fileInput) fileInput.value = ''
            // Reset slice times
            if (jobType === 'slice') {
                setClipStart('0')
                setClipEnd('30')
            }
            loadJobs()
        } catch (error) {
            console.error('Upload error:', error)
            const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Upload failed.'
            toast.error(errorMsg, {
                id: uploadToast,
                duration: 5000,
            })
        } finally {
            setUploading(false)
        }
    }

    const getStatusColor = (status) => {
        return {
            COMPLETED: 'bg-emerald-500/90',
            PROCESSING: 'bg-blue-500/90',
            FAILED: 'bg-red-500/90',
        }[status] || 'bg-gray-400/90'
    }

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
    }

    const jobTypeOptions = [
        { value: 'metadata', label: 'Extract Metadata', description: 'Basic audio analysis', requiresFFmpeg: false },
        { value: 'analyze', label: 'Full Analysis', description: 'Deep signal processing', requiresFFmpeg: false },
        { value: 'convert', label: 'Convert Format', description: 'Convert to different format', requiresFFmpeg: true },
        { value: 'slice', label: 'Slice Clip', description: 'Extract audio segment', requiresFFmpeg: true },
        { value: 'waveform', label: 'Generate Waveform', description: 'Create visualization', requiresFFmpeg: true },
    ].map(option => ({
        ...option,
        isDisabled: option.requiresFFmpeg && !features.ffmpeg.available,
        label: option.requiresFFmpeg && !features.ffmpeg.available
            ? `${ option.label } (Not Available)`
            : option.label,
        description: option.requiresFFmpeg && !features.ffmpeg.available
            ? 'FFmpeg is not available. Please install FFmpeg to use this feature.'
            : option.description
    }))

    const formatOptions = [
        { value: 'mp3', label: 'MP3' },
        { value: 'wav', label: 'WAV' },
        { value: 'flac', label: 'FLAC' },
        { value: 'ogg', label: 'OGG' },
        { value: 'm4a', label: 'M4A' },
    ]

    const customSelectStyles = {
        control: (base, state) => ({
            ...base,
            borderRadius: '12px',
            padding: '6px',
            borderColor: state.isFocused ? '#7d7aff' : '#d1d5db',
            boxShadow: state.isFocused ? '0 0 0 4px rgba(125,122,255,0.15)' : 'none',
            backgroundColor: 'white',
            '&:hover': {
                borderColor: '#7d7aff',
            },
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isSelected
                ? '#a7f3d0' // emerald-200
                : state.isFocused
                    ? '#f3f4f6'
                    : 'white',
            color: state.isSelected ? '#065f46' : '#374151', // emerald-900 text for selected
            padding: '0.75rem 1rem',
            cursor: 'pointer',
            borderRadius: '8px',
            margin: '2px',
            fontWeight: state.isSelected ? '600' : 'normal',
            '&:active': {
                backgroundColor: state.isSelected ? '#6ee7b7' : '#d1d5db', // emerald-300 on active
                color: state.isSelected ? '#065f46' : '#374151',
            },
        }),
        menu: (base) => ({
            ...base,
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.1), 0 6px 20px rgba(0,0,0,0.05)',
            padding: '4px',
            zIndex: 9999,
        }),
        menuPortal: (base) => ({
            ...base,
            zIndex: 9999,
        }),
        menuList: (base) => ({
            ...base,
            padding: '4px',
            maxHeight: '300px',
        }),
        singleValue: (base) => ({
            ...base,
            color: '#374151',
            fontWeight: '500',
        }),
        placeholder: (base) => ({
            ...base,
            color: '#9ca3af',
        }),
    }

    return (
        <div className="min-h-screen bg-neutral-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 relative transition-colors duration-300">
            {/* Toast notifications */}
            <Toaster
                position="top-right"
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: darkMode ? '#1f2937' : '#fff',
                        color: darkMode ? '#f3f4f6' : '#363636',
                        borderRadius: '12px',
                        padding: '16px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                    },
                    success: {
                        iconTheme: {
                            primary: '#10b981',
                            secondary: '#fff',
                        },
                    },
                    error: {
                        iconTheme: {
                            primary: '#ef4444',
                            secondary: '#fff',
                        },
                    },
                }}
            />

            {/* Subtle gradient backdrop */}
            <div className="absolute inset-0 bg-gradient-to-br from-white via-neutral-100 to-neutral-200 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300"></div>

            <div className="relative z-10 max-w-6xl mx-auto p-6">
                {/* Header with Dark Mode Toggle */}
                <header className="text-center py-10 relative">
                    <button
                        type="button"
                        onClick={toggleDarkMode}
                        className="absolute top-0 right-0 p-3 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 border border-gray-200 dark:border-gray-700 z-50 cursor-pointer"
                        aria-label="Toggle dark mode"
                    >
                        {darkMode ? (
                            <FaSun className="text-yellow-500 text-xl" />
                        ) : (
                            <FaMoon className="text-gray-700 text-xl" />
                        )}
                    </button>
                    <h1 className="text-5xl font-semibold tracking-tight text-gray-900 dark:text-white transition-colors duration-300">
                        🎵 Audio Processing
                    </h1>
                    <p className="text-lg text-gray-600 dark:text-gray-300 mt-3 transition-colors duration-300">
                        Upload, process, and analyze audio files—effortlessly.
                    </p>
                </header>

                {/* Upload Card */}
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-xl rounded-3xl p-8 border border-white/40 dark:border-gray-700/40 mb-12 relative transition-all duration-300" style={{ zIndex: 1 }}>
                    <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-6 transition-colors duration-300">
                        Upload Audio File
                    </h2>

                    {/* Job Type and File Input on Same Row */}
                    <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative" style={{ zIndex: 100 }}>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                                Job Type
                            </label>
                            <Select
                                value={jobTypeOptions.find((o) => o.value === jobType)}
                                onChange={(opt) => {
                                    if (opt.isDisabled) {
                                        toast.error('Convert/Slice/Waveform features disabled', {
                                            description: 'These features are not available now. Please use Metadata or Analysis instead.',
                                            duration: 5000,
                                        })
                                        return
                                    }
                                    setJobType(opt.value)
                                }}
                                options={jobTypeOptions}
                                styles={{
                                    ...customSelectStyles,
                                    option: (base, state) => ({
                                        ...customSelectStyles.option(base, state),
                                        backgroundColor: state.isDisabled
                                            ? '#f3f4f6'
                                            : state.isSelected
                                                ? '#a7f3d0'
                                                : state.isFocused
                                                    ? '#f3f4f6'
                                                    : 'white',
                                        color: state.isDisabled
                                            ? '#9ca3af'
                                            : state.isSelected
                                                ? '#065f46'
                                                : '#374151',
                                        cursor: state.isDisabled ? 'not-allowed' : 'pointer',
                                        opacity: state.isDisabled ? 0.6 : 1,
                                    }),
                                }}
                                isSearchable={false}
                                menuPortalTarget={document.body}
                                menuPosition="fixed"
                                isOptionDisabled={(option) => option.isDisabled}
                                formatOptionLabel={({ label, description, isDisabled }) => (
                                    <div className="flex flex-col">
                                        <span className={`font-medium ${ isDisabled ? 'text-gray-400' : '' }`}>{label}</span>
                                        <span className={`text-xs mt-0.5 ${ isDisabled ? 'text-gray-400' : 'text-gray-500' }`}>{description}</span>
                                    </div>
                                )}
                            />
                            {!features.ffmpeg.available && (
                                <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg transition-all duration-300">
                                    <p className="text-xs text-yellow-800 dark:text-yellow-300 flex items-start gap-2 transition-colors duration-300">
                                        <FaTimesCircle className="text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0 transition-colors duration-300" />
                                        <span>
                                            <strong>FFmpeg not available:</strong> Convert, Slice, and Waveform features are disabled.
                                            Only Metadata and Analysis are available.
                                        </span>
                                    </p>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                                Choose File
                            </label>
                            <input
                                id="file-input"
                                type="file"
                                accept="audio/*"
                                onChange={handleFileChange}
                                className="w-full rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-4 transition-all duration-300 ease-in-out hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-neutral-50 dark:hover:bg-gray-600 cursor-pointer text-gray-900 dark:text-gray-100"
                            />
                            {file && (
                                <div className="mt-3 space-y-2">
                                    <div className="px-3 py-1.5 bg-neutral-100 dark:bg-gray-700 rounded-lg text-xs flex justify-between transition-colors duration-300">
                                        <span className="truncate flex-1 mr-2 text-gray-900 dark:text-gray-100">{file.name}</span>
                                        <span className="font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">{formatBytes(file.size)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Audio Preview - Full Width */}
                    {file && filePreviewUrl && (
                        <div className="mb-6 w-full">
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-300">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">Preview:</p>
                                <audio
                                    controls
                                    src={filePreviewUrl}
                                    className="w-full h-10"
                                    preload="metadata"
                                >
                                    Your browser does not support the audio element.
                                </audio>
                            </div>
                        </div>
                    )}

                    {/* Output Format Selection for Convert */}
                    {jobType === 'convert' && (
                        <div className="mb-6 relative" style={{ zIndex: 100 }}>
                            <Select
                                value={formatOptions.find((o) => o.value === outputFormat)}
                                onChange={(opt) => setOutputFormat(opt.value)}
                                options={formatOptions}
                                styles={customSelectStyles}
                                isSearchable={false}
                                menuPortalTarget={document.body}
                                menuPosition="fixed"
                                placeholder="Select output format..."
                            />
                        </div>
                    )}

                    {/* Clip Time Inputs for Slice */}
                    {jobType === 'slice' && (
                        <div className="mb-6 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                                    Start Time (seconds)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={clipStart}
                                    onChange={(e) => setClipStart(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all duration-300 ease-in-out"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                                    End Time (seconds)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={clipEnd}
                                    onChange={(e) => setClipEnd(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all duration-300 ease-in-out"
                                    placeholder="30"
                                />
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="w-full py-4 text-white font-medium rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 transition-all duration-300 ease-in-out hover:shadow-xl hover:scale-[1.02] transform"
                    >
                        {uploading ? 'Uploading…' : 'Upload & Process'}
                    </button>
                </div>

                {/* Jobs Section */}
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/40 dark:border-gray-700/40 shadow-xl rounded-3xl p-8 relative transition-all duration-300" style={{ zIndex: 0 }}>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6 transition-colors duration-300">
                        Processing Jobs
                    </h2>

                    {loading ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-8 transition-colors duration-300">Loading…</p>
                    ) : jobs.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-10 transition-colors duration-300">
                            No jobs yet — upload a file to begin.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {jobs.map((job) => (
                                <div
                                    key={job.id}
                                    onClick={() =>
                                        setSelectedJob(
                                            selectedJob?.id === job.id ? null : job
                                        )
                                    }
                                    className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-5 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-2xl hover:bg-emerald-200 dark:hover:bg-emerald-900/30 hover:-translate-y-1 transform"
                                >
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate transition-colors duration-300">
                                        {job.audioFile.originalName}
                                    </h3>

                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 transition-colors duration-300">
                                        {job.type}
                                    </p>

                                    <div className="mt-4 space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-600 dark:text-gray-400 transition-colors duration-300">Size</span>
                                            <span className="text-gray-900 dark:text-gray-200 transition-colors duration-300">{formatBytes(job.audioFile.size)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600 dark:text-gray-400 transition-colors duration-300">Progress</span>
                                            <span className="text-gray-900 dark:text-gray-200 transition-colors duration-300">{job.progress}%</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600 dark:text-gray-400 transition-colors duration-300">Status</span>
                                            <span
                                                className={`px-2 py-1 rounded-lg text-white text-xs ${ getStatusColor(
                                                    job.status
                                                ) }`}
                                            >
                                                {job.status}
                                            </span>
                                        </div>
                                    </div>

                                    {job.status === 'COMPLETED' && job.result && (
                                        <div className="mt-4 space-y-2">
                                            <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 transition-all duration-300">
                                                <FaCheckCircle className="text-emerald-600 dark:text-emerald-400 transition-colors duration-300" />
                                                <strong>Result:</strong> Click to view details
                                            </div>
                                            {(() => {
                                                try {
                                                    const result = JSON.parse(job.result)
                                                    const outputPath = result.outputPath

                                                    if (outputPath) {
                                                        const fileName = outputPath.split('/').pop()
                                                        const downloadUrl = `${ API_BASE_URL.replace('/api', '') }/uploads/${ fileName }`

                                                        // Show waveform image preview for waveform jobs
                                                        if (job.type === 'waveform' && result.format === 'png') {
                                                            return (
                                                                <div className="space-y-2">
                                                                    <WaveformImageCard downloadUrl={downloadUrl} />
                                                                    <a
                                                                        href={downloadUrl}
                                                                        download
                                                                        className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-indigo-500 text-white text-xs font-semibold rounded-xl hover:bg-indigo-600 transition-all duration-300 ease-in-out hover:scale-[1.02] transform"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <FaDownload className="text-xs" />
                                                                        Download Waveform
                                                                    </a>
                                                                </div>
                                                            )
                                                        }

                                                        // Show audio player for convert/slice jobs
                                                        if ((job.type === 'convert' || job.type === 'slice') && outputPath) {
                                                            const fileExt = outputPath.split('.').pop()?.toUpperCase() || 'AUDIO'
                                                            const format = result.outputFormat?.toUpperCase() || fileExt
                                                            return (
                                                                <div className="space-y-2">
                                                                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-700 shadow-sm transition-all duration-300">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            {job.type === 'convert' ? (
                                                                                <FaFileAudio className="text-indigo-600 dark:text-indigo-400 text-sm transition-colors duration-300" />
                                                                            ) : (
                                                                                <FaCut className="text-indigo-600 dark:text-indigo-400 text-sm transition-colors duration-300" />
                                                                            )}
                                                                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 transition-colors duration-300">
                                                                                {job.type === 'convert' ? 'Converted Audio' : 'Audio Clip'}
                                                                            </span>
                                                                            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 px-2 py-0.5 rounded transition-all duration-300">
                                                                                {format}
                                                                            </span>
                                                                        </div>
                                                                        <audio
                                                                            controls
                                                                            src={downloadUrl}
                                                                            className="w-full h-10"
                                                                            preload="metadata"
                                                                        >
                                                                            Your browser does not support the audio element.
                                                                        </audio>
                                                                    </div>
                                                                    <a
                                                                        href={downloadUrl}
                                                                        download
                                                                        className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-indigo-500 text-white text-xs font-semibold rounded-xl hover:bg-indigo-600 transition-all duration-300 ease-in-out hover:scale-[1.02] transform"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <FaDownload className="text-xs" />
                                                                        Download {format}
                                                                    </a>
                                                                </div>
                                                            )
                                                        }

                                                        // Default download button
                                                        return (
                                                            <a
                                                                href={downloadUrl}
                                                                download
                                                                className="block w-full px-3 py-2 bg-indigo-500 text-white text-xs font-semibold rounded-xl hover:bg-indigo-600 transition-all duration-300 ease-in-out hover:scale-[1.02] transform text-center"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                📥 Download File
                                                            </a>
                                                        )
                                                    }
                                                } catch (e) {
                                                    return null
                                                }
                                            })()}
                                        </div>
                                    )}

                                    {job.status === 'FAILED' && job.error && (
                                        <div className="flex items-start gap-2 mt-4 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 transition-all duration-300">
                                            <FaTimesCircle className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0 transition-colors duration-300" />
                                            <span>{job.error}</span>
                                        </div>
                                    )}

                                    {job.status === 'PROCESSING' && (
                                        <div className="mt-4 flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm transition-colors duration-300">
                                            <FaSpinner className="animate-spin" />
                                            <span>Processing…</span>
                                        </div>
                                    )}

                                    {/* Delete Button */}
                                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 transition-colors duration-300">
                                        <button
                                            onClick={(e) => openDeleteModal(job, e)}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-all duration-300 ease-in-out border border-red-200 dark:border-red-800"
                                        >
                                            <FaTrash className="text-sm" />
                                            Delete Job
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Enhanced Modal with Visualizations */}
                {selectedJob?.result && (() => {
                    try {
                        const result = JSON.parse(selectedJob.result)
                        const outputPath = result.outputPath
                        const fileName = outputPath ? outputPath.split('/').pop() : null
                        const downloadUrl = fileName ? `${ API_BASE_URL.replace('/api', '') }/uploads/${ fileName }` : null

                        return (
                            <div
                                className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300"
                                style={{ zIndex: 100000 }}
                                onClick={() => setSelectedJob(null)}
                            >
                                <div
                                    className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden transition-all duration-300"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700 transition-colors duration-300">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            {selectedJob.type === 'waveform' && <FaWaveSquare className="text-indigo-600 dark:text-indigo-400 text-2xl flex-shrink-0 transition-colors duration-300" />}
                                            {selectedJob.type === 'convert' && <FaFileAudio className="text-indigo-600 dark:text-indigo-400 text-2xl flex-shrink-0 transition-colors duration-300" />}
                                            {selectedJob.type === 'slice' && <FaCut className="text-indigo-600 dark:text-indigo-400 text-2xl flex-shrink-0 transition-colors duration-300" />}
                                            {selectedJob.type === 'analyze' && <FaChartBar className="text-indigo-600 dark:text-indigo-400 text-2xl flex-shrink-0 transition-colors duration-300" />}
                                            {(selectedJob.type === 'metadata' || !['waveform', 'convert', 'slice', 'analyze'].includes(selectedJob.type)) && <FaMusic className="text-indigo-600 dark:text-indigo-400 text-2xl flex-shrink-0 transition-colors duration-300" />}
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 truncate transition-colors duration-300">
                                                    {selectedJob.type === 'waveform' ? 'Waveform Visualization' :
                                                        selectedJob.type === 'convert' ? 'Converted Audio' :
                                                            selectedJob.type === 'slice' ? 'Audio Clip' :
                                                                selectedJob.type === 'analyze' ? 'Audio Analysis' :
                                                                    'Audio Metadata'} — {selectedJob.audioFile.originalName}
                                                </h3>
                                                {selectedJob.audioFile?.size && (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 transition-colors duration-300">
                                                        File Size: <span className="font-medium text-gray-700 dark:text-gray-300">{formatBytes(selectedJob.audioFile.size)}</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSelectedJob(null)}
                                            className="text-2xl text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-300 ease-in-out hover:scale-110 transform flex-shrink-0 ml-4"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <div className="p-6 overflow-auto max-h-[calc(90vh-80px)]">
                                        {/* Waveform Visualization */}
                                        {selectedJob.type === 'waveform' && downloadUrl && (
                                            <div className="mb-6">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <FaWaveSquare className="text-indigo-600 dark:text-indigo-400 transition-colors duration-300" />
                                                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 transition-colors duration-300">Waveform Visualization</h4>
                                                </div>
                                                <WaveformImageCard downloadUrl={downloadUrl} isModal={true} />
                                                {downloadUrl && (
                                                    <a
                                                        href={downloadUrl}
                                                        download
                                                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white font-semibold rounded-xl hover:bg-indigo-600 transition-all duration-300 ease-in-out hover:scale-[1.02] transform shadow-md"
                                                    >
                                                        <FaDownload />
                                                        Download Waveform PNG
                                                    </a>
                                                )}
                                            </div>
                                        )}

                                        {/* Audio Player for Convert/Slice */}
                                        {(selectedJob.type === 'convert' || selectedJob.type === 'slice') && downloadUrl && (
                                            <div className="mb-6">
                                                <div className="flex items-center gap-2 mb-4">
                                                    {selectedJob.type === 'convert' ? (
                                                        <FaFileAudio className="text-indigo-600 dark:text-indigo-400 transition-colors duration-300" />
                                                    ) : (
                                                        <FaCut className="text-indigo-600 dark:text-indigo-400 transition-colors duration-300" />
                                                    )}
                                                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 transition-colors duration-300">
                                                        {selectedJob.type === 'convert' ? 'Converted Audio' : 'Audio Clip'}
                                                    </h4>
                                                </div>
                                                <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-900/20 dark:via-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 border-2 border-indigo-200 dark:border-indigo-700 shadow-lg transition-all duration-300">
                                                    <audio
                                                        controls
                                                        src={downloadUrl}
                                                        className="w-full"
                                                        preload="metadata"
                                                    >
                                                        Your browser does not support the audio element.
                                                    </audio>
                                                </div>
                                                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    {result.outputFormat && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Format</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">{result.outputFormat.toUpperCase()}</p>
                                                        </div>
                                                    )}
                                                    {result.startTime !== undefined && result.endTime !== undefined && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Clip Duration</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">
                                                                {result.startTime}s - {result.endTime}s
                                                                {result.duration && ` (${ result.duration.toFixed(1) }s)`}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {result.size && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">File Size</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">{formatBytes(result.size)}</p>
                                                        </div>
                                                    )}
                                                </div>
                                                {downloadUrl && (
                                                    <a
                                                        href={downloadUrl}
                                                        download
                                                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white font-semibold rounded-xl hover:bg-indigo-600 transition-all duration-300 ease-in-out hover:scale-[1.02] transform shadow-md"
                                                    >
                                                        <FaDownload />
                                                        Download {result.outputFormat?.toUpperCase() || (outputPath ? outputPath.split('.').pop()?.toUpperCase() : 'File')}
                                                    </a>
                                                )}
                                            </div>
                                        )}

                                        {/* Metadata Display */}
                                        {(selectedJob.type === 'metadata' || selectedJob.type === 'analyze') && (
                                            <div className="mb-6">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <FaInfoCircle className="text-indigo-600 dark:text-indigo-400 transition-colors duration-300" />
                                                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 transition-colors duration-300">Audio Information</h4>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {result.title && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Title</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">{result.title}</p>
                                                        </div>
                                                    )}
                                                    {result.artist && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Artist</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">{result.artist}</p>
                                                        </div>
                                                    )}
                                                    {result.album && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Album</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">{result.album}</p>
                                                        </div>
                                                    )}
                                                    {result.duration && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Duration</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">
                                                                {Math.floor(result.duration / 60)}:{(result.duration % 60).toFixed(0).padStart(2, '0')}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {result.bitrate && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Bitrate</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">{Math.round(result.bitrate / 1000)} kbps</p>
                                                        </div>
                                                    )}
                                                    {result.sampleRate && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Sample Rate</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">{result.sampleRate} Hz</p>
                                                        </div>
                                                    )}
                                                    {result.codec && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Codec</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">{result.codec.toUpperCase()}</p>
                                                        </div>
                                                    )}
                                                    {result.numberOfChannels && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">Channels</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">
                                                                {result.numberOfChannels === 1 ? 'Mono' : result.numberOfChannels === 2 ? 'Stereo' : `${ result.numberOfChannels } channels`}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {selectedJob.audioFile?.size && (
                                                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 transition-all duration-300">
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 transition-colors duration-300">File Size</p>
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">{formatBytes(selectedJob.audioFile.size)}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Technical Details for Analyze */}
                                                {selectedJob.type === 'analyze' && result.technical && (
                                                    <div className="mt-6">
                                                        <h5 className="text-md font-semibold text-gray-800 dark:text-gray-100 mb-3 transition-colors duration-300">Technical Details</h5>
                                                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800 transition-all duration-300">
                                                            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap transition-colors duration-300">
                                                                {JSON.stringify(result.technical, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Raw JSON Toggle */}
                                                <details className="mt-6">
                                                    <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-300">
                                                        View Raw JSON
                                                    </summary>
                                                    <pre className="mt-2 bg-gray-900 dark:bg-gray-950 text-gray-100 dark:text-gray-200 p-4 rounded-xl overflow-x-auto text-xs leading-relaxed transition-all duration-300">
                                                        {JSON.stringify(result, null, 2)}
                                                    </pre>
                                                </details>
                                            </div>
                                        )}

                                        {/* Default JSON View for other types */}
                                        {!['waveform', 'convert', 'slice', 'metadata', 'analyze'].includes(selectedJob.type) && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 transition-colors duration-300">Result</h4>
                                                <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 dark:text-gray-200 p-6 rounded-xl overflow-x-auto text-sm leading-relaxed transition-all duration-300">
                                                    {JSON.stringify(result, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    } catch (e) {
                        // Fallback to JSON view if parsing fails
                        return (
                            <div
                                className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300"
                                style={{ zIndex: 100000 }}
                                onClick={() => setSelectedJob(null)}
                            >
                                <div
                                    className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden transition-all duration-300"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700 transition-colors duration-300">
                                        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">
                                            Result — {selectedJob.audioFile.originalName}
                                        </h3>
                                        <button
                                            onClick={() => setSelectedJob(null)}
                                            className="text-2xl text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-300 ease-in-out hover:scale-110 transform"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <div className="p-6 overflow-auto max-h-[calc(90vh-80px)]">
                                        <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 dark:text-gray-200 p-6 rounded-xl overflow-x-auto text-sm leading-relaxed transition-all duration-300">
                                            {selectedJob.result}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        )
                    }
                })()}

                {/* Delete Confirmation Modal */}
                {deleteModalOpen && jobToDelete && (
                    <div
                        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[100001] transition-all duration-300"
                        onClick={closeDeleteModal}
                    >
                        <div
                            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all duration-300"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="bg-gradient-to-r from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 p-6 transition-all duration-300">
                                <div className="flex items-center gap-3 text-white">
                                    <div className="bg-white/20 dark:bg-white/10 p-3 rounded-full transition-all duration-300">
                                        <FaTrash className="text-2xl" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold">Delete Job</h3>
                                        <p className="text-red-100 dark:text-red-200 text-sm mt-1 transition-colors duration-300">This action cannot be undone</p>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-6 bg-white dark:bg-gray-800 transition-colors duration-300">
                                <p className="text-gray-700 dark:text-gray-200 mb-2 transition-colors duration-300">
                                    Are you sure you want to delete this job?
                                </p>
                                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 mt-4 transition-all duration-300">
                                    <div className="flex items-start gap-3">
                                        <FaMusic className="text-indigo-600 dark:text-indigo-400 text-xl mt-1 flex-shrink-0 transition-colors duration-300" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate transition-colors duration-300">
                                                {jobToDelete.audioFile?.originalName || 'Unknown file'}
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 transition-colors duration-300">
                                                Type: <span className="font-medium text-gray-700 dark:text-gray-300">{jobToDelete.type}</span>
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300">
                                                Status: <span className={`font-medium ${ jobToDelete.status === 'COMPLETED' ? 'text-emerald-600 dark:text-emerald-400' :
                                                    jobToDelete.status === 'PROCESSING' ? 'text-blue-600 dark:text-blue-400' :
                                                        jobToDelete.status === 'FAILED' ? 'text-red-600 dark:text-red-400' :
                                                            'text-gray-600 dark:text-gray-400'
                                                    } transition-colors duration-300`}>{jobToDelete.status}</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mt-4 transition-all duration-300">
                                    <p className="text-sm text-red-800 dark:text-red-300 flex items-start gap-2 transition-colors duration-300">
                                        <FaTimesCircle className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0 transition-colors duration-300" />
                                        <span>
                                            This will permanently delete the job and all associated files including the original upload and any processed outputs.
                                        </span>
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 flex gap-3 transition-colors duration-300">
                                <button
                                    onClick={closeDeleteModal}
                                    className="flex-1 px-4 py-3 bg-white dark:bg-gray-600 border-2 border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-500 hover:border-gray-400 dark:hover:border-gray-400 transition-all duration-300 ease-in-out"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 text-white font-semibold rounded-xl hover:from-red-600 hover:to-red-700 dark:hover:from-red-700 dark:hover:to-red-800 transition-all duration-300 ease-in-out shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                                >
                                    <FaTrash />
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
