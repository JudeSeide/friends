import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Check, Clock, User, Plus } from 'lucide-react'
import { getAllDueContacts, formatDaysSince, type DueContact } from '@/lib/nudge'
import { createCheckin, initDB } from '@/lib/db'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
})

function Dashboard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: dueData, isLoading } = useQuery({
    queryKey: ['dueContacts'],
    queryFn: async () => {
      await initDB()
      return getAllDueContacts()
    },
  })

  const checkinMutation = useMutation({
    mutationFn: async (contactId: string) => {
      await initDB()
      return createCheckin(contactId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dueContacts'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })

  const totalDue = dueData?.reduce((sum, item) => sum + item.contacts.length, 0) || 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-2xl font-bold">Friends</h1>
        <p className="text-muted-foreground">Stay connected with people who matter</p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Due Check-ins
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalDue === 0 ? (
            <p className="text-muted-foreground">You're all caught up!</p>
          ) : (
            <p className="text-3xl font-bold">{totalDue} <span className="text-lg font-normal text-muted-foreground">contacts</span></p>
          )}
        </CardContent>
      </Card>

      {/* Due Contacts by Tag */}
      {dueData && dueData.length > 0 ? (
        dueData.map(({ tagInfo, contacts }) => (
          <div key={tagInfo.tag.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge
                style={{ backgroundColor: tagInfo.tag.color || undefined }}
                className="text-white"
              >
                {tagInfo.tag.name}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {tagInfo.remaining} of {tagInfo.tag.count_per_period} due
              </span>
            </div>

            {contacts.map((contact) => (
              <DueContactCard
                key={contact.id}
                contact={contact}
                onCheckin={() => checkinMutation.mutate(contact.id)}
                onNavigate={() => navigate({ to: '/contacts/$id', params: { id: contact.id } })}
                isLoading={checkinMutation.isPending}
              />
            ))}
          </div>
        ))
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No contacts yet</p>
            <Link to="/sync">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Import Contacts
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function DueContactCard({
  contact,
  onCheckin,
  onNavigate,
  isLoading,
}: {
  contact: DueContact
  onCheckin: () => void
  onNavigate: () => void
  isLoading: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div onClick={onNavigate} className="cursor-pointer">
            <Avatar className="h-12 w-12">
              <AvatarImage src={contact.photo_url || undefined} />
              <AvatarFallback>
                {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex-1 min-w-0" onClick={onNavigate}>
            <p className="font-medium truncate cursor-pointer">{contact.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatDaysSince(contact.days_since_checkin)}
            </p>
          </div>

          <Button
            size="sm"
            onClick={onCheckin}
            disabled={isLoading}
          >
            <Check className="h-4 w-4 mr-1" />
            Done
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
