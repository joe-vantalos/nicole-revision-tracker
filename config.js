/* Account sign-in settings.
   Leave both empty and the app runs exactly as before, with no accounts and no sign-in screen.
   To switch accounts on, copy both values from Supabase: Project Settings → API.
   The anon key is public by design: it ships inside the app. What keeps each person's data private
   is row-level security in the database, not this key. Never put the service_role key here. */
window.APP_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
