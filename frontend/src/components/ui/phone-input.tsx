'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const COUNTRY_CODES = [
  { code: '+57',  flag: '🇨🇴', label: 'CO' },
  { code: '+1',   flag: '🇺🇸', label: 'US' },
  { code: '+52',  flag: '🇲🇽', label: 'MX' },
  { code: '+54',  flag: '🇦🇷', label: 'AR' },
  { code: '+56',  flag: '🇨🇱', label: 'CL' },
  { code: '+51',  flag: '🇵🇪', label: 'PE' },
  { code: '+58',  flag: '🇻🇪', label: 'VE' },
  { code: '+593', flag: '🇪🇨', label: 'EC' },
  { code: '+502', flag: '🇬🇹', label: 'GT' },
  { code: '+34',  flag: '🇪🇸', label: 'ES' },
  { code: '+44',  flag: '🇬🇧', label: 'GB' },
  { code: '+55',  flag: '🇧🇷', label: 'BR' },
]

interface PhoneInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  error?: boolean
  disabled?: boolean
  id?: string
}

export function PhoneInput({
  value = '',
  onChange,
  placeholder = '3001234567',
  className,
  error,
  disabled,
  id,
}: PhoneInputProps) {
  // Parsea el valor inicial: "+57 3001234567" → { dialCode: "+57", number: "3001234567" }
  const parse = (v: string) => {
    const match = COUNTRY_CODES.find(c => v.startsWith(c.code + ' '))
    if (match) return { dialCode: match.code, number: v.slice(match.code.length + 1) }
    return { dialCode: '+57', number: v }
  }

  const parsed = parse(value)
  const [dialCode, setDialCode] = React.useState(parsed.dialCode)
  const [number, setNumber] = React.useState(parsed.number)

  const emit = (dc: string, num: string) => {
    onChange?.(num ? `${dc} ${num}` : '')
  }

  const handleDialCode = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDialCode(e.target.value)
    emit(e.target.value, number)
  }

  const handleNumber = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = e.target.value.replace(/\D/g, '')
    setNumber(num)
    emit(dialCode, num)
  }

  return (
    <div className={cn('flex', className)}>
      <select
        value={dialCode}
        onChange={handleDialCode}
        disabled={disabled}
        className={cn(
          'h-9 rounded-l-md rounded-r-none border border-r-0 bg-muted px-2 text-sm text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive',
        )}
      >
        {COUNTRY_CODES.map(c => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.code}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        value={number}
        onChange={handleNumber}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full min-w-0 rounded-r-md rounded-l-none border border-input bg-background px-3 py-1 text-sm shadow-sm',
          'transition-colors placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive focus-visible:ring-destructive/30',
        )}
      />
    </div>
  )
}
