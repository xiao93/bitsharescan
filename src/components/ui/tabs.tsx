import * as TabsPrimitive from "@radix-ui/react-tabs"
import type { ComponentProps } from "react"
import { cn } from "../../lib/utils.ts"

export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root {...props} />
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-1 overflow-x-auto border-b border-line", className)} {...props} />
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted hover:text-ink data-[state=active]:border-link data-[state=active]:text-link",
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-4 outline-none", className)} {...props} />
}
