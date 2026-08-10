# Background video clips

AI-generated ambient loops live here. See `assets/paddle-house/ai-video-shotlist.md`
for the shot list, source photos, and per-clip prompts.

Each clip needs:
- `<name>.mp4` — h.264, ~5s, silent, target under 2 MB
- `<name>.webm` — optional, offered first when present
- a matching poster still in `../` (used on mobile and reduced-motion)

Wire one up by adding `src` to an existing `<BackgroundVideo>`:

    <BackgroundVideo
      src="/paddle-house-pics/video/dusk-house.mp4"
      poster="/paddle-house-pics/hero-aerial.webp"
      alt="The farmhouse at dusk, windows lit"
      parallax={14}
    />
