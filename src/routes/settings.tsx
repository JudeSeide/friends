import { createRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Route as rootRoute } from './__root'
import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Plus, Pencil, Trash2, Bell, Check, Download, Upload } from 'lucide-react'
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  getSetting,
  setSetting,
  initDB,
  exportDatabase,
  restoreDatabase,
  type Tag,
} from '@/lib/db'
import { formatPeriod } from '@/lib/nudge'
import { backupFilename } from '@/lib/backup-filename'
import { getTagDeleteInvalidationKeys } from '@/lib/query-keys'
import {
  requestNotificationPermission,
  isNotificationEnabled,
  scheduleNotification,
} from '@/lib/notifications'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings,
})

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
]

const PERIODS = [
  { value: 1, label: 'Daily' },
  { value: 7, label: 'Weekly' },
  { value: 14, label: 'Bi-weekly' },
  { value: 30, label: 'Monthly' },
]

function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/x-sqlite3' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function Settings() {
  const queryClient = useQueryClient()
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<File | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const restoreInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNotificationsEnabled(isNotificationEnabled())
  }, [])

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      await initDB()
      return getTags()
    },
  })

  const { data: notificationTime } = useQuery({
    queryKey: ['settings', 'notification_time'],
    queryFn: async () => {
      await initDB()
      return getSetting('notification_time') || '16:00'
    },
  })

  const updateNotificationMutation = useMutation({
    mutationFn: async (time: string) => {
      await initDB()
      setSetting('notification_time', time)
      // Reschedule notification with new time
      await scheduleNotification()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission()
    setNotificationsEnabled(granted)
    if (granted) {
      await scheduleNotification()
    }
  }

  const handleExport = async () => {
    setDataError(null)
    try {
      downloadBytes(await exportDatabase(), backupFilename(new Date()))
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Export failed')
    }
  }

  const handleRestoreFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    setDataError(null)
    setPendingRestore(file)
  }

  const handleRestoreConfirmed = async () => {
    if (!pendingRestore) return
    setIsRestoring(true)
    try {
      const bytes = new Uint8Array(await pendingRestore.arrayBuffer())
      await restoreDatabase(bytes, (currentBytes) =>
        downloadBytes(currentBytes, backupFilename(new Date()))
      )
      await queryClient.invalidateQueries()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Restore failed')
    }
    setIsRestoring(false)
    setPendingRestore(null)
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!notificationsEnabled ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Enable notifications to get daily reminders about contacts to reach out to.
              </p>
              <Button onClick={handleEnableNotifications} className="w-full">
                <Bell className="h-4 w-4 mr-2" />
                Enable Notifications
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check className="h-4 w-4" />
                Notifications enabled
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Daily reminder time</span>
                <Input
                  type="time"
                  value={notificationTime}
                  onChange={(e) => updateNotificationMutation.mutate(e.target.value)}
                  className="w-32"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tags & Thresholds</CardTitle>
            <Dialog open={isCreating} onOpenChange={setIsCreating}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <TagEditor
                  onSave={() => {
                    setIsCreating(false)
                    queryClient.invalidateQueries({ queryKey: ['tags'] })
                  }}
                  onCancel={() => setIsCreating(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {tags?.map((tag, i) => (
            <div key={tag.id}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge
                    className="text-white"
                    style={{ backgroundColor: tag.color || '#888' }}
                  >
                    {tag.name}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {tag.count_per_period}/{formatPeriod(tag.period_days)}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Dialog
                    open={editingTag?.id === tag.id}
                    onOpenChange={(open) => !open && setEditingTag(null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingTag(tag)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <TagEditor
                        tag={tag}
                        onSave={() => {
                          setEditingTag(null)
                          queryClient.invalidateQueries({ queryKey: ['tags'] })
                        }}
                        onCancel={() => setEditingTag(null)}
                      />
                    </DialogContent>
                  </Dialog>
                  {!tag.is_default && (
                    <Dialog
                      open={deletingTag?.id === tag.id}
                      onOpenChange={(open) => !open && setDeletingTag(null)}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingTag(tag)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete {tag.name}?</DialogTitle>
                        </DialogHeader>
                        <p className="text-muted-foreground">
                          This will remove the tag from every contact that has it.
                        </p>
                        <div className="flex gap-2 mt-4">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setDeletingTag(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={() => {
                              deleteTag(tag.id)
                              for (const queryKey of getTagDeleteInvalidationKeys()) {
                                queryClient.invalidateQueries({ queryKey })
                              }
                              setDeletingTag(null)
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Export everything to a file, or restore from a file you exported earlier.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export data
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => restoreInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Restore
            </Button>
            <input
              ref={restoreInputRef}
              type="file"
              className="hidden"
              onChange={handleRestoreFileChosen}
            />
          </div>
          {dataError && (
            <p role="alert" className="text-sm text-destructive">
              {dataError}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pendingRestore !== null}
        onOpenChange={(open) => !open && !isRestoring && setPendingRestore(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore from {pendingRestore?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            This replaces all current contacts, tags and check-ins with the contents of the file.
            A backup of your current data downloads first.
          </p>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              disabled={isRestoring}
              onClick={() => setPendingRestore(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={isRestoring}
              onClick={handleRestoreConfirmed}
            >
              Restore
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* About */}
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          <p>Friends v1.0.0</p>
          <p>Keep in touch with people who matter</p>
        </CardContent>
      </Card>
    </div>
  )
}

function TagEditor({
  tag,
  onSave,
  onCancel,
}: {
  tag?: Tag
  onSave: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(tag?.name || '')
  const [count, setCount] = useState(tag?.count_per_period || 2)
  const [period, setPeriod] = useState(tag?.period_days || 7)
  const [color, setColor] = useState(tag?.color || COLORS[0])

  const handleSave = async () => {
    await initDB()
    if (tag) {
      updateTag(tag.id, { name, count_per_period: count, period_days: period, color })
    } else {
      createTag({ name, count_per_period: count, period_days: period, color })
    }
    onSave()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{tag ? 'Edit Tag' : 'New Tag'}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 mt-4">
        <div>
          <label className="text-sm font-medium">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. close-friend"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Check-ins</label>
            <Input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Period</label>
            <Select
              value={String(period)}
              onValueChange={(v) => setPeriod(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Color</label>
          <div className="flex gap-2 mt-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`w-8 h-8 rounded-full border-2 ${
                  color === c ? 'border-foreground' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </>
  )
}
