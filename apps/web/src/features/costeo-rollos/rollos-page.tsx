import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TabIngreso } from './components/tab-ingreso'
import { TabMontaje } from './components/tab-montaje'
import { TabPanel } from './components/tab-panel'

export function RollosPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <h1 className="text-xl font-semibold text-ink">Gestión de Rollos</h1>

      <Tabs defaultValue="panel">
        <TabsList>
          <TabsTrigger value="panel">Panel de estado</TabsTrigger>
          <TabsTrigger value="montaje">Montaje</TabsTrigger>
          <TabsTrigger value="ingreso">Ingreso a bodega</TabsTrigger>
        </TabsList>
        <TabsContent value="panel">
          <TabPanel />
        </TabsContent>
        <TabsContent value="montaje">
          <TabMontaje />
        </TabsContent>
        <TabsContent value="ingreso">
          <TabIngreso />
        </TabsContent>
      </Tabs>
    </div>
  )
}
