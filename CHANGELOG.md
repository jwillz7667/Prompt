# Changelog

All notable changes to Promptomize are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Sections used: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## [Unreleased]

### Added
- Production-grade repository documentation: root `README.md`, `ARCHITECTURE.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and per-package
  README files for backend, web, iOS, widget extension, and ChatGPT app.
- Proprietary `LICENSE` covering source, binaries, documentation, and trademarks.
- Repository hygiene tooling: `.editorconfig`, `.nvmrc`, `.prettierrc`,
  `.prettierignore`, expanded `.gitignore`, `.swiftformat`, `.swiftlint.yml`.
- GitHub templates: pull request template, bug report and feature request issue
  templates, `CODEOWNERS`, and Dependabot configuration for `npm`, `github-actions`,
  and `docker` ecosystems.
- CodeQL static analysis workflow for JavaScript / TypeScript surface.
- Backend ESLint configuration plus `lint`, `format`, and `typecheck` npm scripts.
- Web Prettier configuration with the Tailwind class-sorting plugin.

### Changed
- Backend and web `package.json` scripts standardized to expose `lint`, `format`,
  `format:check`, and `typecheck` commands.

## [2.0.0] — 2026-04-24

### Fixed
- Thread context loss between turns and image-context propagation in multi-turn flows.
- History list refresh after deleting a prompt.
- Settings persistence regressions on cold launch.

### Changed
- Bumped iOS build number to 3 for App Store v2.0 resubmission.

### Removed
- Auth gate on the In-App Purchase flow that triggered Apple guideline 5.1.1(v) review
  rejection — purchases are now reachable without an account.

## [1.9.0] — 2026-04-08

### Added
- EULA link in App Store listing descriptions to address guideline 3.1.2(c) review feedback.
- App Store Optimization (ASO) updates: refreshed marketing screenshots and copy.

### Changed
- Replaced legacy App Store screenshots with new marketing frames matching the v2.0 brand.

## [1.8.0] — 2026-04-03

### Removed
- "Power Tools", "Sandbox", and "Workflows" from App Store metadata since those features
  are not yet shipped to end users.

### Changed
- App Store promotional text trimmed to length limits and finalized for submission.
- App Store metadata rewritten to match the actually shipped feature set.

## [1.7.0] — 2026-03-27

### Removed
- NSFW mode entirely, resolving an App Store guideline 1.1 review rejection. Both the
  modality option and the per-enhancement toggle were deleted.
- Third-party AI vendor names from App Store metadata to satisfy regional review (China
  App Store specifically). Generic terms ("AI models", "language models") are used in
  user-facing copy.

### Added
- History delete action, sidebar profile information, and swipe-to-dismiss for the chat
  drawer.
- Widget extension styling refresh aligned with the new brand design system.

### Fixed
- Removed alpha channel from app icons for App Store compliance.

[Unreleased]: https://github.com/jwillz7667/Prompt/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/jwillz7667/Prompt/releases/tag/v2.0.0
[1.9.0]: https://github.com/jwillz7667/Prompt/releases/tag/v1.9.0
[1.8.0]: https://github.com/jwillz7667/Prompt/releases/tag/v1.8.0
[1.7.0]: https://github.com/jwillz7667/Prompt/releases/tag/v1.7.0
