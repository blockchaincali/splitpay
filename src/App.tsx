import { Layout } from '@/components/Layout'
import { matchPath, useLocation } from '@/lib/router'
import { Home } from '@/pages/Home'
import { CreateGroup } from '@/pages/CreateGroup'
import { GroupPage } from '@/pages/GroupPage'
import { Dashboard } from '@/pages/Dashboard'
import { SignIn } from '@/pages/SignIn'
import { Account } from '@/pages/Account'
import { Manage } from '@/pages/Manage'
import { Join } from '@/pages/Join'
import { AccountsGate } from '@/components/AccountsGate'

export default function App() {
  const { path } = useLocation()
  const group = matchPath('/g/:id', path)
  const manage = matchPath('/g/:id/manage', path)
  const join = matchPath('/join/:token', path)

  return (
    <Layout>
      {manage ? (
        <AccountsGate><Manage key={manage.id} id={manage.id} /></AccountsGate>
      ) : join ? (
        <AccountsGate><Join key={join.token} token={join.token} /></AccountsGate>
      ) : path === '/signin' ? (
        <AccountsGate><SignIn /></AccountsGate>
      ) : path === '/account' ? (
        <AccountsGate><Account /></AccountsGate>
      ) : group ? (
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
