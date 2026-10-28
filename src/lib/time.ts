import { useEffect, useState } from 'react'

export function useNow(intervalMs = 15000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function formatDeadline(deadline: number | bigint): string {
  return new Date(Number(deadline) * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatTimestamp(seconds: number | bigint): string {
  return new Date(Number(seconds) * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

/** "3 days left", "5 hours left", "Closed" */
export function timeLeft(deadline: number | bigint, now: number): string {
  const diff = Number(deadline) - now
  if (diff < 0) return 'Closed'
  if (diff < 90) return 'Less than a minute left'
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} left`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} left`
  const days = Math.floor(hours / 24)
  return `${days} days left`
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
