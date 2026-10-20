# Pinax

[简体中文](README.md) · [English user guide](docs/user-manual/en/README.md)

**A writing workspace that keeps you in control.**

Pinax is for people with stories to tell who may have limited time, energy or writing experience. AI can help with organizing sources, checking continuity and handling repetitive revisions, so authors can focus on the story decisions only they can make. The aim is to help more people turn ideas into stronger work—not to write in their place.

The product centers on text and the manuscript workspace. Characters, settings and sources support the manuscript; roleplay, comics, image generation and video are extensions around it. Writing, import, export and backups work without an AI key or account.

Pinax is a **Public Alpha**. Try the public deployment at [pinax.cc](http://pinax.cc/) or run it locally. As checked on 2026-10-15, the public site still uses HTTP and HTTPS remains pending; back up before changing origins. English covers the main writing path; advanced worldbuilding, experiments and some auxiliary tools still have Chinese UI. Real-model literary quality and physical-device input remain separate acceptance checks.


## Start writing

1. Open **Settings → Appearance** and choose **English**. This preference stays on your device.
2. Choose **New manuscript** or **Import TXT / Markdown**. Check imported chapters before creating the manuscript.
3. Write, develop character profiles, or request a review. Assistant edits default to review before adoption; automatic changes require explicit scope authorization.
4. Export readable Markdown or keep a **Workspace backup (ZIP)**. Test restoring a copy before relying on a device migration.

The [quick start](docs/user-manual/en/01-quickstart.md) and [writing guide](docs/user-manual/en/05-writing.md) explain the controls. [Settings and backups](docs/user-manual/en/07-settings.md) cover model connections, data sending and restore behavior.

## Data and languages

Work is stored in this browser, using localStorage and IndexedDB for different data domains. There is no automatic cloud sync. Another browser, profile, hostname, protocol or port may have different storage. Keep backups and return to the original address before assuming work was lost.

Interface language and assistant explanation language are separate from the language of your existing manuscript. Switching the interface does not translate existing content, rename chapters or regenerate AI output. Explanations can be Chinese while quoted passages and rewrite text remain English.

AI requests may send the selected passage, relevant context and references through the deployment server to the configured provider. Model keys are excluded from workspace backups. AI is optional; review suggestions carefully.

## Run locally

Use Node.js 22 (the repository requires `>=22.13.0 <23`).

```sh
npm ci
npm run dev
```

Run the backend in another terminal for API and help resources:

```sh
npm run server
```

Text AI also requires a compiled runtime and server model configuration:

```sh
PINAX_RUNTIME_OUTPUT=.runtime/storyagent-next npm run build:agent-runtime
```

Build before starting the configured backend. Local knowledge retrieval separately needs `npm run build:knowledge-runtime` and project binding. Public deployments disable local-file access. See [runtime deployment](docs/engineering/agent-runtime-deployment.md) for production artifacts and rollback.

Use the address printed by Vite. Model availability depends on the deployment configuration. See the [engineering documentation](docs/README.md) for deployment details.

## License

Pinax uses the **PolyForm Noncommercial License 1.0.0**. See [LICENSE](LICENSE) for the terms and commercial-use restrictions. Third-party components retain their own licenses.
