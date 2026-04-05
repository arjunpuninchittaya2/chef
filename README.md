<p align="center">
  <img src="icon-128.png" alt="Chef" width="96" />
</p>

<h1 align="center">Chef</h1>

<p align="center">
  <strong>Open-source browser agent Chrome extension powered by OpenRouter</strong>
</p>

<p align="center">
  Access GPT-4o, Claude, Gemini, Grok, and 100+ other models through OpenRouter — all from one extension.
</p>

---

## What is Chef?

Chef is a Chrome extension that gives any LLM the ability to see and control your browser. It works like a human assistant that can:

- **Take screenshots** and understand what's on screen
- **Click, type, scroll** and navigate web pages
- **Read page content** and extract information
- **Open tabs** and work across multiple pages
- **Record and replay workflows** for repetitive tasks

Chef uses OpenRouter to provide access to models from OpenAI, Anthropic, Google, xAI, and many other providers through a single API.

## Supported Models via OpenRouter

OpenRouter provides access to 100+ models from leading providers:

| Provider | Example Models | Vision |
|----------|---------------|--------|
| **OpenAI** | GPT-4o, GPT-5, o3, o4-mini | Yes |
| **Anthropic** | Claude 4 Sonnet, Claude 4 Opus | Yes |
| **Google** | Gemini 2.5 Pro/Flash | Yes |
| **xAI** | Grok 3, Grok 4 | Yes |
| **Meta** | Llama 3.3 70B, Llama 4 | Varies |
| **And many more...** | 100+ models available | Varies |

All models get a **monochrome theme** throughout the UI — the sidebar, send button, and page border maintain a clean, professional look.

## Features

- **OpenRouter integration** — Access 100+ models from multiple providers through a single API
- **Automatic vision detection** — Knows which models support images and which don't, with safe fallback
- **Monochrome UI** — Clean, professional interface with monochrome icons
- **Page glow border** — Subtle border around the page while the agent is working
- **No account required** — No sign-up, no subscription. Just add your OpenRouter API key and go
- **Workflow recording** — Record browser actions and replay them later
- **GIF export** — Export recordings as GIFs
- **Tool use** — Models that support function calling get collapsible tool-use blocks in the chat

## Installation

1. Download or clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select this folder
5. Click the Chef icon in your toolbar to open the side panel
6. Go to **Settings** and add your OpenRouter API key

## Quick Start

1. Open any web page
2. Open Chef from the side panel
3. Select your model from the dropdown at the top
4. Type a task like _"Find the cheapest flight from Calgary to Tokyo next month"_
5. Watch the agent work — it takes screenshots, clicks, scrolls, and reports back

## Configuration

Open the **Provider Settings** page from the extension options to:

- Enter your OpenRouter API key
- Choose your default model
- Fetch available models from the OpenRouter API

## Getting an OpenRouter API Key

1. Go to [OpenRouter](https://openrouter.ai)
2. Sign up for a free account
3. Navigate to the API Keys section
4. Create a new API key
5. Add the key to Chef's settings

OpenRouter offers pay-as-you-go pricing for all models, with no subscription required.

## Architecture

Chef works by intercepting the stock extension's Anthropic API calls and translating them to OpenAI-compatible `chat/completions` requests. This means:

- The full browser automation toolkit (screenshots, clicks, navigation) works with any OpenRouter model
- Tool calls are translated between Anthropic and OpenAI formats in real-time
- SSE streaming is translated on the fly
- Vision payloads are automatically downgraded for text-only models

Key files:

| File | Purpose |
|------|---------|
| `provider-registry.js` | Provider definitions, model lists, vision detection |
| `api-adapter.js` | API translation layer (Anthropic ↔ OpenAI) |
| `ui-branding.js` | Dynamic theme colors in the side panel |
| `brand-overlay.js` | Page glow border and stop button theming |
| `sidepanel-provider-menu.js` | Provider/model dropdown UI |
| `provider-settings.js` | Settings page for API keys and configuration |

## Roadmap

- [ ] **Persistent page glow** — Fix the colored glow border so it reliably pulses during agent activity
- [ ] **Conversation history** — Save and resume past agent sessions
- [ ] **Multi-tab workflows** — Coordinate actions across multiple tabs in a single task
- [ ] **Prompt templates** — Pre-built task templates for common workflows (form filling, data extraction, price comparison)
- [ ] **Export to Playwright/Puppeteer** — Convert recorded workflows to automation scripts
- [ ] **Provider cost tracking** — Track token usage and estimated cost per conversation
- [ ] **Firefox & Edge support** — Port the extension to other Chromium and non-Chromium browsers
- [ ] **Mobile support** — Bring browser agent capabilities to mobile browsers via Kiwi Browser or Firefox Android extensions

Have a feature idea? [Open an issue](https://github.com/arjunpuninchittaya2/chef/issues) or submit a PR.

## Acknowledgments

Chef is built on top of Anthropic's [Claude for Chrome](https://chrome.google.com/webstore/detail/claude/danfohhfmbeahkgpceibgibfpkhokbfp) extension. We simplified it to work exclusively with OpenRouter, providing access to 100+ models through a single API.

## License

MIT

## Contributing

PRs welcome. This extension is designed to work exclusively with OpenRouter for simplicity and wide model access.
