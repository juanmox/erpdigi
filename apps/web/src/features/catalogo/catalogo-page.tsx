import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TabInsumos } from './components/tab-insumos'
import { TabPrecios } from './components/tab-precios'
import { TabProductos } from './components/tab-productos'

export function CatalogoPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Gestión de datos</h1>

      <Tabs defaultValue="precios">
        <TabsList>
          <TabsTrigger value="precios">Precios de insumos</TabsTrigger>
          <TabsTrigger value="insumos">Insumos</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
        </TabsList>
        <TabsContent value="precios">
          <TabPrecios />
        </TabsContent>
        <TabsContent value="insumos">
          <TabInsumos />
        </TabsContent>
        <TabsContent value="productos">
          <TabProductos />
        </TabsContent>
      </Tabs>
    </div>
  )
}
