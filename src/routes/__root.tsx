import { createRootRoute, Outlet, Link, useRouterState } from '@tanstack/react-router'
import { Home, Users, Settings } from 'lucide-react'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const navItems = [
    { to: '/' as const, icon: Home, label: 'Home' },
    { to: '/contacts' as const, icon: Users, label: 'Contacts' },
    { to: '/settings' as const, icon: Settings, label: 'Settings' },
  ]

  return (
    <div className="min-h-screen bg-background pb-16">
      <Outlet />

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-background">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto">
          {navItems.map((item) => {
            const isActive = item.to === '/'
              ? pathname === '/'
              : pathname.startsWith(item.to)
            const Icon = item.icon

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
