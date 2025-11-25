'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Upload, Download, Play, Shield, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { BulkVerificationJob, EmailData } from './types'
import { useQueryInvalidation } from '@/lib/query-invalidation'

interface VerifyRow extends CsvRow {
  id: number
  email: string
  status: 'pending' | 'processing' | 'valid' | 'invalid' | 'risky' | 'error' | 'unknown'
  catch_all?: boolean
  domain?: string
  mx?: string
  user_name?: string
}

interface CsvRow {
  Email?: string
  email?: string
  [key: string]: unknown
}

 

export default function VerifyPage() {
  const [singleEmail, setSingleEmail] = useState('')
  const [singleResult, setSingleResult] = useState<{ status: string; reason?: string; error?: string } | null>(null)
  const [isVerifyingSingle, setIsVerifyingSingle] = useState(false)
  const [rows, setRows] = useState<VerifyRow[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processedCount, setProcessedCount] = useState(0)
  const [validCount, setValidCount] = useState(0)
  const [invalidCount, setInvalidCount] = useState(0)
  const [unknownCount, setUnknownCount] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [results, setResults] = useState<{ email: string; status?: string; catch_all?: boolean; connections?: number; domain?: string; message?: string; mx?: string; time_exec?: number; user_name?: string }[]>([])
  const [currentJob, setCurrentJob] = useState<BulkVerificationJob | null>(null)
  const [originalFileName, setOriginalFileName] = useState<string>('')
  const [originalColumnOrder, setOriginalColumnOrder] = useState<string[]>([])
  const [allJobs, setAllJobs] = useState<BulkVerificationJob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { invalidateCreditsData } = useQueryInvalidation()
  // const [isSubmittingJob, setIsSubmittingJob] = useState(false) // Currently unused

  // Poll job status every 3 seconds
 

  // Load user's bulk verification jobs
  const loadUserJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/bulk-verify/jobs')
      if (!response.ok) return
      const data = await response.json()
      if (data.jobs) {
        setAllJobs(data.jobs)
      }
    } catch {}
  }, [])

  // Load jobs on component mount
  useEffect(() => {
    loadUserJobs()
  }, [loadUserJobs])

  const storageKey = 'verify:lastJob'
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
      if (raw) {
        const data = JSON.parse(raw)
        if (Array.isArray(data.rows)) setRows(data.rows)
        if (typeof data.originalFileName === 'string') setOriginalFileName(data.originalFileName)
        if (Array.isArray(data.originalColumnOrder)) setOriginalColumnOrder(data.originalColumnOrder)
        if (data.currentJob) setCurrentJob(data.currentJob)
      }
    } catch {}
  }, [])
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const payload = JSON.stringify({
        rows,
        originalFileName,
        originalColumnOrder,
        currentJob
      })
      window.localStorage.setItem(storageKey, payload)
    } catch {}
  }, [rows, originalFileName, originalColumnOrder, currentJob])

  // Update progress when current job changes
  useEffect(() => {
    if (currentJob && currentJob.totalEmails > 0) {
      const progressPercent = (currentJob.processedEmails || 0) / currentJob.totalEmails * 100
      setProgress(progressPercent)
      setProcessedCount(currentJob.processedEmails || 0)
    }
  }, [currentJob])

  const verifySingle = async () => {
    if (!singleEmail.trim()) {
      toast.error('Please enter an email address')
      return
    }

    setIsVerifyingSingle(true)
    setSingleResult(null)

    try {
      const response = await fetch('/verify/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: singleEmail }),
      })
      
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify email')
      }
      
      // Debug log to see the actual response
      console.log('API Response:', data)
      
      setSingleResult({ 
        status: data.status, 
        reason: typeof data.reason === 'string' && data.reason ? data.reason : undefined, 
        error: typeof data.error === 'string' && data.error ? data.error : undefined 
      })
      
      if (data.status === 'valid') {
        toast.success('Email is valid!')
      } else if (data.status === 'invalid') {
        toast.error('Email is invalid')
      } else if (data.status === 'risky') {
        toast.warning('Email is risky')
      } else if (data.status === 'error') {
        toast.error(data.error || 'Failed to verify email')
      }
      
      // Invalidate queries for real-time credit updates
      invalidateCreditsData()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to verify email'
      toast.error(errorMessage)
    } finally {
      setIsVerifyingSingle(false)
    }
  }

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
          
          const newRows: VerifyRow[] = (results.data as CsvRow[])
            .filter((row: CsvRow) => row['Email'] || row['email'])
            .map((row: CsvRow, index: number) => {
              const emailValue = row['Email'] || row['email'] || ''
              // Preserve all original columns and add our required fields
              return {
                id: index,
                email: emailValue,
                status: 'pending' as const,
                ...row // Spread all original columns
              }
            })
          
          setRows(newRows)
          toast.success(`Loaded ${newRows.length} emails from CSV`)
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
          const jsonData = XLSX.utils.sheet_to_json(worksheet)
          
          // Store original column order from Excel headers
          if (jsonData.length > 0) {
            const originalColumns = Object.keys(jsonData[0] as object)
            setOriginalColumnOrder(originalColumns)
          }
          
          const newRows: VerifyRow[] = (jsonData as CsvRow[])
            .filter((row: CsvRow) => row['Email'] || row['email'])
            .map((row: CsvRow, index: number) => {
              const emailValue = row['Email'] || row['email'] || ''
              // Preserve all original columns and add our required fields
              return {
                id: index,
                email: emailValue,
                status: 'pending' as const,
                ...row // Spread all original columns
              }
            })
          
          setRows(newRows)
          toast.success(`Loaded ${newRows.length} emails from Excel`)
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

  const runBulkVerify = async () => {
    const validRows = rows.filter(row => row.email)
    if (validRows.length === 0) {
      toast.error('Please add at least one valid email address')
      return
    }
    setIsProcessing(true)
    setProcessedCount(0)
    setProgress(0)
    const jobId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `job-${Date.now()}`
    setCurrentJob({
      jobId,
      status: 'processing',
      totalEmails: validRows.length,
      processedEmails: 0,
      successfulVerifications: 0,
      failedVerifications: 0,
      filename: originalFileName
    })
    try {
      const normalizeEmail = (e: string) => (e || '').trim().toLowerCase()
      const isValidEmail = (e: string) => /.+@.+\..+/.test(e)
      const emailsAll = rows
        .filter(r => r.email)
        .map(r => normalizeEmail(r.email))
        .filter(isValidEmail)

      const uniqueEmails = Array.from(new Set(emailsAll))

      setRows(prev => prev.map(r => {
        const ok = isValidEmail(normalizeEmail(r.email || ''))
        return ok ? r : { ...r, status: 'invalid' }
      }))

      const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      const chunk = (list: string[], size: number) => {
        const out: string[][] = []
        for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
        return out
      }
      const verifyBulkChunk = async (emailsBatch: string[]) => {
        const resp = await fetch(`${backend}/api/email/verifyBulkEmail`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ emails: emailsBatch })
        })
        const body = await resp.json()
        if (!resp.ok || body?.success === false) {
          const status = resp.status || body?.status
          throw { status, body }
        }
        return body?.data
      }
      const normalizeStatus = (s: unknown): VerifyRow['status'] => {
        const v = typeof s === 'string' ? s.toLowerCase() : ''
        if (v === 'valid' || v === 'deliverable' || v === 'ok') return 'valid'
        if (v === 'invalid' || v === 'undeliverable') return 'invalid'
        if (v === 'risky' || v === 'unknown' || v === 'catch_all' || v === 'catchall') return 'risky'
        if (v === 'error' || v === 'failed') return 'error'
        return 'unknown'
      }
      const chunkSize = 25
      const concurrency = 3
      const batches = chunk(uniqueEmails, chunkSize)
      const totals = { valid: 0, invalid: 0, unknown: 0, processed: 0 }
      let completed = 0
      const queue = [...batches]
      const minChunkSize = 5
      const backoffAttempts = new Map<string, number>()
      setStatusText(`Processing 0/${batches.length}`)
      setProgress(0)
      const workers = Array(concurrency).fill(0).map(async () => {
        while (queue.length) {
          const batch = queue.shift() as string[]
          try {
            const data = await verifyBulkChunk(batch)
            const s = data?.summary || {}
            const v = Number(s?.valid_emails || 0)
            const inv = Number(s?.invalid_emails || 0)
            const unk = Number(s?.unknown_emails || 0)
            const proc = Number(s?.total_emails || (Array.isArray(data?.results) ? data.results.length : 0))
            totals.valid += v
            totals.invalid += inv
            totals.unknown += unk
            totals.processed += proc
            const items: { email?: string; status?: string; result?: string; email_status?: string; catch_all?: boolean; connections?: number; domain?: string; message?: string; mx?: string; time_exec?: number; user_name?: string }[] = Array.isArray(data?.results) ? data.results : []
            if (items.length > 0) {
              setResults(prev => [...prev, ...items.map(it => ({
                email: it?.email || '',
                status: (it?.status ?? it?.result ?? it?.email_status),
                catch_all: it?.catch_all,
                connections: it?.connections,
                domain: it?.domain,
                message: it?.message,
                mx: it?.mx,
                time_exec: it?.time_exec,
                user_name: it?.user_name
              }))])
              setRows(prev => prev.map(r => {
                const found = items.find(it => normalizeEmail(it?.email || '') === normalizeEmail(r.email || ''))
                if (!found) return r
                const st = normalizeStatus(found?.status ?? found?.result ?? found?.email_status)
                return { ...r, status: st, catch_all: (typeof found.catch_all === 'boolean' ? found.catch_all : r.catch_all), domain: (typeof found.domain === 'string' ? found.domain : r.domain), mx: (typeof found.mx === 'string' ? found.mx : r.mx), user_name: (typeof found.user_name === 'string' ? found.user_name : r.user_name) }
              }))
            }
            setValidCount(prev => prev + v)
            setInvalidCount(prev => prev + inv)
            setUnknownCount(prev => prev + unk)
            setProcessedCount(prev => Math.min(prev + proc, validRows.length))
            setCurrentJob(prev => prev ? {
              ...prev,
              processedEmails: Math.min(totals.processed, validRows.length),
              successfulVerifications: totals.valid,
              failedVerifications: totals.invalid,
              status: 'processing'
            } : prev)
          } catch (err: unknown) {
            const status = (err as { status?: number }).status
            if (status === 504 && batch.length > minChunkSize) {
              const halves = chunk(batch, Math.max(minChunkSize, Math.floor(batch.length / 2)))
              queue.unshift(...halves)
              continue
            }
            if (status === 429) {
              const id = batch.join(',')
              const attempt = backoffAttempts.get(id) || 0
              if (attempt < 3) {
                const delay = Math.min(5000, 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300))
                await new Promise(r => setTimeout(r, delay))
                backoffAttempts.set(id, attempt + 1)
                queue.unshift(batch)
                continue
              }
            }
          } finally {
            completed++
            setStatusText(`Processing ${completed}/${batches.length}`)
            setProgress(Math.round((completed / batches.length) * 100))
          }
        }
      })
      await Promise.all(workers)
      setValidCount(totals.valid)
      setInvalidCount(totals.invalid)
      setUnknownCount(totals.unknown)
      setProcessedCount(Math.max(totals.processed, validRows.length))
      setCurrentJob(prev => prev ? {
        ...prev,
        status: 'completed',
        processedEmails: Math.max(totals.processed, validRows.length),
        successfulVerifications: totals.valid,
        failedVerifications: totals.invalid
      } : prev)
      setProgress(100)
      setIsProcessing(false)
      setStatusText('Completed')
      toast.success('Bulk verification completed')
      invalidateCreditsData()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to run bulk verification'
      toast.error(msg)
      setCurrentJob(prev => prev ? { ...prev, status: 'failed', errorMessage: msg } : prev)
      setIsProcessing(false)
    }
  }

  const downloadResults = () => {
    try {
      const cols = ['catch_all', 'connections', 'domain', 'email', 'message', 'mx', 'status', 'time_exec', 'user_name']
      const list = results.length > 0
        ? results.map(it => ({
            catch_all: it.catch_all,
            connections: it.connections,
            domain: it.domain,
            email: it.email,
            message: it.message,
            mx: it.mx,
            status: it.status,
            time_exec: it.time_exec,
            user_name: it.user_name
          }))
        : rows.map(r => ({
            catch_all: r.catch_all,
            connections: undefined,
            domain: r.domain,
            email: r.email,
            message: undefined,
            mx: r.mx,
            status: r.status,
            time_exec: undefined,
            user_name: r.user_name
          }))
      const csv = Papa.unparse(list, { columns: cols })
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const downloadFileName = originalFileName ? `${originalFileName}.csv` : `email-verification-results-${new Date().toISOString().split('T')[0]}.csv`
      a.download = downloadFileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('Results exported to CSV')
    } catch {
      toast.error('Failed to export results')
    }
  }

  

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Verify</h1>
        <p className="text-gray-600 mt-2">
          Verify email addresses for deliverability and validity.
        </p>
      </div>

      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <p className="text-blue-800">
              Emails found by Email Finder are already verified. You only need to use the Verifier for emails found elsewhere.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Single Email Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Single Email Verification
          </CardTitle>
          <CardDescription>
            Verify a single email address for deliverability.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="single-email">Email Address</Label>
              <Input
                id="single-email"
                type="email"
                placeholder="Enter email address"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                disabled={isVerifyingSingle}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={verifySingle}
                disabled={isVerifyingSingle || !singleEmail}
              >
                <Shield className="mr-2 h-4 w-4" />
                Verify Email
              </Button>
            </div>
          </div>
          
          {singleResult && (
            <Card className={`border-2 ${
              singleResult.status === 'valid' ? 'border-green-200 bg-green-50' :
              singleResult.status === 'invalid' ? 'border-red-200 bg-red-50' :
              singleResult.status === 'risky' ? 'border-yellow-200 bg-yellow-50' :
              'border-gray-200 bg-gray-50'
            }`}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  {singleResult.status === 'valid' && <CheckCircle className="h-5 w-5 text-green-600" />}
                  {singleResult.status === 'invalid' && <AlertCircle className="h-5 w-5 text-red-600" />}
                  {singleResult.status === 'risky' && <AlertCircle className="h-5 w-5 text-yellow-600" />}
                  <div>
                    <p className="font-medium">
                      Status: <span className="capitalize">{singleResult.status === 'valid' ? 'Valid' : singleResult.status}</span>
                    </p>
                    {singleResult.reason && singleResult.reason.trim() && (
                      <p className="text-sm text-gray-600">
                        Reason: {singleResult.reason}
                      </p>
                    )}
                    {singleResult.error && singleResult.error.trim() && (
                      <p className="text-sm text-red-600">
                        Error: {singleResult.error}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Bulk Email Verification */}
      <Card>
        <CardHeader>
          <CardTitle>Verify Your List</CardTitle>
          <CardDescription>
            Upload a CSV or Excel file with email addresses to verify in bulk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div>
              <Label htmlFor="file-upload" className="sr-only">
                Choose file
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
                disabled={isProcessing}
              >
                <Upload className="mr-2 h-4 w-4" />
                Choose file
              </Button>
            </div>
            
            <Button
              onClick={runBulkVerify}
              disabled={isProcessing || rows.length === 0}
            >
              <Play className="mr-2 h-4 w-4" />
              Start Bulk Verify
            </Button>
            

          </div>
        </CardContent>
      </Card>

      {/* Progress and Status */}
      {rows.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            {isProcessing ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium">{statusText || 'Verifying emails...'}</span>
                  <span className="text-sm text-gray-600">{processedCount} / {rows.length} completed</span>
                </div>
                <Progress value={progress} className="w-full h-3" />
                <div className="text-center text-sm text-gray-500">
                  {Math.round(progress)}% complete
                </div>
              </div>
            ) : currentJob?.status === 'completed' ? (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <span className="text-lg font-medium text-green-600">Verification Complete!</span>
                </div>
                <p className="text-sm text-gray-600">Processed {processedCount} emails</p>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{validCount}</p>
                    <p className="text-sm text-gray-600">Valid</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{invalidCount}</p>
                    <p className="text-sm text-gray-600">Invalid</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-600">{unknownCount}</p>
                    <p className="text-sm text-gray-600">Unknown</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{processedCount}</p>
                    <p className="text-sm text-gray-600">Processed</p>
                  </div>
                </div>
                <Button onClick={downloadResults} className="bg-green-600 hover:bg-green-700">
                  <Download className="mr-2 h-4 w-4" />
                  Download Results
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  {rows.length} emails loaded and ready for verification
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Current Job Status */}
      {currentJob && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {currentJob.status === 'processing' ? (
                <Clock className="h-5 w-5 text-blue-600" />
              ) : currentJob.status === 'completed' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              Current Job Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-medium">
                  Status: <span className="capitalize">{currentJob.status}</span>
                </span>
                <span className="text-sm text-gray-600">
                  {currentJob.processedEmails || 0} / {currentJob.totalEmails} emails processed
                </span>
              </div>
              
              {currentJob.totalEmails > 0 && (
                <Progress 
                  value={((currentJob.processedEmails || 0) / currentJob.totalEmails) * 100} 
                  className="w-full h-3" 
                />
              )}
              
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">{validCount}</p>
                  <p className="text-sm text-gray-600">Valid</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{invalidCount}</p>
                  <p className="text-sm text-gray-600">Invalid</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-600">{unknownCount}</p>
                  <p className="text-sm text-gray-600">Unknown</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{processedCount}</p>
                  <p className="text-sm text-gray-600">Processed</p>
                </div>
              </div>
              
              {currentJob.status === 'processing' && (
                <div className="text-center text-sm text-gray-500">
                  Processing in progress
                </div>
              )}
              
              {currentJob.status === 'completed' && currentJob.emailsData && (
                <div className="text-center">
                  <Button
                    onClick={() => {
                       // Define verification result columns that should be appended
                       const verificationResultColumns = ['catch_all', 'connections', 'domain', 'email', 'message', 'mx', 'status', 'time_exec', 'user_name']
                       
                       // Use stored original column order or extract from first row
                       const columnsToUse = originalColumnOrder.length > 0 
                         ? originalColumnOrder 
                         : (currentJob.emailsData && currentJob.emailsData.length > 0 ? Object.keys(currentJob.emailsData[0]).filter(key => 
                             !['catch_all', 'connections', 'domain', 'email', 'message', 'mx', 'status', 'time_exec', 'user_name'].includes(key)
                           ) : [])
                       
                       // Create ordered columns array: original columns + verification result columns
                       const orderedColumns = [...columnsToUse, ...verificationResultColumns]
                       
                       const csvContent = Papa.unparse(currentJob.emailsData || [], { columns: orderedColumns })
                       const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                       const link = document.createElement('a')
                       const url = URL.createObjectURL(blob)
                       link.setAttribute('href', url)
                       const downloadFileName = currentJob.filename 
                         ? `result-${currentJob.filename.replace(/\.[^/.]+$/, '')}.csv`
                         : `bulk_verification_results_${currentJob.jobId}.csv`
                       link.setAttribute('download', downloadFileName)
                       link.style.visibility = 'hidden'
                       document.body.appendChild(link)
                       link.click()
                       document.body.removeChild(link)
                     }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Results
                  </Button>
                </div>
              )}
              
              {currentJob.status === 'failed' && currentJob.emailsData && (currentJob.processedEmails || 0) > 0 && (
                <div className="text-center">
                  <Button
                    onClick={() => {
                       // Define verification result columns that should be appended
                       const verificationResultColumns = ['catch_all', 'connections', 'domain', 'email', 'message', 'mx', 'status', 'time_exec', 'user_name']
                       
                       // Use stored original column order or extract from first row
                       const columnsToUse = originalColumnOrder.length > 0 
                         ? originalColumnOrder 
                         : (currentJob.emailsData && currentJob.emailsData.length > 0 ? Object.keys(currentJob.emailsData[0]).filter(key => 
                             !['catch_all', 'connections', 'domain', 'email', 'message', 'mx', 'status', 'time_exec', 'user_name'].includes(key)
                           ) : [])
                       
                       // Create ordered columns array: original columns + verification result columns
                       const orderedColumns = [...columnsToUse, ...verificationResultColumns]
                       
                       const csvContent = Papa.unparse(currentJob.emailsData || [], { columns: orderedColumns })
                       const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                       const link = document.createElement('a')
                       const url = URL.createObjectURL(blob)
                       link.setAttribute('href', url)
                       const downloadFileName = currentJob.filename 
                         ? `result-${currentJob.filename.replace(/\.[^/.]+$/, '')}.csv`
                         : `partial_verification_results_${currentJob.jobId}.csv`
                       link.setAttribute('download', downloadFileName)
                       link.style.visibility = 'hidden'
                       document.body.appendChild(link)
                       link.click()
                       document.body.removeChild(link)
                     }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Partial Results
                  </Button>
                </div>
              )}
              
              {currentJob.errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">
                    Error: {currentJob.errorMessage}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job History */}
      {allJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Job History</CardTitle>
            <CardDescription>
              Your recent bulk verification jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allJobs.map((job) => (
                 <div key={job.jobId} className="flex items-center justify-between p-3 border rounded-lg">
                   <div className="flex items-center gap-3">
                     {job.status === 'processing' ? (
                       <Clock className="h-4 w-4 text-blue-600" />
                     ) : job.status === 'completed' ? (
                       <CheckCircle className="h-4 w-4 text-green-600" />
                     ) : (
                       <AlertCircle className="h-4 w-4 text-red-600" />
                     )}
                     <div>
                       <p className="font-medium">{job.filename || `Job ${job.jobId}`}</p>
                       <p className="text-sm text-gray-600">
                         {job.processedEmails || 0} / {job.totalEmails} emails • {job.status}
                       </p>
                     </div>
                   </div>
                   <div className="text-right">
                     <p className="text-sm text-gray-600">
                       {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'N/A'}
                     </p>
                     {job.status === 'completed' && job.emailsData && (
                       <Button
                         size="sm"
                         variant="outline"
                         onClick={() => {
                           // Define verification result columns to append
                           const verificationColumns = ['catch_all', 'connections', 'domain', 'email', 'message', 'mx', 'status', 'time_exec', 'user_name']
                           
                           // Use stored original column order if available, otherwise extract from first row
                           let columnsToUse = originalColumnOrder
                           if (columnsToUse.length === 0 && job.emailsData && job.emailsData.length > 0) {
                             const firstRow = job.emailsData[0]
                             columnsToUse = Object.keys(firstRow).filter(key => !verificationColumns.includes(key))
                           }
                           
                           // Create ordered columns: original columns first, then verification results
                           const orderedColumns = [...columnsToUse, ...verificationColumns]
                           
                           // Prepare data with proper column ordering
                           const exportData = (job.emailsData || []).map((row: EmailData) => {
                             const orderedRow: Record<string, unknown> = {}
                             
                             // Add original columns in their original order
                             columnsToUse.forEach(col => {
                               orderedRow[col] = row[col]
                             })
                             
                             // Add verification result columns
                             verificationColumns.forEach(col => {
                               orderedRow[col] = row[col]
                             })
                             
                             return orderedRow
                           })
                           
                           const csvContent = Papa.unparse(exportData, { columns: orderedColumns })
                           const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                           const link = document.createElement('a')
                           const url = URL.createObjectURL(blob)
                           link.setAttribute('href', url)
                           const downloadFileName = job.filename 
                             ? `result-${job.filename.replace(/\.[^/.]+$/, '')}.csv`
                             : `bulk_verification_results_${job.jobId}.csv`
                           link.setAttribute('download', downloadFileName)
                           link.style.visibility = 'hidden'
                           document.body.appendChild(link)
                           link.click()
                           document.body.removeChild(link)
                         }}
                         className="mt-1"
                       >
                         <Download className="h-3 w-3" />
                       </Button>
                     )}
                   </div>
                 </div>
               ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
