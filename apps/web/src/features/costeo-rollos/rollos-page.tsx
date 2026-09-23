import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-context'
import { TabCorregirIngreso } from './components/tab-corregir-ingreso'
import { TabHistorial } from './components/tab-historial'
import { TabIngreso } from './components/tab-ingreso'
import { TabMontaje } from './components/tab-montaje'
import { TabPanel } from './components/tab-panel'

export function RollosPage() {
  const { tienePermiso } = useAuth()
  const puedeIngresar = tienePermiso('costeo.rollo.ingresar')
  const puedeMontar = tienePermiso('costeo.rollo.montar') || tienePermiso('costeo.rollo.desmontar')

  // La pestaña viaja en la URL para poder enlazar directo a Montaje desde el
  // error de "sin rollo montado" de Envío de impresas. Se valida contra los
  // permisos: un ?tab= a una pestaña que el rol no ve dejaría la página vacía.
  const [params, setParams] = useSearchParams()
  const pedida = params.get('tab')
  // 'historial' solo pide costeo.rollo.ver, que es lo mismo que el panel.
  const disponibles = ['panel', ...(puedeMontar ? ['montaje'] : []), ...(puedeIngresar ? ['ingreso', 'corregir'] : []), 'historial']
  const tab = pedida && disponibles.includes(pedida) ? pedida : 'panel'

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <h1 className="text-xl font-semibold text-ink">Gestión de Rollos</h1>

      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'panel' ? {} : { tab: v }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="panel">Panel de estado</TabsTrigger>
          {puedeMontar && <TabsTrigger value="montaje">Montaje</TabsTrigger>}
          {puedeIngresar && <TabsTrigger value="ingreso">Ingreso a bodega</TabsTrigger>}
          {puedeIngresar && <TabsTrigger value="corregir">Corregir ingreso</TabsTrigger>}
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="panel">
          <TabPanel />
        </TabsContent>
        {puedeMontar && (
          <TabsContent value="montaje">
            <TabMontaje />
          </TabsContent>
        )}
        {puedeIngresar && (
          <TabsContent value="ingreso">
            <TabIngreso />
          </TabsContent>
        )}
        {puedeIngresar && (
          <TabsContent value="corregir">
            <TabCorregirIngreso />
          </TabsContent>
        )}
        <TabsContent value="historial">
          <TabHistorial />
        </TabsContent>
      </Tabs>
    </div>
  )
}
