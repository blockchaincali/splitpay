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

export default function App() {
  const { path } = useLocation()
  const group = matchPath('/g/:id', path)
  const manage = matchPath('/g/:id/manage', path)
  const join = matchPath('/join/:token', path)

  return (
    <Layout>
      {manage ? (
        <Manage key={manage.id} id={manage.id} />
      ) : join ? (
        <Join key={join.token} token={join.token} />
      ) : path === '/signin' ? (
        <SignIn />
      ) : path === '/account' ? (
        <Account />
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
