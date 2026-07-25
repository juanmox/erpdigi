import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { Shell } from '@/app/shell'
import { AuthProvider, useAuth } from '@/features/auth/auth-context'
import { LoginPage } from '@/features/auth/login-page'
import { SeleccionarEmpresa } from '@/features/auth/seleccionar-empresa'
import { CatalogoPage } from '@/features/catalogo/catalogo-page'
import { CotizacionPage } from '@/features/recetas/cotizacion-page'

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
            <Route index element={<CotizacionPage />} />
            <Route path="catalogo" element={<CatalogoPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
