import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { Shell } from '@/app/shell'
import { AuthProvider, useAuth } from '@/features/auth/auth-context'
import { LoginPage } from '@/features/auth/login-page'
import { SeleccionarEmpresa } from '@/features/auth/seleccionar-empresa'
import { CatalogoPage } from '@/features/catalogo/catalogo-page'
import { EstandarPage } from '@/features/costeo-estandar/estandar-page'
import { OrdenesPage } from '@/features/costeo-ordenes/ordenes-page'
import { ReposicionesPage } from '@/features/costeo-reposiciones/reposiciones-page'
import { RollosPage } from '@/features/costeo-rollos/rollos-page'
import { InicioPage } from '@/features/inicio/inicio-page'
import { CotizacionPage } from '@/features/recetas/cotizacion-page'
import { UsuariosPage } from '@/features/usuarios/usuarios-page'

function RutaProtegida({ children }: { children: React.ReactNode }) {
  const { autenticado, cargando, requiereSeleccionEmpresa } = useAuth()
  if (cargando) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }
  if (!autenticado) return <Navigate to="/login" replace />
  if (requiereSeleccionEmpresa) return <SeleccionarEmpresa />
  return <>{children}</>
}

// Antes solo el sidebar ocultaba los links sin permiso — la ruta en sí no
// tenía ningún guard, así que navegar directo a la URL (ej. /recetas)
// cargaba la página igual. El backend rechaza las acciones de escritura,
// pero la lectura/navegación quedaba abierta. Exige al menos uno de los
// permisos indicados (mismo criterio "OR" que ya usan sidebar.tsx/
// cotizacion-page.tsx para decidir qué mostrar) o redirige a Inicio.
function RutaConPermiso({ children, permisos }: { children: React.ReactNode; permisos: string[] }) {
  const { tienePermiso } = useAuth()
  if (!permisos.some((p) => tienePermiso(p))) return <Navigate to="/" replace />
  return <>{children}</>
}

function RutaPublica({ children }: { children: React.ReactNode }) {
  const { autenticado, cargando } = useAuth()
  if (cargando) return null
  if (autenticado) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/erp">
        <Routes>
          <Route
            path="/login"
            element={
              <RutaPublica>
                <LoginPage />
              </RutaPublica>
            }
          />
          <Route
            path="/"
            element={
              <RutaProtegida>
                <Shell />
              </RutaProtegida>
            }
          >
            <Route index element={<InicioPage />} />
            <Route
              path="recetas"
              element={
                <RutaConPermiso permisos={['recetas.cotizaciones.ver']}>
                  <CotizacionPage />
                </RutaConPermiso>
              }
            />
            <Route
              path="catalogo"
              element={
                <RutaConPermiso
                  permisos={['recetas.insumos.editar', 'recetas.productos.editar', 'recetas.importar']}
                >
                  <CatalogoPage />
                </RutaConPermiso>
              }
            />
            <Route
              path="costeo/rollos"
              element={
                <RutaConPermiso permisos={['costeo.rollo.ver']}>
                  <RollosPage />
                </RutaConPermiso>
              }
            />
            <Route
              path="costeo/ordenes"
              element={
                <RutaConPermiso permisos={['costeo.orden.ver']}>
                  <OrdenesPage />
                </RutaConPermiso>
              }
            />
            <Route
              path="costeo/reposiciones"
              element={
                <RutaConPermiso permisos={['costeo.reposicion.ver']}>
                  <ReposicionesPage />
                </RutaConPermiso>
              }
            />
            <Route
              path="costeo/estandar"
              element={
                <RutaConPermiso permisos={['costeo.estandar.ver']}>
                  <EstandarPage />
                </RutaConPermiso>
              }
            />
            <Route
              path="usuarios"
              element={
                <RutaConPermiso permisos={['plataforma.usuarios.administrar']}>
                  <UsuariosPage />
                </RutaConPermiso>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
