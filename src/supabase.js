import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://edsezsvykkwtqwdewrsb.supabase.co";

const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc2V6c3Z5a2t3dHF3ZGV3cnNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MzM4NDcsImV4cCI6MjA5NTUwOTg0N30.ECQlgt8zeNYeyCKpXbEDL4VSUGzwxu7RtFRwAncb-jk";

export const supabase = createClient(supabaseUrl, supabaseKey);
