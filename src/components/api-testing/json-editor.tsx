'use client'

import { useState, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
}

export function JsonEditor({ 
  value, 
  onChange, 
  placeholder = "Enter JSON...", 
  className,
  minHeight = "200px" 
}: JsonEditorProps) {
  const [isValid, setIsValid] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!value.trim()) {
      setIsValid(true)
      setError(null)
      return
    }

    try {
      JSON.parse(value)
      setIsValid(true)
      setError(null)
    } catch (err) {
      setIsValid(false)
      setError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }, [value])

  const formatJson = () => {
    try {
      const parsed = JSON.parse(value)
      const formatted = JSON.stringify(parsed, null, 2)
      onChange(formatted)
    } catch {
      // If parsing fails, don't change the value
    }
  }

  const minifyJson = () => {
    try {
      const parsed = JSON.parse(value)
      const minified = JSON.stringify(parsed)
      onChange(minified)
    } catch {
      // If parsing fails, don't change the value
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {value.trim() && (
            <div className="flex items-center gap-1">
              {isValid ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <span className={cn(
                "text-xs",
                isValid ? "text-green-600" : "text-red-600"
              )}>
                {isValid ? "Valid JSON" : "Invalid JSON"}
              </span>
            </div>
          )}
        </div>
        
        {value.trim() && isValid && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={formatJson}
              className="text-xs"
            >
              Format
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={minifyJson}
              className="text-xs"
            >
              Minify
            </Button>
          </div>
        )}
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "font-mono text-sm resize-none",
          !isValid && "border-red-500 focus:border-red-500",
          className
        )}
        style={{ minHeight }}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {error}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}