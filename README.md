# Signal Scout

Signal Scout is an open-source desktop application for discovering opportunities from RSS feeds, scoring them based on relevance and intent, and generating AI-assisted responses when appropriate.

Built with Electron, React, TypeScript, and OpenAI.

---

## Features

### RSS Feed Monitoring

Track opportunities from custom RSS feeds without requiring API access.

* Custom feed lists
* Multi-project support
* Fast feed scanning
* Local-first workflow

### Opportunity Discovery

Signal Scout analyzes incoming feed items and identifies potential opportunities using:

* Keyword matching
* Phrase matching
* Intent detection
* Avoid-word filtering
* Opportunity scoring

### Intent Detection

Not every keyword match is useful.

Signal Scout attempts to identify whether a post is:

* Tool Request
* Recommendation Request
* Support Question
* Buying Intent
* Discussion
* Showcase
* Job/Hiring
* News/Announcement

This helps surface actionable opportunities instead of noise.

### AI Match Review

Optional AI review can be enabled for high-scoring opportunities.

Rather than sending every post to OpenAI, Signal Scout:

1. Uses local scoring first
2. Filters low-quality matches
3. Sends only strong candidates for AI review

This reduces cost while improving relevance.

### AI Response Generation

Generate contextual responses based on:

* Project information
* Keywords
* Response style
* Feed content
* Opportunity context

Responses are generated on demand and are never posted automatically.

### Lead Management

Manage opportunities through a simple workflow:

* New
* Saved
* Responded
* Dismissed

Additional features:

* Bulk actions
* Read tracking
* Status filtering
* Project-specific lead management

### Import / Export

Backup and restore:

* Projects
* Leads
* Settings

using JSON exports.

---

## Screenshots

Add screenshots here.

Suggested screenshots:

* Project Setup
* Opportunity Dashboard
* AI Response Generation
* Settings Page

---

## Installation

Download the latest installer from the Releases section.

Install and launch Signal Scout.

No external services are required unless you choose to enable OpenAI features.

---

## OpenAI Features

OpenAI functionality is optional.

If enabled, Signal Scout can:

* Generate project keywords
* Review strong opportunities
* Generate contextual responses

Users must provide their own OpenAI API key.

No API key is bundled with the application.

---

## Privacy

Signal Scout is designed to be local-first.

* Projects are stored locally
* Leads are stored locally
* Settings are stored locally

OpenAI requests are only made when AI features are enabled.

---

## Tech Stack

* Electron
* React
* TypeScript
* Vite
* RSS Parser
* OpenAI SDK

---

## Roadmap

Planned improvements:

* Additional feed sources
* Improved intent classification
* Better scoring models
* Team workflows
* Additional export options
* Analytics and reporting
* More AI-assisted workflows

---

## Contributing

Issues, feature requests, and pull requests are welcome.

If you encounter a bug or have an idea for improvement, please open an issue.

---

## License

MIT License

Use it, modify it, and build on it.
