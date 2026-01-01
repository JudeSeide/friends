import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Check,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  Trash2,
} from 'lucide-react'
import {
  getContact,
  getCheckins,
  getTags,
  updateContact,
  createCheckin,
  deleteContact,
  initDB,
} from '@/lib/db'
import { formatDaysSince } from '@/lib/nudge'
import { format } from 'date-fns'
import { Route as rootRoute } from '../__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contacts/$id',
  component: ContactDetail,
})

function ContactDetail() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: async () => {
      await initDB()
      return getContact(id)
    },
  })

  const { data: checkins } = useQuery({
    queryKey: ['checkins', id],
    queryFn: async () => {
      await initDB()
      return getCheckins(id)
    },
  })

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      await initDB()
      return getTags()
    },
  })

  const updateTagMutation = useMutation({
    mutationFn: async (tagId: string | null) => {
      await initDB()
      updateContact(id, { tag_id: tagId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['dueContacts'] })
    },
  })

  const checkinMutation = useMutation({
    mutationFn: async (date?: Date) => {
      await initDB()
      return createCheckin(id, date?.getTime())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', id] })
      queryClient.invalidateQueries({ queryKey: ['checkins', id] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['dueContacts'] })
      setDatePickerOpen(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await initDB()
      deleteContact(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['dueContacts'] })
      navigate({ to: '/contacts' })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <p className="text-muted-foreground">Contact not found</p>
        <Link to="/contacts">
          <Button variant="link" className="p-0">Go back to contacts</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 pt-4">
        <Link to="/contacts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Contact</h1>
      </div>

      {/* Profile Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-20 w-20 mb-4">
              <AvatarImage src={contact.photo_url || undefined} />
              <AvatarFallback className="text-2xl">
                {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-bold">{contact.name}</h2>
            {contact.tag_name && (
              <Badge
                className="mt-2 text-white"
                style={{ backgroundColor: contact.tag_color || undefined }}
              >
                {contact.tag_name}
              </Badge>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              Last check-in: {formatDaysSince(contact.days_since_checkin)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-3 text-primary">
              <Phone className="h-5 w-5" />
              <span>{contact.phone}</span>
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-3 text-primary">
              <Mail className="h-5 w-5" />
              <span className="truncate">{contact.email}</span>
            </a>
          )}
          {!contact.phone && !contact.email && (
            <p className="text-muted-foreground text-sm">No contact info available</p>
          )}
        </CardContent>
      </Card>

      {/* Tag Selection */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Classification</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={contact.tag_id || 'none'}
            onValueChange={(value) => updateTagMutation.mutate(value === 'none' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tag</SelectItem>
              {tags?.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color || '#888' }}
                    />
                    {tag.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Check-in Actions */}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => checkinMutation.mutate(undefined)}
          disabled={checkinMutation.isPending}
        >
          <Check className="h-4 w-4 mr-2" />
          Check in Now
        </Button>

        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={undefined}
              onSelect={(date) => date && checkinMutation.mutate(date)}
              disabled={(date) => date > new Date()}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Check-in History */}
      {checkins && checkins.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Check-in History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checkins.slice(0, 10).map((checkin, i) => (
              <div key={checkin.id}>
                {i > 0 && <Separator className="my-2" />}
                <div className="flex justify-between items-center text-sm">
                  <span>{format(new Date(checkin.checked_in_at), 'PPP')}</span>
                  <span className="text-muted-foreground">
                    {format(new Date(checkin.checked_in_at), 'p')}
                  </span>
                </div>
                {checkin.note && (
                  <p className="text-sm text-muted-foreground mt-1">{checkin.note}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Delete Contact */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="w-full">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Contact
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {contact.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            This will permanently delete this contact and all check-in history.
          </p>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
