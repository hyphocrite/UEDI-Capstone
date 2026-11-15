import type { ReactNode } from 'react'
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

/** /dashboard: the office dashboard (`staff`) for Loan Officers and up; members go to their own home page. */
export function HomeRedirect({ staff }: { staff: ReactNode }) {
  const { session } = useAuth()
  return atLeast(session?.role, 'loan_officer') ? <>{staff}</> : <Navigate to={homePath(session?.role)} replace />
}
