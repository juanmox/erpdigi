import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TabDesarrollos } from './components/tab-desarrollos'
import { TabProductos } from './components/tab-productos'

export function CatalogoPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Gestión de datos</h1>

      <Tabs defaultValue="desarrollos">
        {/* Orden = flujo real: desarrollo (prototipo) -> producto. Los insumos y
            sus costos ya no están acá: son de Inventario. */}
        <TabsList>
          <TabsTrigger value="desarrollos">Desarrollos</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
        </TabsList>
        <TabsContent value="desarrollos">
          <TabDesarrollos />
        </TabsContent>
        <TabsContent value="productos">
          <TabProductos />
        </TabsContent>
      </Tabs>
    </div>
  )
}
