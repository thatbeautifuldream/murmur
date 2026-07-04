import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

type SpinnerProps = Omit<React.ComponentProps<typeof Loader2Icon>, "children">

function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <Loader2Icon role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
