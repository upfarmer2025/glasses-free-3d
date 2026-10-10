import * as TabsPrimitive from '@radix-ui/react-tabs'
import { type ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-4', className)} {...props} />
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex rounded-full border border-white/10 bg-black/30 p-1', className)}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-full px-4 py-1.5 text-sm text-mist transition-colors outline-none focus-visible:ring-2 focus-visible:ring-copper/70 data-[state=active]:bg-copper data-[state=active]:text-ink',
        className,
      )}
      {...props}
    />
  )
}
