import { Layout } from '@/components/Layout'
import { matchPath, useLocation } from '@/lib/router'
import { Home } from '@/pages/Home'
import { CreateGroup } from '@/pages/CreateGroup'
import { GroupPage } from '@/pages/GroupPage'
import { Dashboard } from '@/pages/Dashboard'

export default function App() {
  const { path } = useLocation()
  const group = matchPath('/g/:id', path)

  return (
    <Layout>
      {group ? (
        <GroupPage key={group.id} id={group.id} />
      ) : path === '/new' ? (
        <CreateGroup />
      ) : path === '/dashboard' ? (
        <Dashboard />
      ) : (
        <Home />
      )}
    </Layout>
  )
}
