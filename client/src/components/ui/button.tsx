import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base — shared across all variants
  [
    "group/button inline-flex shrink-0 items-center justify-center",
    "rounded-md border border-transparent bg-clip-padding",
    "text-sm font-medium whitespace-nowrap",
    "outline-none select-none",
    // Transitions — clean 150ms ease without bouncy scaling
    "transition-[background-color,border-color,opacity] duration-150 ease-out",
    // Focus ring — WCAG AA visible outline
    "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
    // Disabled
    "disabled:pointer-events-none disabled:opacity-50",
    // Validation
    "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30",
    // Icon sizing
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        // Primary — solid primary background with contrast text
        default: [
          "bg-primary text-primary-foreground font-semibold border border-primary",
          "hover:bg-primary-hover hover:border-primary-hover",
          "active:bg-primary-active",
        ],
        // Outline — clean border with card surface
        outline: [
          "border border-border bg-card text-foreground",
          "hover:bg-surface-elevated hover:border-border-strong hover:text-foreground",
          "aria-expanded:bg-surface-elevated aria-expanded:text-foreground",
        ],
        // Secondary — solid secondary surface with contrast text and border
        secondary: [
          "bg-secondary text-secondary-foreground border border-border",
          "hover:bg-surface-muted hover:border-border-strong",
          "aria-expanded:bg-surface-muted aria-expanded:text-secondary-foreground",
        ],
        // Tertiary / Ghost — transparent background with neutral text and subtle hover
        ghost: [
          "bg-transparent text-muted-foreground",
          "hover:bg-surface-elevated hover:text-foreground",
          "aria-expanded:bg-surface-elevated aria-expanded:text-foreground",
        ],
        // Destructive — solid accessible error treatment without gradients
        destructive: [
          "bg-destructive text-destructive-foreground font-semibold border border-destructive",
          "hover:bg-destructive/90 hover:border-destructive/90",
          "active:bg-destructive/80",
        ],
        // Link — inline text action
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
