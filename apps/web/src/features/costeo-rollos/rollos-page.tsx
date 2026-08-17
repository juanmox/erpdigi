import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-context'
import { TabCorregirIngreso } from './components/tab-corregir-ingreso'
import { TabIngreso } from './components/tab-ingreso'
import { TabMontaje } from './components/tab-montaje'
import { TabPanel } from './components/tab-panel'

export function RollosPage() {
  const { tienePermiso } = useAuth()
  const puedeIngresar = tienePermiso('costeo.rollo.ingresar')
  const puedeMontar = tienePermiso('costeo.rollo.montar') || tienePermiso('costeo.rollo.desmontar')

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <h1 className="text-xl font-semibold text-ink">Gestión de Rollos</h1>

      <Tabs defaultValue="panel">
        <TabsList>
          <TabsTrigger value="panel">Panel de estado</TabsTrigger>
          {puedeMontar && <TabsTrigger value="montaje">Montaje</TabsTrigger>}
          {puedeIngresar && <TabsTrigger value="ingreso">Ingreso a bodega</TabsTrigger>}
          {puedeIngresar && <TabsTrigger value="corregir">Corregir ingreso</TabsTrigger>}
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
      </Tabs>
    </div>
  )
}
