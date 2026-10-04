import { MoonIcon, SignOutIcon, SunIcon } from '@phosphor-icons/react'
import { useSession } from '@/state'
import { useTheme } from '@/theme'
import { IconButton } from '@/ui/IconButton'

export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  return (
    <IconButton label="Сменить тему" onClick={toggleTheme} className={className}>
      {theme === 'dark' ? <SunIcon size={24} /> : <MoonIcon size={24} />}
    </IconButton>
  )
}

export function LogoutButton({ className }: { className?: string }) {
  const { logout } = useSession()
  return (
    <IconButton label="Выйти" onClick={() => logout()} className={className}>
      <SignOutIcon size={24} />
    </IconButton>
  )
}
