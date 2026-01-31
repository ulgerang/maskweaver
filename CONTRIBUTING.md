# Contributing to Maskweaver

Thank you for your interest in contributing to Maskweaver! 🎭

## Ways to Contribute

### 🎭 Adding New Masks

The easiest way to contribute is by adding new expert persona masks.

#### Mask Schema

Create a YAML file following this structure:

```yaml
metadata:
  id: expert-name          # kebab-case, unique identifier
  version: '1.0'
  language: en             # en, ko, zh, ja
  created: '2026-01-31T00:00:00Z'
  updated: '2026-01-31T00:00:00Z'
  authors:
    - Your Name
  tags:
    - relevant
    - tags

profile:
  name: Expert Name
  tagline: One-line description of the persona
  
  background: |
    2-3 paragraphs about this expert's background,
    philosophy, and approach to their craft.
  
  expertise:
    - Core expertise area 1
    - Core expertise area 2
    - Core expertise area 3
  
  thinkingStyle: |
    Description of how this expert approaches problems.
  
  strengths:
    - Key strength 1
    - Key strength 2
    - Key strength 3
  
  limitations:
    - Known limitation 1
    - Known limitation 2

behavior:
  systemPrompt: |
    Detailed instructions for the AI to embody this persona.
    Include communication style, priorities, and principles.
  
  communicationStyle:
    tone: direct | friendly | formal | socratic | enthusiastic
    verbosity: concise | moderate | detailed
    technicalDepth: beginner | intermediate | expert
  
  approachPatterns:
    problemSolving: |
      How this expert approaches problem-solving.
    codeReview: |
      How this expert reviews code.
  
  signaturePhrases:
    - "Famous quote or catchphrase"

usage:
  suitableFor:
    - Use case 1
    - Use case 2
  
  notSuitableFor:
    - Anti-pattern 1
  
  examples:
    - scenario: "Example scenario"
      expectedOutcome: "What the AI would do"

config:
  priority: 50          # 0-100, higher = more dominant
  temperature: 0.7      # 0-2, creativity level
```

#### Quality Guidelines

1. **Authenticity**: Research the expert thoroughly
2. **Usefulness**: Focus on practical expertise, not personality quirks
3. **Honesty**: Include limitations, don't oversell
4. **Testability**: Include examples that can verify the mask works

### 🌍 Translations

We welcome translations of existing masks to:
- 한국어 (Korean)
- 中文 (Chinese)
- 日本語 (Japanese)

Place translated masks in:
```
masks/{category}/{mask-id}/locales/{lang}.yaml
```

### 🐛 Bug Reports

Open an issue with:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details (opencode version, OS)

### 💡 Feature Requests

Open an issue with:
- Use case description
- Proposed solution (if any)
- Alternatives considered

## Development Setup

```bash
# Clone the repo
git clone https://github.com/maskweaver/maskweaver.git
cd maskweaver

# Install dependencies
bun install

# Build packages
bun run build

# Run tests
bun test

# Validate masks
bun run validate-masks
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-mask`)
3. Make your changes
4. Run tests (`bun test`)
5. Commit with clear message
6. Push and open a PR

### PR Checklist

- [ ] Tests pass
- [ ] Masks validate against schema
- [ ] Documentation updated (if needed)
- [ ] No secrets or sensitive data

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help newcomers feel welcome

## Questions?

- Open a GitHub Discussion
- Join our Discord (coming soon)

---

Thank you for helping make Maskweaver better! 🎭💜
