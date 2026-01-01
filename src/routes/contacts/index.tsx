import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Search, Plus, User } from 'lucide-react'
import { getContacts, getTags, initDB, type ContactWithTag, type Tag } from '@/lib/db'
import { formatDaysSince } from '@/lib/nudge'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contacts',
  component: ContactsList,
})

function ContactsList() {
  const [search, setSearch] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const navigate = useNavigate()

  const { data: contacts, isLoading: contactsLoading } = useQuery({
    queryKey: ['contacts', selectedTagId],
    queryFn: async () => {
      await initDB()
      return getContacts(selectedTagId || undefined)
    },
  })

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      await initDB()
      return getTags()
    },
  })

  const filteredContacts = contacts?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-4">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <Link to="/sync">
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Import
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tag Filters */}
      {tags && tags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
          <Badge
            variant={selectedTagId === null ? 'default' : 'outline'}
            className="cursor-pointer shrink-0"
            onClick={() => setSelectedTagId(null)}
          >
            All
          </Badge>
          {tags.map((tag) => (
            <TagFilterBadge
              key={tag.id}
              tag={tag}
              isSelected={selectedTagId === tag.id}
              onClick={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)}
            />
          ))}
        </div>
      )}

      {/* Contact List */}
      {contactsLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : filteredContacts && filteredContacts.length > 0 ? (
        <div className="space-y-2">
          {filteredContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onClick={() => navigate({ to: '/contacts/$id', params: { id: contact.id } })}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {contacts?.length === 0 ? 'No contacts yet' : 'No matching contacts'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TagFilterBadge({
  tag,
  isSelected,
  onClick,
}: {
  tag: Tag
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <Badge
      variant={isSelected ? 'default' : 'outline'}
      className="cursor-pointer shrink-0"
      style={isSelected ? { backgroundColor: tag.color || undefined } : undefined}
      onClick={onClick}
    >
      {tag.name}
    </Badge>
  )
}

function ContactCard({ contact, onClick }: { contact: ContactWithTag; onClick: () => void }) {
  return (
    <Card className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-10 w-10">
            <AvatarImage src={contact.photo_url || undefined} />
            <AvatarFallback>
              {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{contact.name}</p>
            <p className="text-sm text-muted-foreground">
              {contact.days_since_checkin !== null
                ? formatDaysSince(contact.days_since_checkin)
                : 'Never contacted'}
            </p>
          </div>

          {contact.tag_name && (
            <Badge
              variant="secondary"
              style={{ backgroundColor: contact.tag_color || undefined }}
              className="text-white text-xs shrink-0"
            >
              {contact.tag_name}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
