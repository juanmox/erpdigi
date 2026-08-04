import { useState } from 'react'
import type { FormEvent } from 'react'
import fotoUniformes from '@/assets/Football.png'
import logoDigitexsa from '@/assets/logo-digitexsa.png'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ApiError, useAuth } from './auth-context'

function MarcaDigitexsa({ variant }: { variant: 'clara' | 'dorada' }) {
  return (
    <span className={cn('relative inline-flex size-7 shrink-0 rounded-lg', variant === 'clara' ? 'bg-white' : 'bg-accent-warm')}>
      <span
        className={cn('absolute inset-x-[7px] top-[13px] h-[2px]', variant === 'clara' ? 'bg-accent-brand-strong' : 'bg-white')}
      />
      <span
        className={cn('absolute inset-y-[7px] left-[13px] w-[2px]', variant === 'clara' ? 'bg-accent-brand-strong' : 'bg-white')}
      />
    </span>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-svh bg-surface-paper lg:grid-cols-[42%_58%]">
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-end lg:p-9">
        <img src={fotoUniformes} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0e22]/92 via-[#0a0e22]/5 to-[#0a0e22]/35" />
        <div aria-hidden className="pointer-events-none absolute -top-[8%] -right-[5%] h-[120%] w-[9%] rotate-[10deg] bg-accent-warm shadow-[0_0_50px_rgba(192,138,37,0.55)]" />

        <div className="relative z-10 inline-flex w-fit items-center rounded-xl bg-white px-4 py-2.5 shadow-lg">
          <img src={logoDigitexsa} alt="digiTEXSA" className="h-6 w-auto" />
        </div>
        <div className="relative z-10 mt-2.5 text-xs text-white/75">Digital Textil, S.A. — Guatemala</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex items-center gap-2.5">
            <MarcaDigitexsa variant="dorada" />
            <strong className="text-[13.5px] font-extrabold tracking-tight text-ink">Digitexsa ERP</strong>
          </div>

          <h1 className="text-[22px] font-extrabold tracking-tight text-ink">Bienvenido de nuevo</h1>

          <form className="mt-7 flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="nombre@digitexsa.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 rounded-[9px] focus-visible:border-accent-warm focus-visible:ring-accent-warm/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-[9px] focus-visible:border-accent-warm focus-visible:ring-accent-warm/40"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={enviando} className="h-[42px] rounded-[9px] bg-accent-brand text-white hover:bg-accent-brand-strong">
              {enviando ? 'Ingresando…' : 'Iniciar sesión'}
            </Button>
          </form>

          <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs text-ink-muted">
            <span className="size-1.5 shrink-0 rounded-full bg-accent-warm" />
            Empresa: Digital Textil, S.A.
          </div>
        </div>
      </div>
    </div>
  )
}
