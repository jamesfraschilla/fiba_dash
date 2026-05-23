## FIBA Supabase Setup

Create a new Supabase project for `fiba_dash` and wire the app to that project only.

### Frontend env

Set these in local `.env.local` and in GitHub Actions repo secrets:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_FIBA_DEFAULT_COMPETITION_ID=sr:competition:17788
VITE_FIBA_DEFAULT_SEASON_ID=
```

For local-only development, you may also keep:

```env
VITE_SPORTRADAR_API_KEY=...
```

### Supabase function secrets

Set these in the new Supabase project:

```env
SPORTRADAR_API_KEY=...
SPORTRADAR_ACCESS_LEVEL=trial
SPORTRADAR_LANGUAGE=en
```

### Functions to deploy

At minimum, deploy:

```bash
supabase functions deploy sportradar-proxy --project-ref <new-project-ref>
```

If you want account-backed features later, also deploy the FIBA-specific functions you still need from `supabase/functions/`.

### App behavior

- Local dev can use `VITE_SPORTRADAR_API_KEY` directly.
- Deployed builds should not embed a Sportradar key.
- GitHub Pages should use the `sportradar-proxy` function through `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
