import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-bold text-brand-800">404</p>
      <p className="text-brand-600">This page does not exist.</p>
      <Link to="/" className="btn-primary">Back to home</Link>
    </div>
  )
}
