import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nneetisdkmwuwmovlevp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_jxQVaK_1QcgppFjrYgRZwg_egpQoWzj'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)