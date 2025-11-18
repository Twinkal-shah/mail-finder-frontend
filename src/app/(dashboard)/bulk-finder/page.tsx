'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Upload, Download, Play, Users, Clock, CheckCircle, XCircle, Pause } from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { submitBulkFinderJob, getBulkFinderJobStatus, stopBulkFinderJob, recoverStuckJobsAction } from './bulk-finder-actions'
import type { BulkFinderJob, BulkFindRequest } from './types'
import { useQueryInvalidation } from '@/lib/query-invalidation'

interface CsvRow {
  'Full Name'?: string
  'Domain'?: string
  'Role'?: string
  [key: string]: unknown
}

// Utility function to find column mapping
const findColumnMapping = (columns: string[]) => {
  const mapping: { fullName?: string; domain?: string; role?: string } = {}
  
  // Patterns for full name columns
  const fullNamePatterns = [
    /^full\s*name$/i,
    /^person\s*name$/i,
    /^name$/i,
    /^contact\s*name$/i,
    /^employee\s*name$/i,
    /^customer\s*name$/i,
    /^client\s*name$/i,
    /^lead\s*name$/i,
    /^prospect\s*name$/i,
    /^individual\s*name$/i
  ]
  
  // Patterns for domain columns
  const domainPatterns = [
    /^domain$/i,
    /^website\s*domain$/i,
    /^company\s*domain$/i,
    /^email\s*domain$/i,
    /^website$/i,
    /^company\s*website$/i,
    /^url$/i,
    /^site$/i,
    /^web\s*address$/i,
    /^company\s*url$/i,
    /^organization\s*domain$/i,
    /^business\s*domain$/i
  ]
  
  // Patterns for role columns
  const rolePatterns = [
    /^role$/i,
    /^position$/i,
    /^title$/i,
    /^job\s*title$/i,
    /^designation$/i,
    /^person\s*title$/i,
    /^work\s*title$/i,
    /^occupation$/i,
    /^function$/i
  ]
  
  // Find matching columns
  for (const column of columns) {
    if (!mapping.fullName && fullNamePatterns.some(pattern => pattern.test(column))) {
      mapping.fullName = column
    }
    if (!mapping.domain && domainPatterns.some(pattern => pattern.test(column))) {
      mapping.domain = column
    }
    if (!mapping.role && rolePatterns.some(pattern => pattern.test(column))) {
      mapping.role = column
    }
  }
  
  // Check for first name + last name combination if no full name found
  if (!mapping.fullName) {
    const firstNamePatterns = [
      /^first\s*name$/i,
      /^person\s*first\s*name$/i,
      /^fname$/i,
      /^given\s*name$/i
    ]
    const lastNamePatterns = [
      /^last\s*name$/i,
      /^person\s*last\s*name$/i,
      /^lname$/i,
      /^surname$/i,
      /^family\s*name$/i
    ]
    
    const firstName = columns.find(col => firstNamePatterns.some(pattern => pattern.test(col)))
    const lastName = columns.find(col => lastNamePatterns.some(pattern => pattern.test(col)))
    
    if (firstName && lastName) {
      mapping.fullName = `${firstName}+${lastName}` // Special marker for combination
    }
  }
  
  return mapping
}

// Utility function to extract full name from row
const extractFullName = (row: CsvRow, mapping: { fullName?: string }) => {
  if (!mapping.fullName) return ''
  
  if (mapping.fullName.includes('+')) {
    // Handle first name + last name combination
    const [firstName, lastName] = mapping.fullName.split('+')
    const first = (row[firstName] as string) || ''
    const last = (row[lastName] as string) || ''
    return `${first} ${last}`.trim()
  }
  
  return (row[mapping.fullName] as string) || ''
}

interface BulkRow extends CsvRow {
  id: string
  fullName: string
  domain: string
  role?: string
  email?: string
  confidence?: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  catch_all?: boolean
  user_name?: string
  mx?: string
  error?: string
}

export default function BulkFinderPage() {
  const [rows, setRows] = useState<BulkRow[]>([])
  const [currentJob, setCurrentJob] = useState<BulkFinderJob | null>(null)
  const [jobHistory, setJobHistory] = useState<BulkFinderJob[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [originalFileName, setOriginalFileName] = useState<string | null>(null)
  const [originalColumnOrder, setOriginalColumnOrder] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentJobRef = useRef<BulkFinderJob | null>(null)
  const { invalidateCreditsData } = useQueryInvalidation()

  // Wrapper to set currentJob and update ref
  const setCurrentJobAndRef = useCallback((job: BulkFinderJob | null) => {
    setCurrentJob(job)
    currentJobRef.current = job
  }, [])

  // Load user jobs on component mount
  useEffect(() => {
    // Only run on client side to prevent hydration mismatch
    if (typeof window === 'undefined') return
    
    // Initialize job persistence and load user jobs
    const initializeAndLoad = async () => {
      try {
        // Initialize job persistence to resume any stuck jobs
        const response = await fetch('/api/init-jobs', { method: 'POST' })
        if (!response.ok) {
          console.warn('Job persistence initialization failed, continuing without it')
        }
      } catch (error) {
        console.error('Error initializing job persistence:', error)
        // Continue without job persistence if it fails
      }
      
      // Load user jobs
      await loadUserJobs()
    }
    
    initializeAndLoad()
  }) // Note: Intentionally omitting loadUserJobs dependency to avoid circular dependency

  // Poll current job status with resilient error handling
  useEffect(() => {
    if (currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing')) {
      let retryCount = 0
      let pollInterval = 2000 // Start with 2 seconds
      let timeoutId: NodeJS.Timeout

      const pollJobStatus = async () => {
        try {
          const result = await getBulkFinderJobStatus(currentJob.jobId)
          
          if (result.success && result.job) {
            // Reset retry count on successful poll
            retryCount = 0
            pollInterval = 2000
            
            setCurrentJobAndRef(result.job)
            
            // Update rows with job data if available
            if (result.job.requestsData) {
              const updatedRows = result.job.requestsData.map((req: BulkFindRequest, index: number) => ({
                id: `row-${index}`,
                fullName: req.full_name,
                domain: req.domain,
                role: req.role,
                email: req.email,
                confidence: req.confidence,
                status: req.status || 'pending',
                catch_all: req.catch_all,
                user_name: req.user_name,
                mx: req.mx,
                error: req.error
              }))
              setRows(updatedRows)
            }
            
            // Stop polling if job is completed
            if (result.job.status === 'completed' || result.job.status === 'failed') {
              clearTimeout(timeoutId)
              
              // Add a small delay to ensure database is fully updated before refreshing job history
              setTimeout(() => {
                loadUserJobs() // Refresh job history
              }, 500)
              
              // Invalidate queries for real-time credit updates
              invalidateCreditsData()
              
              if (result.job.status === 'completed') {
                toast.success('Bulk finder job completed!')
              } else {
                toast.error('Bulk finder job failed')
              }
              return
            }
          } else {
            console.warn('Failed to get job status:', result.error)
            retryCount++
          }
        } catch (error) {
          console.error('Error polling job status:', error)
          retryCount++
          
          // Show user-friendly message for connection issues
          if (retryCount === 1) {
            console.log('Connection issue detected, retrying in background...')
          }
        }
        
        // Exponential backoff for retries, max 30 seconds
        if (retryCount > 0) {
          pollInterval = Math.min(2000 * Math.pow(2, retryCount - 1), 30000)
        }
        
        // Schedule next poll
        timeoutId = setTimeout(pollJobStatus, pollInterval)
      }

      // Start polling
      pollJobStatus()

      // Cleanup function
       return () => {
         clearTimeout(timeoutId)
       }
    }
  }) // Note: Intentionally omitting dependencies to avoid circular dependency issues with polling

  const loadUserJobs = useCallback(async () => {
    try {
      // First, attempt to recover any stuck jobs
      await recoverStuckJobsAction()
      
      const response = await fetch('/api/bulk-finder/jobs')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      
      if (data.jobs) {
        // Format the jobs to match the expected structure
        const formattedJobs: BulkFinderJob[] = data.jobs.map((job: {
          id: string;
          status: string;
          total_requests: number;
          processed_requests?: number;
          successful_finds?: number;
          failed_finds?: number;
          requests_data?: BulkFindRequest[];
          error_message?: string;
          filename?: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string;
        }) => ({
          jobId: job.id,
          status: job.status,
          totalRequests: job.total_requests,
          processedRequests: job.processed_requests,
          successfulFinds: job.successful_finds,
          failedFinds: job.failed_finds,
          requestsData: job.requests_data,
          errorMessage: job.error_message,
          filename: job.filename,
          createdAt: job.created_at,
          updatedAt: job.updated_at
        }))
        
        setJobHistory(formattedJobs)
        
        // Check if there's an active job
        const activeJob = formattedJobs.find(job => 
          job.status === 'pending' || job.status === 'processing'
        )
        if (activeJob) {
          setCurrentJobAndRef(activeJob)
        } else if (currentJobRef.current) {
          // If currentJob exists but is completed, update it with the latest data from job history
          const updatedCurrentJob = formattedJobs.find(job => job.jobId === currentJobRef.current!.jobId)
          if (updatedCurrentJob && (updatedCurrentJob.status === 'completed' || updatedCurrentJob.status === 'failed')) {
            setCurrentJobAndRef(updatedCurrentJob)
          }
        }
      }
    } catch (error) {
      console.error('Error loading user jobs:', error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidateCreditsData])

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Store the original filename (without extension for later use)
    const fileName = file.name.replace(/\.[^/.]+$/, '') // Remove extension
    setOriginalFileName(fileName)

    const fileExtension = file.name.split('.').pop()?.toLowerCase()

    if (fileExtension === 'csv') {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          // Store original column order from CSV headers
          const originalColumns = results.meta?.fields || []
          setOriginalColumnOrder(originalColumns)
          
          // Find column mapping
          const columnMapping = findColumnMapping(originalColumns)
          
          if (!columnMapping.fullName || !columnMapping.domain) {
            toast.error('Could not find required columns. Please ensure your CSV has columns for full name and domain.')
            return
          }
          
          const newRows: BulkRow[] = (results.data as CsvRow[])
            .filter((row: CsvRow) => {
              const fullName = extractFullName(row, columnMapping)
              const domain = columnMapping.domain ? (row[columnMapping.domain] as string) : ''
              return fullName && domain
            })
            .map((row: CsvRow, index: number) => {
              const fullName = extractFullName(row, columnMapping)
              const domain = columnMapping.domain ? (row[columnMapping.domain] as string) || '' : ''
              const role = columnMapping.role ? (row[columnMapping.role] as string) || '' : ''
              
              return {
                id: `row-${Date.now()}-${index}`,
                fullName,
                domain,
                role,
                status: 'pending' as const,
                ...row // Preserve all original columns
              }
            })
          
          setRows(newRows)
          toast.success(`Loaded ${newRows.length} rows from CSV`)
        },
        error: (error) => {
          toast.error('Failed to parse CSV file')
          console.error(error)
        }
      })
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as CsvRow[]
          
          // Store original column order from Excel headers
          const originalColumns = jsonData.length > 0 ? Object.keys(jsonData[0] as object) : []
          setOriginalColumnOrder(originalColumns)
          
          // Find column mapping
          const columnMapping = findColumnMapping(originalColumns)
          
          if (!columnMapping.fullName || !columnMapping.domain) {
            toast.error('Could not find required columns. Please ensure your Excel file has columns for full name and domain.')
            return
          }
          
          const newRows: BulkRow[] = jsonData
            .filter((row: CsvRow) => {
              const fullName = extractFullName(row, columnMapping)
              const domain = columnMapping.domain ? (row[columnMapping.domain] as string) : ''
              return fullName && domain
            })
            .map((row: CsvRow, index: number) => {
              const fullName = extractFullName(row, columnMapping)
              const domain = columnMapping.domain ? (row[columnMapping.domain] as string) || '' : ''
              const role = columnMapping.role ? (row[columnMapping.role] as string) || '' : ''
              
              return {
                id: `row-${Date.now()}-${index}`,
                fullName,
                domain,
                role,
                status: 'pending' as const,
                ...row // Preserve all original columns
              }
            })
          
          setRows(newRows)
          toast.success(`Loaded ${newRows.length} rows from Excel`)
        } catch (error) {
          toast.error('Failed to parse Excel file')
          console.error(error)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      toast.error('Please upload a CSV or Excel file')
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }



  const submitJob = async () => {
    const validRows = rows.filter(row => row.fullName && row.domain)
    
    if (validRows.length === 0) {
      toast.error('Please add at least one valid row with Full Name and Domain')
      return
    }

    setIsSubmitting(true)

    try {
      const requests: BulkFindRequest[] = validRows.map(row => {
        // Remove the id field and keep all other original columns
        const { fullName, domain, role, ...rowData } = row
        return {
          full_name: fullName,
          domain: domain,
          role: role,
          ...rowData // Include all original CSV columns
        }
      })

      const result = await submitBulkFinderJob(requests, originalFileName || undefined)
      
      if (result.success && result.jobId) {
        toast.success('Bulk finder job submitted successfully!')
        
        // Get the job details
        const jobResult = await getBulkFinderJobStatus(result.jobId)
        if (jobResult.success && jobResult.job) {
          setCurrentJobAndRef(jobResult.job)
        }
        
        // Clear the form
        setRows([])
      } else {
        toast.error(result.error || 'Failed to submit job')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const stopJob = async () => {
    if (!currentJob) return

    try {
      const result = await stopBulkFinderJob(currentJob.jobId)
      if (result.success) {
        toast.success('Job stopped successfully')
        setCurrentJobAndRef(null)
        loadUserJobs()
      } else {
        toast.error(result.error || 'Failed to stop job')
      }
    } catch {
      toast.error('An unexpected error occurred')
    }
  }

  const downloadResults = (job: BulkFinderJob) => {
    if (!job.requestsData) return

    // Define the finder result columns that should be appended
    const finderResultColumns = ['Email', 'Confidence', 'Status', 'Catch All', 'User Name', 'MX', 'Error']
    
    // Use stored original column order or extract from first row
    const columnsToUse = originalColumnOrder.length > 0 
      ? originalColumnOrder 
      : (job.requestsData.length > 0 ? Object.keys(job.requestsData[0]).filter(key => 
          !['email', 'confidence', 'status', 'catch_all', 'user_name', 'mx', 'error'].includes(key)
        ) : [])
    
    // Create ordered columns array: original columns + finder result columns
    const orderedColumns = [...columnsToUse, ...finderResultColumns]

    const csvData = job.requestsData.map(req => {
      // Extract known fields and preserve all original columns
      const { full_name, domain, role, email, confidence, status, catch_all, user_name, mx, error, ...originalColumns } = req
      
      // Create row data with original column names preserved
      const rowData: Record<string, string | number | boolean | null | undefined> = {}
      
      // Add original columns first
      columnsToUse.forEach(col => {
        if (col === 'Full Name' || col === 'full_name') {
          rowData[col] = full_name || (originalColumns[col] as string) || ''
        } else if (col === 'Domain' || col === 'domain') {
          rowData[col] = domain || (originalColumns[col] as string) || ''
        } else if (col === 'Role' || col === 'role') {
          rowData[col] = role || (originalColumns[col] as string) || ''
        } else {
          rowData[col] = (originalColumns[col] as string) || ''
        }
      })
      
      // Add finder result columns
      rowData['Email'] = email || ''
      rowData['Confidence'] = confidence || ''
      rowData['Status'] = status || ''
      rowData['Catch All'] = catch_all ? 'Yes' : 'No'
      rowData['User Name'] = user_name || ''
      rowData['MX'] = mx || ''
      rowData['Error'] = error || ''
      
      return rowData
    })

    const csv = Papa.unparse(csvData, { columns: orderedColumns })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Use original filename with 'result-' prefix if available, otherwise use default
    const downloadFileName = job.filename 
      ? `result-${job.filename.replace(/\.[^/.]+$/, '')}.csv` 
      : `bulk_finder_results_${job.jobId}.csv`
    a.download = downloadFileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    toast.success('Results downloaded successfully!')
  }

  const isJobActive = currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing')
  const progressPercentage = currentJob ? 
    Math.round((currentJob.processedRequests || 0) / currentJob.totalRequests * 100) : 0

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bulk Email Finder</h1>
        <p className="text-gray-600 mt-2">
          Expected columns: Full Name and Domain. Optional: Role.
        </p>
      </div>

      {/* Current Job Status */}
      {currentJob && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {currentJob.status === 'processing' && <Clock className="h-5 w-5 animate-spin" />}
              {currentJob.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-600" />}
              {currentJob.status === 'failed' && <XCircle className="h-5 w-5 text-red-600" />}
              {currentJob.status === 'pending' && <Clock className="h-5 w-5 text-yellow-600" />}
              Current Job Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Status: {currentJob.status}</span>
                <span className="text-sm text-gray-600">
                  {currentJob.processedRequests || 0} / {currentJob.totalRequests} processed
                </span>
              </div>
              
              {(currentJob.status === 'processing' || currentJob.status === 'pending') && (
                <Progress value={progressPercentage} className="w-full" />
              )}
              
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Successful: {currentJob.successfulFinds || 0} | Failed: {currentJob.failedFinds || 0}
                </div>
                <div className="flex gap-2">
                  {(currentJob.status === 'processing' || currentJob.status === 'pending') && (
                    <Button variant="outline" size="sm" onClick={stopJob}>
                      <Pause className="mr-2 h-4 w-4" />
                      Stop Job
                    </Button>
                  )}
                  {currentJob.status === 'completed' && (
                    <Button size="sm" onClick={() => downloadResults(currentJob)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download Results
                    </Button>
                  )}
                </div>
              </div>
              
              {currentJob.errorMessage && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                  Error: {currentJob.errorMessage}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload and Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Operations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div>
              <Label htmlFor="file-upload" className="sr-only">
                Upload CSV/XLSX
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                ref={fileInputRef}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isJobActive || isSubmitting}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV/XLSX
              </Button>
            </div>
            

            
            <Button
              onClick={submitJob}
              disabled={isJobActive || isSubmitting || rows.length === 0}
            >
              <Play className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Submitting...' : 'Submit Job'}
            </Button>
          </div>
        </CardContent>
      </Card>



      {/* Job History */}
      {jobHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Jobs</CardTitle>
            <CardDescription>
              Your recent bulk finder jobs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {jobHistory.map((job) => (
                <div key={job.jobId} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    {job.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-600" />}
                    {job.status === 'failed' && <XCircle className="h-5 w-5 text-red-600" />}
                    {job.status === 'processing' && <Clock className="h-5 w-5 text-blue-600 animate-spin" />}
                    {job.status === 'pending' && <Clock className="h-5 w-5 text-yellow-600" />}
                    
                    <div>
                      <p className="font-medium">
                        {job.filename || `${job.totalRequests} requests`} • {job.status}
                      </p>
                      <p className="text-sm text-gray-600">
                        {job.createdAt && new Date(job.createdAt).toLocaleString()}
                      </p>
                      {job.status === 'completed' && (
                        <p className="text-sm text-gray-600">
                          Found: {job.successfulFinds} • Failed: {job.failedFinds}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {job.status === 'completed' && (
                    <Button size="sm" onClick={() => downloadResults(job)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}