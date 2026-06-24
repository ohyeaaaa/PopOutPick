# PopOutPick Website

## Project Layout

- `index.html`, `configurator.html`, `style.css`, `script.js`: public website and configurator.
- `admin/`: static admin dashboard protected by Supabase Auth/RLS.
- `GLB/`: public 3D model assets.
- `Picture/`: public image and video assets.
- `PopOutPick_Website/`: selected public icons plus ignored raw design exports.
- `database/`: Supabase SQL setup.
- `supabase/`: Supabase Edge Functions and local Supabase config.
- `integrations/`: external service scripts such as Google Apps Script.
- `deploy/`: hosting and reverse proxy examples.
- `docs/`: setup and operations guides.
- `tools/`: local build, preflight, smoke test, and monitoring scripts.
- `data/`, `logs/`: local runtime state, ignored by git.

## Common Commands

```powershell
npm.cmd run check
npm.cmd run preflight
npm.cmd run build:pages
```
