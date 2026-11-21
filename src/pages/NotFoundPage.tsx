import { Link } from 'react-router'
import { PageHeader } from '../components/ui/PageHeader'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="That page doesn't exist." />
      <Link to="/" className="text-sm font-medium text-positive hover:underline">
        Back to dashboard
      </Link>
    </>
  )
}
