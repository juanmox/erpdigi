import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMarcaEmpresa } from '@/app/marca-empresa'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { costeoReposicionesApi } from '../api'
import { ModalAnular } from '../components/modal-anular'
import { ConfigurarCortes } from '../components/configurar-cortes'
import { AvisoModoSinValidacion, InterruptorModoSinValidacion } from '../components/modo-sin-validacion'
import { PERMISO_PASO } from '../flujo'
import { imprimirReposicion, imprimirRequisiciones } from '../imprimir'
import type { FilaSeguimiento, Reposicion } from '../types'
import { ModalDetalleReposicion } from './modal-detalle'
import { TabPorValidar } from './tab-por-validar'
import { TabReposiciones } from './tab-reposiciones'
import { TabTiempos } from './tab-tiempos'

/**
 * Seguimiento de reposiciones: lo cargado (con filtros), la cola de lo que cada
 * validador tiene que mover y las métricas de tiempo del flujo. Independiente del
 * reporte de costeo, que solo ven roles con `costeo.dashboard.ver`.
 */
export function SeguimientoReposicionesPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const marca = useMarcaEmpresa()
  const { tienePermiso, usuario } = useAuth()
  const [params, setParams] = useSearchParams()
  const [detalle, setDetalle] = useState<FilaSeguimiento | null>(null)
  const [anular, setAnular] = useState<FilaSeguimiento | null>(null)

  const validaAlgo =
    Object.values(PERMISO_PASO).some(tienePermiso) ||
    tienePermiso('costeo.reposicion.imprimir_requisicion') ||
    tienePermiso('costeo.reposicion.despachar')
  const veMetricas = tienePermiso('costeo.reposicion.metricas')
  const tabs = ['reposiciones', ...(validaAlgo ? ['por-validar'] : []), ...(veMetricas ? ['tiempos'] : [])]
  const pedida = params.get('tab') ?? (validaAlgo && !tienePermiso('costeo.reposicion.crear') ? 'por-validar' : 'reposiciones')
  const tab = tabs.includes(pedida) ? pedida : 'reposiciones'

  async function reimprimir(f: FilaSeguimiento) {
    try {
      if (f.estado === 'HISTORICA') {
        // Las anteriores al flujo salen como siempre, sin número RQ.
        const r = await costeoReposicionesApi.obtener(f.idReposicion)
        imprimirReposicion(r, usuario?.nombreCompleto ?? '', marca)
        return
      }
      const res = await costeoReposicionesApi.imprimirRequisiciones([f.idReposicion])
      if (res.fallidas.length > 0) avisarError(res.fallidas[0].motivo)
      else imprimirRequisiciones(res.reposiciones, usuario?.nombreCompleto ?? '', marca)
      qc.invalidateQueries({ queryKey: ['costeo-reposiciones'] })
    } catch (e) {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo imprimir')
    }
  }

  async function autorizarSinValidacion(f: FilaSeguimiento) {
    try {
      const r = await costeoReposicionesApi.autorizarDirecto([f.idReposicion])
      if (r.fallidas.length > 0) avisarError(r.fallidas[0].motivo)
      else avisarExito(`Reposición ${f.codigo} autorizada sin validaciones: ya se puede imprimir.`)
      qc.invalidateQueries({ queryKey: ['costeo-reposiciones'] })
      qc.invalidateQueries({ queryKey: ['costeo-rollos'] })
    } catch (e) {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo autorizar')
    }
  }

  const acciones = (f: FilaSeguimiento) => (
    <>
      {f.acciones.autorizarDirecto && (
        <Button size="sm" variant="outline" onClick={() => autorizarSinValidacion(f)}>
          Autorizar sin validación
        </Button>
      )}
      {f.acciones.corregir && (
        <Button size="sm" variant="outline" onClick={() => navigate(`/costeo/reposiciones?corregir=${f.idReposicion}`)}>
          Corregir
        </Button>
      )}
      {(f.acciones.imprimir && f.estado !== 'POR_IMPRIMIR') || (f.estado === 'HISTORICA' && !f.anuladoEn) ? (
        <Button size="sm" variant="ghost" onClick={() => reimprimir(f)}>
          {f.estado === 'HISTORICA' ? 'Imprimir' : 'Reimprimir'}
        </Button>
      ) : null}
      {f.acciones.anular && (
        <Button size="sm" variant="ghost" onClick={() => setAnular(f)}>
          Anular
        </Button>
      )}
    </>
  )

  return (
    <div className="mx-auto max-w-7xl p-4">
      <h1 className="mb-1 text-xl font-semibold text-ink">Seguimiento de reposiciones</h1>
      <p className="mb-4 text-sm text-ink-faint">
        Lo registrado y dónde está en el flujo: responsable del área → calidad → auditoría → administración → autorización →
        requisición → bodega la deja lista → el solicitante la recoge.
      </p>

      <AvisoModoSinValidacion className="mb-3" />
      <InterruptorModoSinValidacion />
      <ConfigurarCortes />

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="reposiciones">Reposiciones</TabsTrigger>
          {validaAlgo && <TabsTrigger value="por-validar">Por validar</TabsTrigger>}
          {veMetricas && <TabsTrigger value="tiempos">Tiempos</TabsTrigger>}
        </TabsList>
        <TabsContent value="reposiciones" className="mt-3">
          <TabReposiciones onVer={setDetalle} acciones={acciones} estadoInicial={params.get('estado') ?? undefined} />
        </TabsContent>
        {validaAlgo && (
          <TabsContent value="por-validar" className="mt-3">
            <TabPorValidar onVer={setDetalle} />
          </TabsContent>
        )}
        {veMetricas && (
          <TabsContent value="tiempos" className="mt-3">
            <TabTiempos />
          </TabsContent>
        )}
      </Tabs>

      <ModalDetalleReposicion fila={detalle} onCerrar={() => setDetalle(null)} />
      <ModalAnular
        // El modal solo usa el id y el código.
        reposicion={anular ? ({ idReposicion: anular.idReposicion, codigoRepo: anular.codigo } as Reposicion) : null}
        open={!!anular}
        onOpenChange={(v) => !v && setAnular(null)}
        onAnulada={() => {
          qc.invalidateQueries({ queryKey: ['costeo-reposiciones'] })
          qc.invalidateQueries({ queryKey: ['costeo-rollos'] })
        }}
      />
    </div>
  )
}
