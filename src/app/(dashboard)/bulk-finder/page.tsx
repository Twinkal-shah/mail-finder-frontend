'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Upload, Download, Play, Users, CheckCircle } from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
// Job endpoints are not available; direct bulk find only
import { useQueryInvalidation } from '@/lib/query-invalidation'
import { bulkFind } from '@/lib/bulk-find-utils'

interface CsvRow {
  'Full Name'?: string
  'Domain'?: string
  'Role'?: string
  [key: string]: unknown
}

const normalizeColumnName = (name: string) => {
  const withSpaces = name.replace(/([a-z])([A-Z])/g, '$1 $2')
  return withSpaces.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const findColumnMapping = (columns: string[]) => {
  const mapping: { fullName?: string; domain?: string; role?: string } = {}
  const fullNameTargets = ['full name', 'person name', 'name', 'contact name', 'employee name', 'customer name', 'client name', 'lead name', 'prospect name', 'individual name']
  const domainTargets = ['domain', 'website domain', 'company domain', 'email domain', 'website', 'company website', 'url', 'site', 'web address', 'company url', 'organization domain', 'business domain']
  const roleTargets = ['role', 'position', 'title', 'job title', 'designation', 'person title', 'work title', 'occupation', 'function']
  const firstNameTargets = ['first name', 'person first name', 'fname', 'given name', 'firstname', 'first']
  const lastNameTargets = ['last name', 'person last name', 'lname', 'surname', 'family name', 'lastname', 'last', 'family']

  const normalized = columns.map(c => ({ orig: c, norm: normalizeColumnName(c) }))

  for (const col of normalized) {
    if (!mapping.fullName && fullNameTargets.includes(col.norm)) mapping.fullName = col.orig
    if (!mapping.domain && domainTargets.includes(col.norm)) mapping.domain = col.orig
    if (!mapping.role && roleTargets.includes(col.norm)) mapping.role = col.orig
  }

  if (!mapping.fullName) {
    const first = normalized.find(c => firstNameTargets.includes(c.norm))
    const last = normalized.find(c => lastNameTargets.includes(c.norm))
    if (first && last) mapping.fullName = `${first.orig}+${last.orig}`
  }

  return mapping
}

const extractFullName = (row: CsvRow, mapping: { fullName?: string }) => {
  if (!mapping.fullName) return ''
  if (mapping.fullName.includes('+')) {
    const [firstName, lastName] = mapping.fullName.split('+')
    const first = ((row[firstName] as string) || '').trim()
    const last = ((row[lastName] as string) || '').trim()
    return `${first} ${last}`.trim()
  }
  return ((row[mapping.fullName] as string) || '').trim()
}

const extractFirstLast = (row: CsvRow, mapping: { fullName?: string }): { first_name: string; last_name: string } => {
  if (!mapping.fullName) return { first_name: '', last_name: '' }
  if (mapping.fullName.includes('+')) {
    const [firstName, lastName] = mapping.fullName.split('+')
    const first = ((row[firstName] as string) || '').trim()
    const last = ((row[lastName] as string) || '').trim()
    return { first_name: first, last_name: last }
  }
  const full = ((row[mapping.fullName] as string) || '').trim()
  const parts = full.split(/\s+/)
  const first = parts[0] || ''
  const last = parts.slice(1).join(' ') || ''
  return { first_name: first, last_name: last }
}

const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()

const normalizeDomain = (value: string) => {
  let s = (value || '').trim()
  s = s.replace(/^`+|`+$/g, '')
  s = s.replace(/^"+|"+$/g, '')
  s = s.replace(/^'+|'+$/g, '')
  s = s.replace(/\s+/g, '')
  try {
    if (/^[a-zA-Z]+:\/\//.test(s)) {
      const u = new URL(s)
      s = u.hostname
    } else {
      if (s.includes('@')) s = s.split('@').pop() as string
      s = s.split('/')[0]
      s = s.split('?')[0]
      s = s.split('#')[0]
    }
  } catch {}
  s = s.replace(/^www\./i, '')
  s = s.replace(/^[\s\.,;]+|[\s\.,;]+$/g, '')
  s = s.toLowerCase()
  const isHostname = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(s)
  return isHostname ? s : ''
}

const getRowValueCI = (row: CsvRow, key?: string) => {
  if (!key) return ''
  const match = Object.keys(row).find(k => k.toLowerCase().trim() === key.toLowerCase().trim())
  if (!match) return ''
  const v = (row as Record<string, unknown>)[match]
  return typeof v === 'string' ? v : ''
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
  result_status?: string
}

export default function BulkFinderPage() {
  const [rows, setRows] = useState<BulkRow[]>([])
  const [originalFileName, setOriginalFileName] = useState<string | null>(null)
  const [originalColumnOrder, setOriginalColumnOrder] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { invalidateCreditsData } = useQueryInvalidation()
  const [isProcessingDirect, setIsProcessingDirect] = useState(false)
  const [progressDirect, setProgressDirect] = useState(0)
  const [processedDirectCount, setProcessedDirectCount] = useState(0)
  const [successDirectCount, setSuccessDirectCount] = useState(0)
  const [failedDirectCount, setFailedDirectCount] = useState(0)
  const [statusDirectText, setStatusDirectText] = useState('')

  // No job-based endpoints on backend; page runs direct bulk find only

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
            toast.error('Could not find required columns. Please include Full Name or First/Last Name, and Domain.')
            return
          }
          
          const newRows: BulkRow[] = (results.data as CsvRow[])
            .filter((row: CsvRow) => {
              const fullName = extractFullName(row, columnMapping)
              const rawDomain = getRowValueCI(row, columnMapping.domain)
              const domain = normalizeDomain(rawDomain)
              return fullName && domain
            })
            .map((row: CsvRow, index: number) => {
              const fullName = extractFullName(row, columnMapping)
              const rawDomain = getRowValueCI(row, columnMapping.domain)
              const domain = normalizeDomain(rawDomain)
              const role = getRowValueCI(row, columnMapping.role)
              return {
                id: `row-${Date.now()}-${index}`,
                fullName,
                domain,
                role,
                status: 'pending' as const,
                ...row
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
            toast.error('Could not find required columns. Please include Full Name or First/Last Name, and Domain.')
            return
          }
          
          const newRows: BulkRow[] = jsonData
            .filter((row: CsvRow) => {
              const fullName = extractFullName(row, columnMapping)
              const rawDomain = getRowValueCI(row, columnMapping.domain)
              const domain = normalizeDomain(rawDomain)
              return fullName && domain
            })
            .map((row: CsvRow, index: number) => {
              const fullName = extractFullName(row, columnMapping)
              const rawDomain = getRowValueCI(row, columnMapping.domain)
              const domain = normalizeDomain(rawDomain)
              const role = getRowValueCI(row, columnMapping.role)
              return {
                id: `row-${Date.now()}-${index}`,
                fullName,
                domain,
                role,
                status: 'pending' as const,
                ...row
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



  // Removed job-based actions

  const runDirectFind = async () => {
    const validRows = rows.filter(r => r.fullName && normalizeDomain(r.domain))
    if (validRows.length === 0) {
      toast.error('Please add at least one valid row with Full Name and Domain')
      return
    }
    setIsProcessingDirect(true)
    setProcessedDirectCount(0)
    setProgressDirect(0)
    setSuccessDirectCount(0)
    setFailedDirectCount(0)
    setStatusDirectText('')
    setRows(prev => prev.map(r => ({ ...r, status: 'processing' })))
    try {
      const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

      let creditsFind = 0
      let creditsVerify = 0
      try {
        const localRes = await fetch('/api/user/credits', { method: 'GET' })
        if (localRes.ok) {
          const cd = await localRes.json()
          creditsFind = Number(cd?.credits_find ?? cd?.find ?? 0)
          creditsVerify = Number(cd?.credits_verify ?? cd?.verify ?? 0)
        }
      } catch {}
      if ((creditsFind + creditsVerify) === 0) {
        try {
          const raw = typeof window !== 'undefined' ? localStorage.getItem('user_data') : null
          const ud = raw ? JSON.parse(raw) : {}
          creditsFind = Number(ud?.credits_find ?? 0)
          creditsVerify = Number(ud?.credits_verify ?? 0)
        } catch {}
      }
      const totalRequests = validRows.length
      if (creditsFind > 0 && totalRequests > creditsFind) {
        toast.error('You don\'t have sufficient credits to find emails.')
        setIsProcessingDirect(false)
        return
      }
      if (creditsFind <= 0 && creditsVerify < totalRequests) {
        toast.error('You don\'t have sufficient credits to find emails.')
        setIsProcessingDirect(false)
        return
      }
      setStatusDirectText('Processing 0/...')
      setProgressDirect(0)
      const { items, totalCredits } = await bulkFind(
        validRows.map(r => ({ fullName: r.fullName, domain: r.domain })),
        5,
        2,
        (completed, total) => {
          setStatusDirectText(`Processing ${completed}/${total}`)
          setProgressDirect(Math.round((completed / total) * 100))
        }
      )
      const updates = new Map<string, BulkRow>()
      const matchedIds = new Set<string>()
      const domainQueues = new Map<string, BulkRow[]>()
      for (const row of validRows) {
        const key = (row.domain || '').toLowerCase().trim()
        const arr = domainQueues.get(key)
        if (arr) arr.push(row)
        else domainQueues.set(key, [row])
      }
      const allQueue = [...validRows]
      let foundCount = 0
      const tryMatchRowByEmail = (emailVal: string): BulkRow | undefined => {
        const [localPart, domPart] = (emailVal || '').split('@')
        if (!localPart || !domPart) return undefined
        const domainNorm = domPart.toLowerCase().trim()
        for (const row of validRows) {
          if (matchedIds.has(row.id)) continue
          const rowDomainNorm = (row.domain || '').toLowerCase().trim()
          if (rowDomainNorm !== domainNorm) continue
          const parts = (row.fullName || '').toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/)
          const fn = (parts[0] || '').replace(/\s+/g, '')
          const ln = (parts.slice(1).join(' ') || '').replace(/\s+/g, '')
          const localNorm = localPart.toLowerCase().replace(/\.|_/g, '')
          const combos = new Set<string>([
            fn,
            ln,
            fn + ln,
            fn + '.' + ln,
            fn + '_' + ln,
            (fn[0] || '') + ln,
            fn + (ln[0] || ''),
            (ln[0] || '') + fn,
            ln + (fn[0] || '')
          ].map(s => s.replace(/\.|_/g, '')))
          if (combos.has(localNorm) || (localNorm.includes(fn) && localNorm.includes(ln))) {
            return row
          }
        }
        return undefined
      }
      for (const it of items) {
        const obj = it as Record<string, unknown>
        const emailVal = typeof obj.email === 'string' ? (obj.email as string) : ''
        const statusVal = typeof obj.status === 'string' ? (obj.status as string) : undefined
        const domainVal = typeof obj.domain === 'string' ? (obj.domain as string) : ''
        let row: BulkRow | undefined
        if (emailVal) row = tryMatchRowByEmail(emailVal)
        if (!row && domainVal) {
          const key = domainVal.toLowerCase().trim()
          const dq = domainQueues.get(key) || []
          while (dq.length && !row) {
            const candidate = dq[0]
            if (!matchedIds.has(candidate.id)) row = candidate
            dq.shift()
          }
          domainQueues.set(key, dq)
        }
        if (!row) {
          while (allQueue.length && !row) {
            const candidate = allQueue[0]
            if (!matchedIds.has(candidate.id)) row = candidate
            allQueue.shift()
          }
        }
        if (!row) continue
        matchedIds.add(row.id)
        const confidenceVal = typeof obj.confidence === 'number' ? (obj.confidence as number) : row.confidence
        const catchAllVal = typeof obj.catch_all === 'boolean' ? (obj.catch_all as boolean) : row.catch_all
        const userNameVal = typeof obj.user_name === 'string' ? (obj.user_name as string) : (emailVal ? emailVal.split('@')[0] : row.user_name)
        const mxVal = typeof obj.mx === 'string' ? (obj.mx as string) : row.mx
        const errorVal = typeof obj.error === 'string' ? (obj.error as string) : (typeof obj.message === 'string' ? (obj.message as string) : undefined)
        const uiStatus: BulkRow['status'] = statusVal === 'found' || statusVal === 'invalid' ? 'completed' : (statusVal ? 'failed' : 'completed')
        if (statusVal === 'found') foundCount++
        const updated: BulkRow = {
          ...row,
          email: emailVal || row.email,
          confidence: confidenceVal,
          status: uiStatus,
          catch_all: catchAllVal,
          user_name: userNameVal,
          mx: mxVal,
          error: errorVal,
          result_status: statusVal
        }
        updates.set(row.id, updated)
      }
      for (const row of validRows) {
        if (!matchedIds.has(row.id)) {
          updates.set(row.id, { ...row, status: 'failed', error: 'Not Found', result_status: 'invalid' })
        }
      }
      const totals = { processed: validRows.length, found: foundCount, notFound: Math.max(0, validRows.length - foundCount) }
      setProcessedDirectCount(totals.processed)
      setSuccessDirectCount(totals.found)
      setFailedDirectCount(totals.notFound)
      setRows(prev => prev.map(r => updates.has(r.id) ? (updates.get(r.id) as BulkRow) : r))
      setProgressDirect(100)
      setIsProcessingDirect(false)
      setStatusDirectText('Completed')
      toast.success(`Bulk find completed${totalCredits ? ` • Credits used: ${totalCredits}` : ''}`)
      invalidateCreditsData()
    } catch (e) {
      setIsProcessingDirect(false)
      const msg = e instanceof Error ? e.message : 'Failed to run bulk find'
      toast.error(msg)
      setRows(prev => prev.map(r => r.status === 'processing' ? { ...r, status: 'failed', error: msg } : r))
    }
  }

  const downloadDirectResults = () => {
    const finderResultColumns = ['Email', 'Confidence', 'Status', 'Catch All', 'User Name', 'MX', 'Error']
    const columnsToUse = originalColumnOrder.length > 0
      ? originalColumnOrder
      : (rows.length > 0 ? Object.keys(rows[0]).filter(key => !['email', 'confidence', 'status', 'catch_all', 'user_name', 'mx', 'error', 'result_status'].includes(key)) : [])
    const orderedColumns = Array.from(new Set([...columnsToUse, ...finderResultColumns]))
    const csvData = rows.map(row => {
      const { fullName, domain, role, email, confidence, result_status, catch_all, user_name, mx, error, ...originalColumns } = row
      const rowData: Record<string, string | number | boolean | null | undefined> = {}
      columnsToUse.forEach(col => {
        if (col === 'Full Name' || col === 'full_name' || col === 'fullName') {
          rowData[col] = fullName || (originalColumns[col] as string) || ''
        } else if (col === 'Domain' || col === 'domain' || col === 'Website' || col === 'website') {
          rowData[col] = domain || (originalColumns[col] as string) || ''
        } else if (col === 'Role' || col === 'role') {
          rowData[col] = role || (originalColumns[col] as string) || ''
        } else {
          rowData[col] = (originalColumns[col] as string) || ''
        }
      })
      rowData['Email'] = email || ''
      rowData['Confidence'] = typeof confidence === 'number' ? confidence : ''
      rowData['Status'] = result_status || ''
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
    const downloadFileName = originalFileName 
      ? `result-${originalFileName.replace(/\.[^/.]+$/, '')}.csv` 
      : `bulk_finder_results_${new Date().toISOString().split('T')[0]}.csv`
    a.download = downloadFileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    toast.success('Results exported to CSV')
  }

  // No job-based status

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bulk Email Finder</h1>
        <p className="text-gray-600 mt-2">
          Expected columns: Full Name and Domain. Optional: Role.
        </p>
      </div>

      {/* Job status removed */}

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
                disabled={isProcessingDirect}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV/XLSX
              </Button>
            </div>
            

            
            {/* Submit job removed */}
            <Button
              onClick={runDirectFind}
              disabled={rows.length === 0 || isProcessingDirect}
            >
              <Play className="mr-2 h-4 w-4" />
              {isProcessingDirect ? 'Processing...' : 'Start Direct Bulk Find'}
            </Button>
            <Button
              variant="outline"
              onClick={downloadDirectResults}
              disabled={rows.length === 0 || isProcessingDirect}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Results
            </Button>
          </div>
        </CardContent>
      </Card>



      {rows.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            {isProcessingDirect ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium">{statusDirectText || 'Finding emails...'}</span>
                  <span className="text-sm text-gray-600">{processedDirectCount} / {rows.length} processed</span>
                </div>
                <Progress value={progressDirect} className="w-full h-3" />
                <div className="text-center text-sm text-gray-500">{Math.round(progressDirect)}% complete</div>
              </div>
            ) : (processedDirectCount > 0 ? (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <span className="text-lg font-medium text-green-600">Bulk Find Complete</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{successDirectCount}</p>
                    <p className="text-sm text-gray-600">Found</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{failedDirectCount}</p>
                    <p className="text-sm text-gray-600">Not Found</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{processedDirectCount}</p>
                    <p className="text-sm text-gray-600">Processed</p>
                  </div>
                </div>
                <Button onClick={downloadDirectResults}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Results
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-gray-600">{rows.length} rows loaded and ready for bulk find</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {/* Job history removed */}
    </div>
  )
}
