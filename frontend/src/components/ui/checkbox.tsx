'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <input
            type="checkbox"
            ref={ref}
            id={id}
            className="peer sr-only"
            {...props}
          />
          <div
            className={cn(
              'h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background',
              'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
              'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
              'peer-checked:bg-primary peer-checked:text-primary-foreground',
              className
            )}
          >
            <Check className="hidden peer-checked:block h-3 w-3 text-white absolute top-0.5 left-0.5" />
          </div>
        </div>
        {label && (
          <label htmlFor={id} className="text-sm font-medium leading-none cursor-pointer">
            {label}
          </label>
        )}
      </div>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
