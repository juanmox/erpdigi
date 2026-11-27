import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

/**
 * `seccion`: el encabezado pasa a una banda con el tinte y el filo del azul de marca,
 * pegada al borde de la tarjeta (el margen negativo cancela el padding superior de
 * `Card`). Es la misma señal de `FilaCategoria` y `TituloSeccion`: en pantallas con
 * muchas tarjetas apiladas, el título gris sobre blanco no separaba una de otra.
 * ⚠️ El `[.border-b]:pb-1.5` es necesario: `border-b` activa la regla base `[.border-b]:pb-(--card-spacing)`
 * (16 px abajo) y pisaba el relleno de la banda, que quedaba descentrada (más aire abajo que arriba).
 * Opt-in a propósito: el login y otras tarjetas sueltas siguen con el encabezado liso.
 */
function CardHeader({
  className,
  seccion,
  ...props
}: React.ComponentProps<"div"> & { seccion?: boolean }) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        seccion &&
          "-mt-(--card-spacing) border-b border-l-4 border-b-accent-brand/20 border-l-accent-brand bg-accent-brand-soft pt-1.5 pb-1.5 [.border-b]:pb-1.5 [&_[data-slot=card-title]]:text-[15px] [&_[data-slot=card-title]]:font-bold [&_[data-slot=card-title]]:text-accent-brand-strong",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
