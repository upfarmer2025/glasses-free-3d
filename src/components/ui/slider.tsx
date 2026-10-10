import * as SliderPrimitive from '@radix-ui/react-slider'
import { type ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex h-5 w-full touch-none items-center select-none', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-white/15">
        <SliderPrimitive.Range className="absolute h-full bg-copper" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-4 rounded-full border border-black/30 bg-paper shadow outline-none focus-visible:ring-2 focus-visible:ring-copper/70" />
    </SliderPrimitive.Root>
  )
}
