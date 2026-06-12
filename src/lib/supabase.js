import { createClient } from '@supabase/supabase-js'

const url = 'https://gwdklxihiniljvielhhn.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZGtseGloaW5pbGp2aWVsaGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODczMTksImV4cCI6MjA5Njc2MzMxOX0.x-ru9FlujxwjAYoYyOZJRfjLWbeq9EBAISiPkKn5ZPo'

export const supabase = createClient(url, key)
