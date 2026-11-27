import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-context'
import { TabCostos } from './components/tab-costos'
import { TabInsumos } from './components/tab-insumos'

/**
 * Inventario — por ahora solo el catálogo de insumos (lo que entra y sale de
 * bodega). Antes vivía en "Gestión de datos" de Recetas, donde el bodeguero
 * quedaba a un clic de costos y recetas confidenciales.
 *
 * El COSTO es una pestaña aparte, con su propio permiso: la ve quien lleva los
 * costos, no quien da de alta lo que llega a bodega.
 */
export function InventarioPage() {
  const { tienePermiso } = useAuth()
  const verCostos = tienePermiso('inventario.costo.ver')

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Inventario · Insumos</h1>

      <Tabs defaultValue="insumos">
        <TabsList>
          <TabsTrigger value="insumos">Insumos</TabsTrigger>
          {verCostos && <TabsTrigger value="costos">Costos</TabsTrigger>}
        </TabsList>
        <TabsContent value="insumos">
          <TabInsumos />
        </TabsContent>
        {verCostos && (
          <TabsContent value="costos">
            <TabCostos />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
