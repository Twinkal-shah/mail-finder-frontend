'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Download, 
  Upload, 
  Trash2, 
  Plus, 
  Minus, 
  AlertCircle,
  History,
  Send
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { 
  HttpMethod, 
  HeaderPair, 
  ApiRequest, 
  ApiResponse, 
  RequestHistory, 
  PredefinedEndpoint,
  ApiTestingState 
} from '@/types/api-testing'
import { JsonEditor } from '@/components/api-testing/json-editor'
import { ResponseViewer } from '@/components/api-testing/response-viewer'

// Predefined endpoints for testing
const PREDEFINED_ENDPOINTS: PredefinedEndpoint[] = [
  {
    name: 'Ping',
    method: 'GET',
    url: '/api/ping',
    description: 'Simple connectivity check via Next.js rewrite to backend',
    headers: [
      { id: '1', key: 'Accept', value: 'text/plain', enabled: true }
    ]
  },
  {
    name: 'Health Check',
    method: 'GET',
    url: '/api/health',
    description: 'Check API health status',
    headers: [
      { id: '1', key: 'Content-Type', value: 'application/json', enabled: true }
    ]
  },
  {
    name: 'User Login',
    method: 'POST',
    url: '/api/user/login',
    description: 'Login via same-origin proxy. Returns tokens and user (no password).',
    headers: [
      { id: '1', key: 'Content-Type', value: 'application/json', enabled: true }
    ],
    body: JSON.stringify({
      email: 'someone@example.com',
      password: 'password'
    }, null, 2)
  },
  {
    name: 'User Signup (Proxied)',
    method: 'POST',
    url: process.env.NEXT_PUBLIC_BACKEND_SIGNUP_PATH || '/api/user/signup',
    description: 'Create account via backend proxied path. Required fields: email, password, firstName, lastName, phone. Set NEXT_PUBLIC_BACKEND_SIGNUP_PATH to override.',
    headers: [
      { id: '1', key: 'Content-Type', value: 'application/json', enabled: true }
    ],
    body: JSON.stringify({
      email: 'someone@example.com',
      password: 'password',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      company: 'Acme Inc'
    }, null, 2)
  },
  {
    name: 'User Me (Proxied)',
    method: 'GET',
    url: '/api/user/me',
    description: 'Get current user using backend session/cookies to confirm login works.',
    headers: [
      { id: '1', key: 'Accept', value: 'application/json', enabled: true }
    ]
  },
  {
    name: 'Find Email',
    method: 'POST',
    url: '/api/v1/find',
    description: 'Find email addresses',
    headers: [
      { id: '1', key: 'Content-Type', value: 'application/json', enabled: true },
      { id: '2', key: 'Authorization', value: 'Bearer YOUR_API_KEY', enabled: true }
    ],
    body: JSON.stringify({
      first_name: 'John',
      last_name: 'Doe',
      domain: 'example.com'
    }, null, 2)
  },
  {
    name: 'Verify Email',
    method: 'POST',
    url: '/api/v1/verify',
    description: 'Verify email address',
    headers: [
      { id: '1', key: 'Content-Type', value: 'application/json', enabled: true },
      { id: '2', key: 'Authorization', value: 'Bearer YOUR_API_KEY', enabled: true }
    ],
    body: JSON.stringify({
      email: 'john.doe@example.com'
    }, null, 2)
  }
]

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

export default function ApiCallsPage() {
  const [state, setState] = useState<ApiTestingState>({
    currentRequest: {
      id: crypto.randomUUID(),
      name: 'New Request',
      method: 'GET',
      url: '',
      headers: [
        { id: crypto.randomUUID(), key: 'Content-Type', value: 'application/json', enabled: true }
      ],
      body: '',
      timestamp: Date.now()
    },
    response: null,
    isLoading: false,
    error: null,
    history: [],
    selectedHistoryId: null
  })

  const [activeTab, setActiveTab] = useState('request')

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('api-testing-history')
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory)
        setState(prev => ({ ...prev, history }))
      } catch (error) {
        console.error('Failed to load history:', error)
      }
    }
  }, [])

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (state.history.length > 0) {
      localStorage.setItem('api-testing-history', JSON.stringify(state.history))
    }
  }, [state.history])

  const updateCurrentRequest = useCallback((updates: Partial<ApiRequest>) => {
    setState(prev => ({
      ...prev,
      currentRequest: { ...prev.currentRequest, ...updates }
    }))
  }, [])

  const addHeader = () => {
    const newHeader: HeaderPair = {
      id: crypto.randomUUID(),
      key: '',
      value: '',
      enabled: true
    }
    updateCurrentRequest({
      headers: [...state.currentRequest.headers, newHeader]
    })
  }

  const updateHeader = (id: string, updates: Partial<HeaderPair>) => {
    const updatedHeaders = state.currentRequest.headers.map(header =>
      header.id === id ? { ...header, ...updates } : header
    )
    updateCurrentRequest({ headers: updatedHeaders })
  }

  const removeHeader = (id: string) => {
    const filteredHeaders = state.currentRequest.headers.filter(header => header.id !== id)
    updateCurrentRequest({ headers: filteredHeaders })
  }

  const loadPredefinedEndpoint = (endpoint: PredefinedEndpoint) => {
    updateCurrentRequest({
      name: endpoint.name,
      method: endpoint.method,
      url: endpoint.url,
      headers: endpoint.headers || state.currentRequest.headers,
      body: endpoint.body || ''
    })
    setActiveTab('request')
    toast.success(`Loaded ${endpoint.name} endpoint`)
  }

  const validateRequest = (): boolean => {
    if (!state.currentRequest.url.trim()) {
      toast.error('URL is required')
      return false
    }

    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || window.location.origin).replace(/\/$/, '')
      const isAbsolute = state.currentRequest.url.startsWith('http')
      const relativePath = state.currentRequest.url.startsWith('/')
        ? state.currentRequest.url
        : `/${state.currentRequest.url}`
      const useSameOrigin = !isAbsolute && relativePath.startsWith('/api/')
      const urlToValidate = isAbsolute
        ? state.currentRequest.url
        : `${useSameOrigin ? window.location.origin : baseUrl}${relativePath}`
      new URL(urlToValidate)
    } catch {
      toast.error('Invalid URL format')
      return false
    }

    if (state.currentRequest.body.trim() && 
        ['POST', 'PUT', 'PATCH'].includes(state.currentRequest.method)) {
      try {
        JSON.parse(state.currentRequest.body)
      } catch {
        toast.error('Invalid JSON in request body')
        return false
      }
    }

    return true
  }

  const sendRequest = async () => {
    if (!validateRequest()) return

    setState(prev => ({ ...prev, isLoading: true, error: null, response: null }))
    const startTime = Date.now()

    try {
      // Prepare headers
      const enabledHeaders = state.currentRequest.headers
        .filter(h => h.enabled && h.key.trim())
        .reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {})

      // Prepare request options
      const requestOptions: RequestInit = {
        method: state.currentRequest.method,
        headers: enabledHeaders
      }

      // Add body for non-GET requests
      if (state.currentRequest.method !== 'GET' && state.currentRequest.body.trim()) {
        requestOptions.body = state.currentRequest.body
      }

      // Make the request
      const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || window.location.origin).replace(/\/$/, '')
      const isAbsolute = state.currentRequest.url.startsWith('http')
      const relativePath = state.currentRequest.url.startsWith('/') 
        ? state.currentRequest.url 
        : `/${state.currentRequest.url}`
      const useSameOrigin = !isAbsolute && relativePath.startsWith('/api/')
      const fullUrl = isAbsolute 
        ? state.currentRequest.url 
        : `${useSameOrigin ? window.location.origin : baseUrl}${relativePath}`

      const response = await fetch(fullUrl, requestOptions)
      
      // Parse response
      const responseText = await response.text()
      let responseData
      try {
        responseData = JSON.parse(responseText)
      } catch {
        responseData = responseText
      }

      // Get response headers
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      const endTime = Date.now()
      const apiResponse: ApiResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data: responseData,
        duration: endTime - startTime
      }

      // Add to history
      const historyEntry: RequestHistory = {
        request: { ...state.currentRequest },
        response: apiResponse,
        error: null,
        timestamp: Date.now()
      }

      setState(prev => ({
        ...prev,
        response: apiResponse,
        isLoading: false,
        history: [historyEntry, ...prev.history.slice(0, 49)] // Keep last 50 requests
      }))

      setActiveTab('response')
      toast.success(`Request completed in ${apiResponse.duration}ms`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      // Add to history with error
      const historyEntry: RequestHistory = {
        request: { ...state.currentRequest },
        response: null,
        error: errorMessage,
        timestamp: Date.now()
      }

      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
        history: [historyEntry, ...prev.history.slice(0, 49)]
      }))

      toast.error(`Request failed: ${errorMessage}`)
    }
  }

  const loadFromHistory = (historyItem: RequestHistory) => {
    updateCurrentRequest(historyItem.request)
    setState(prev => ({
      ...prev,
      response: historyItem.response,
      error: historyItem.error,
      selectedHistoryId: historyItem.request.id
    }))
    setActiveTab('request')
    toast.success('Request loaded from history')
  }

  const clearHistory = () => {
    setState(prev => ({ ...prev, history: [], selectedHistoryId: null }))
    localStorage.removeItem('api-testing-history')
    toast.success('History cleared')
  }

  const exportHistory = () => {
    const dataStr = JSON.stringify(state.history, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `api-testing-history-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('History exported')
  }

  const importHistory = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedHistory = JSON.parse(e.target?.result as string)
        setState(prev => ({ ...prev, history: importedHistory }))
        toast.success('History imported successfully')
      } catch {
        toast.error('Failed to import history: Invalid file format')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Testing</h1>
          <p className="text-muted-foreground">
            Test and debug your API endpoints with a comprehensive testing interface
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportHistory}
            disabled={state.history.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('import-file')?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <input
            id="import-file"
            type="file"
            accept=".json"
            onChange={importHistory}
            className="hidden"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Request/Response Area */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="request">Request Builder</TabsTrigger>
              <TabsTrigger value="response">Response</TabsTrigger>
            </TabsList>

            <TabsContent value="request" className="space-y-4">
              {/* Predefined Endpoints */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Start</CardTitle>
                  <CardDescription>
                    Select a predefined endpoint to get started quickly
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {PREDEFINED_ENDPOINTS.map((endpoint) => (
                      <Button
                        key={endpoint.name}
                        variant="outline"
                        className="justify-start h-auto p-3"
                        onClick={() => loadPredefinedEndpoint(endpoint)}
                      >
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {endpoint.method}
                            </Badge>
                            <span className="font-medium">{endpoint.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {endpoint.description}
                          </p>
                        </div>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Request Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Request Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Method and URL */}
                  <div className="flex gap-2">
                    <Select
                      value={state.currentRequest.method}
                      onValueChange={(method: HttpMethod) => updateCurrentRequest({ method })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HTTP_METHODS.map((method) => (
                          <SelectItem key={method} value={method}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Enter URL (e.g., /api/health or https://api.example.com/users)"
                      value={state.currentRequest.url}
                      onChange={(e) => updateCurrentRequest({ url: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      onClick={sendRequest}
                      disabled={state.isLoading || !state.currentRequest.url.trim()}
                      className="px-6"
                    >
                      {state.isLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sending
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Send
                        </div>
                      )}
                    </Button>
                  </div>

                  {/* Headers */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Headers</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addHeader}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Header
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {state.currentRequest.headers.map((header) => (
                        <div key={header.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={header.enabled}
                            onChange={(e) => updateHeader(header.id, { enabled: e.target.checked })}
                            className="rounded"
                          />
                          <Input
                            placeholder="Header name"
                            value={header.key}
                            onChange={(e) => updateHeader(header.id, { key: e.target.value })}
                            className="flex-1"
                          />
                          <Input
                            placeholder="Header value"
                            value={header.value}
                            onChange={(e) => updateHeader(header.id, { value: e.target.value })}
                            className="flex-1"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeHeader(header.id)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Request Body */}
                  {['POST', 'PUT', 'PATCH'].includes(state.currentRequest.method) && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Request Body</Label>
                      <JsonEditor
                        value={state.currentRequest.body}
                        onChange={(body) => updateCurrentRequest({ body })}
                        placeholder="Enter JSON request body..."
                        minHeight="150px"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="response">
              {state.error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}
              <ResponseViewer response={state.response} />
            </TabsContent>
          </Tabs>
        </div>

        {/* History Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Request History
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearHistory}
                  disabled={state.history.length === 0}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <CardDescription>
                {state.history.length} saved requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {state.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No requests in history yet
                  </p>
                ) : (
                  state.history.map((item) => (
                    <div
                      key={`${item.request.id}-${item.timestamp}`}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors",
                        state.selectedHistoryId === item.request.id && "bg-muted"
                      )}
                      onClick={() => loadFromHistory(item)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {item.request.method}
                          </Badge>
                          {item.response ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                item.response.status >= 200 && item.response.status < 300
                                  ? "text-green-600 border-green-600"
                                  : "text-red-600 border-red-600"
                              )}
                            >
                              {item.response.status}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Error
                            </Badge>
                          )}
                        </div>
                        {item.response && (
                          <span className="text-xs text-muted-foreground">
                            {item.response.duration}ms
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">
                        {item.request.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.request.url}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}