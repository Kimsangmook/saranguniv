"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

export interface DialogProps {
  open: boolean
  onClose: () => void
  /** 접근성용 제목 (내부에서 h2로 렌더링) */
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/**
 * 자체 구현 다이얼로그 (radix 미사용).
 * - ESC / 배경 클릭으로 닫힘
 * - 열린 동안 body 스크롤 잠금
 * - role="dialog" aria-modal
 * - document.body로 포털 렌더링: 부모의 space-y-*(자식에 margin-top 부여)나
 *   transform/filter가 fixed 오버레이의 위치·크기를 흔들지 않도록 한다.
 */
function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 m-0 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-background p-6 shadow-lg",
          className
        )}
      >
        {(title || description) && (
          <div className="mb-4 flex flex-col space-y-1.5">
            {title && (
              <h2 className="text-lg font-semibold leading-none tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  )
}

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

export { Dialog, DialogFooter }
