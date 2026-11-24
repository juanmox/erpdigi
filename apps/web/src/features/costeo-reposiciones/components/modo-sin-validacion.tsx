import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { costeoReposicionesApi } from '../api'
import { useModoSinValidacion } from '../use-modo-sin-validacion'

/** Aviso visible mientras el modo está prendido. */
export function AvisoModoSinValidacion({ className }: { className?: string }) {
  const activo = useModoSinValidacion()
  if (!activo) return null
  return (
    <Alert className={`border-amber-500/50 bg-amber-500/10 ${className ?? ''}`}>
      <AlertDescription className="text-amber-800 dark:text-amber-300">
        <strong>Modo sin validaciones activo.</strong> Cada reposición que se registra se autoriza de inmediato: descuenta el
        papel del rollo y se imprime como antes, sin pasar por las validaciones.
      </AlertDescription>
    </Alert>
  )
}

/** El interruptor. Solo lo ve quien tiene `costeo.reposicion.configurar`. */
export function InterruptorModoSinValidacion() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const activo = useModoSinValidacion()
  const [pendiente, setPendiente] = useState<boolean | null>(null)

  const cambiar = useMutation({
    mutationFn: (sinValidacion: boolean) => costeoReposicionesApi.configurar(sinValidacion),
    onSuccess: (r) => {
      avisarExito(
        r.sinValidacion
          ? 'Modo sin validaciones ACTIVADO: las reposiciones nuevas se autorizan al registrarse.'
          : 'Modo sin validaciones APAGADO: las reposiciones nuevas vuelven al flujo de validaciones.',
      )
      qc.invalidateQueries({ queryKey: ['costeo-reposiciones'] })
      setPendiente(null)
    },
    onError: (e) => {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo cambiar el modo')
      setPendiente(null)
    },
  })

  if (!tienePermiso('costeo.reposicion.configurar')) return null

  return (
    <>
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-card p-3">
        <Checkbox
          id="modo-sin-validacion"
          className="mt-0.5"
          checked={activo}
          onCheckedChange={(v) => setPendiente(v === true)}
        />
        <div>
          <Label htmlFor="modo-sin-validacion" className="text-sm font-medium">
            Registrar reposiciones sin validaciones (modo transitorio)
          </Label>
          <p className="text-xs text-ink-faint">
            Para la capacitación: mientras esté marcado, las reposiciones se autorizan al registrarse, como antes. El flujo de
            validaciones no se pierde: al desmarcar vuelve a regir para lo nuevo.
          </p>
        </div>
      </div>

      <Dialog open={pendiente !== null} onOpenChange={(o) => !o && setPendiente(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pendiente ? 'Activar el modo sin validaciones' : 'Volver al flujo de validaciones'}</DialogTitle>
            <DialogDescription>
              {pendiente
                ? 'Desde ahora, cada reposición que se registre se autoriza de inmediato: descuenta el papel del rollo, se envía a los Google Sheets y se imprime como siempre, sin pasar por las validaciones. Lo que ya esté esperando validación se puede autorizar con el botón "Autorizar sin validación" del seguimiento. Afecta a todos los usuarios de la empresa.'
                : 'Desde ahora, las reposiciones nuevas vuelven a pasar por las validaciones. Lo que se registró en el modo sin validaciones queda como está.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendiente(null)}>
              Cancelar
            </Button>
            <Button disabled={cambiar.isPending} onClick={() => pendiente !== null && cambiar.mutate(pendiente)}>
              {cambiar.isPending ? 'Guardando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
