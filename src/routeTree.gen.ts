import { Route as rootRoute } from './routes/__root'
import { Route as IndexRoute } from './routes/index'
import { Route as ContactsIndexRoute } from './routes/contacts/index'
import { Route as ContactIdRoute } from './routes/contacts/$id'
import { Route as SettingsRoute } from './routes/settings'
import { Route as SyncRoute } from './routes/sync'

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  ContactsIndexRoute,
  ContactIdRoute,
  SettingsRoute,
  SyncRoute,
])
