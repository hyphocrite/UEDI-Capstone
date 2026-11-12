import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { atLeast, homePath } from '../lib/roles'
import type { Role } from '../lib/roles'

type Props = { min?: Role; roles?: Role[] }

/**
 * Pages for `min` and above on the role ladder, or only for `roles`. Anyone else goes to their own
 * home page. The API enforces the same rules; this only keeps people off pages they can't use.
 */
export default function RequireLevel({ min, roles }: Props) {
  const { session } = useAuth()
  const role = session?.role
  const allowed = roles ? !!role && roles.includes(role) : atLeast(role, min ?? 'staff')
  return allowed ? <Outlet /> : <Navigate to={homePath(role)} replace />
}

/** /dashboard: sends each account to its own home page. */
export function HomeRedirect() {
  const { session } = useAuth()
  return <Navigate to={homePath(session?.role)} replace />
}
