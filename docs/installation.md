# Installation

> Complete guide to installing and verifying Maskweaver — the AI Expert Persona System for [OpenCode](https://github.com/sst/opencode).
>
> **Quick version check**: `maskweaver --version` or `npm list maskweaver`

## For Humans

Paste this into your LLM agent session (Claude Code, AmpCode, Cursor, etc.):

```
Install and configure maskweaver by following the instructions here:
https://raw.githubusercontent.com/ulgerang/maskweaver/master/docs/installation.md
```

Or follow the manual installation below—but **we strongly recommend letting an agent handle it. Humans make mistakes.**

---

## For LLM Agents

If you're an LLM Agent helping set up Maskweaver, Welcome! You'll help your user install the best expert persona system for OpenCode.

Tell the user with a greeting like: "**Maskweaver를 설치할게요! 전설적인 개발자들의 페르소나를 AI에 입힐 수 있어요.**"

Follow these steps:

### Step 1: Install OpenCode (if not installed)

```bash
if command -v opencode &> /dev/null; then
    echo "OpenCode $(opencode --version) is installed"
else
    echo "OpenCode is not installed. Please install it first."
    echo "Ref: https://opencode.ai/docs"
fi
```

If OpenCode isn't installed, check the [OpenCode Installation Guide](https://opencode.ai/docs).

### Step 2: Add Plugin to OpenCode Config

#### Linux/macOS

```bash
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/opencode.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver"]
}
EOF
```

#### Windows (PowerShell)

```powershell
$configPath = "$env:USERPROFILE\.config\opencode"
New-Item -ItemType Directory -Force -Path $configPath
@"
{
  "`$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver"]
}
"@ | Out-File -Encoding UTF8 "$configPath\opencode.json"
```

### Step 3: Verify Setup

```bash
opencode --version  # Should be 1.0.150 or higher
cat ~/.config/opencode/opencode.json  # Should contain "maskweaver" in plugin array
```

### Step 4: Say Congratulations!

Tell the user:

> "**Maskweaver 설치 완료!**
>
> 이제 OpenCode에서 전문가 페르소나를 사용할 수 있어요:
> - `리눅스 토발즈 가면을 써줘` - 시스템 프로그래밍 전문가
> - `@dummy-human` - 일반 개발 작업
> - `@dummy-flash` - 빠른 파일 검색
> - `@dummy-premium` - 복잡한 아키텍처 설계"

---

## Quick Install (Manual, 10 seconds)

Just add to your OpenCode config - **no npm install required!**

```json
{
  "plugin": ["maskweaver"]
}
```

**Config locations:**
- **Global**: `~/.config/opencode/opencode.json`
- **Windows**: `%USERPROFILE%\.config\opencode\opencode.json`
- **Per-project**: `opencode.json` in project root

OpenCode automatically installs the plugin to `~/.cache/opencode/node_modules/` on startup.

Done! Skip to [Verification](#verification).

---

## What Gets Installed

When the plugin loads, it **automatically creates** these files in your project's `.opencode/` directory:

```
.opencode/
├── agents/
│   ├── mask-master.md      # Main AI coordinator
│   ├── dummy-human.md      # General purpose worker (subagent)
│   ├── dummy-flash.md      # Fast, cheap worker (subagent)
│   └── dummy-premium.md    # Complex reasoning worker (subagent)
└── masks/
    ├── index.json          # Mask catalog
    ├── software-engineering/
    │   ├── linus-torvalds.yaml
    │   ├── kent-beck.yaml
    │   ├── martin-fowler.yaml
    │   └── dan-abramov.yaml
    ├── architecture/
    │   └── jeff-dean.yaml
    └── ai-ml/
        └── andrew-ng.yaml
```

**Features:**
- Only copies files that don't exist (won't overwrite your customizations)
- Works on first run - no manual setup needed
- Each project gets its own copy

---

## How It Works

When you add a plugin name to `opencode.json`, OpenCode:
1. Checks if the package exists in `~/.cache/opencode/node_modules/`
2. If not, runs `bun install` to fetch it from npm
3. Loads the plugin automatically

**You don't need to run any install commands yourself!**

---

## Configuration Options

### Global Configuration

For all projects, edit `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver"]
}
```

### Project Configuration

For a specific project, create `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver"]
}
```

Project config is merged with global config.

---

## Development Setup

For contributors or local development:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver"]
}
```

### 3. Verify

```bash
# Test in OpenCode
@maskweaver help
@dummy-human Hello
@context status
```

---

## Development Setup

For contributors or local development:

```bash
# Clone repository
git clone https://github.com/ulgerang/maskweaver.git
cd maskweaver

# Install dependencies
bun install  # or npm install

# Build packages
bun run build

# Run setup wizard (optional)
bun run setup
```

The setup wizard configures:
- AI model preferences (dummy-human tiers)
- Embedding provider (memory system)
- Agent files for OpenCode
- `maskweaver.config.ts`

> **⚠️ Windows Users**: If you encounter symlink errors, see [Windows Installation](#windows-installation) below.

---

## Windows Installation

### Common Issue: Symlink Errors

If you see errors like:

```
EISDIR: Is a directory: failed to symlink dependencies for package
error: EPERM: operation not permitted, symlink
```

**Cause**: Windows requires Developer Mode or Administrator privileges for symlinks.

### Solution 1: Enable Developer Mode (Recommended)

1. Open **Settings** → **Update & Security** → **For developers**
2. Toggle **Developer Mode** to **On**
3. Restart your terminal
4. Run `bun install` again

### Solution 2: Use Administrator Terminal

1. Right-click **PowerShell** or **Command Prompt**
2. Select **Run as Administrator**
3. Navigate to project directory
4. Run `bun install`

### Solution 3: Use pnpm (No symlinks required)

```bash
# Install pnpm
npm install -g pnpm

# Install dependencies
pnpm install

# Build
pnpm run build
```

pnpm uses hardlinks by default, avoiding symlink issues.

### Solution 4: bunfig.toml Configuration

Create a `bunfig.toml` file in your project root with fallback mode:

```toml
[install]
# Use fallback mode for Windows symlink issues
auto = "fallback"

[install.lockfile]
save = true
```

**Note**: The `"hardlink"` option is not valid in bun. Use `"fallback"` instead.

### Platform-Specific Paths

| Platform | Config Path |
|----------|-------------|
| Windows | `%USERPROFILE%\.config\opencode\opencode.json` |
| macOS/Linux | `~/.config/opencode/opencode.json` |

**Windows Path Format**: Use either:
- Escaped backslashes: `E:\\works\\maskweaver`
- Forward slashes: `E:/works/maskweaver`

---

## Local Plugin Development

### Using bun link

```bash
# In maskweaver/packages/plugin
cd packages/plugin
bun link

# In your OpenCode config dir
cd ~/.config/opencode/plugins
bun link maskweaver
```

### Using file path

Edit `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["E:\\works\\maskweaver\\packages\\plugin"]
}
```

**Use absolute paths.** Relative paths are not supported.

---

## Plugin Configuration

Maskweaver looks for `maskweaver.config.ts` in:
1. Project root (`.opencode/` directory)
2. User config (`~/.config/opencode/`)
3. Global fallback

### Example Config

```typescript
// maskweaver.config.ts
export default {
  dummyHumans: {
    flash: 'anthropic/claude-haiku-4',
    human: 'anthropic/claude-sonnet-4',
    premium: 'anthropic/claude-opus-4'
  },
  
  memory: {
    provider: 'voyageai',  // ollama | openai | voyageai | openrouter | text
    model: 'voyage-code-2',
    dimensions: 1536
  },
  
  maskDir: './masks',
  language: 'en'  // en | ko | zh | ja
};
```

### Environment Variables

Create `.env` file:

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# VoyageAI (best for code)
VOYAGEAI_API_KEY=pa-...

# OpenRouter
OPENROUTER_API_KEY=sk-or-...

# Ollama (if remote)
OLLAMA_BASE_URL=http://localhost:11434
```

---

## Embedding Providers

### Ollama (Local, Free)

```bash
# Install Ollama: https://ollama.ai
ollama pull bge-m3
```

Config:
```typescript
memory: {
  provider: 'ollama',
  model: 'bge-m3',
  dimensions: 1024
}
```

### VoyageAI (Best for Code)

```bash
export VOYAGEAI_API_KEY=pa-...
```

Config:
```typescript
memory: {
  provider: 'voyageai',
  model: 'voyage-code-2',
  dimensions: 1536
}
```

### OpenAI

```bash
export OPENAI_API_KEY=sk-...
```

Config:
```typescript
memory: {
  provider: 'openai',
  model: 'text-embedding-3-large',
  dimensions: 3072
}
```

### Text-only (No Embeddings)

```typescript
memory: {
  provider: 'text',
  model: 'fts5',
  dimensions: 0
}
```

---

## Package Installation

Install individual packages:

```bash
# Memory system
npm install @maskweaver/memory

# Context tracking
npm install @maskweaver/context

# Verification
npm install @maskweaver/verify

# All packages
npm install @maskweaver/core @maskweaver/memory @maskweaver/context @maskweaver/verify
```

### Usage Example

```typescript
import { hybridSearch, indexFile } from '@maskweaver/memory';
import { createFeature } from '@maskweaver/context';
import { verifyWithMask } from '@maskweaver/verify';

// Index files
await indexFile('./docs/architecture.md', embedFn);

// Search
const results = await hybridSearch('authentication', embedFn);

// Track feature
const feature = await createFeature({
  name: 'oauth-login',
  goal: 'Implement OAuth2 flow'
});
```

---

## Verification

After installation:

### 1. Check Installed Version

```bash
# CLI (if installed globally or via npx)
maskweaver --version
# or
maskweaver -V

# npm
npm list maskweaver

# In OpenCode chat - use the maskweaver_status tool
# or type /weave help to see version info
```

```typescript
// Programmatic (Node.js / TypeScript)
import { VERSION } from 'maskweaver';
console.log(VERSION);
```

### 2. Check Plugin is Loaded

Start OpenCode and check for Maskweaver:

```bash
opencode
# Plugin should load automatically
```

### 2. Test Commands

In OpenCode:

```bash
@maskweaver list masks
@dummy-human Hello, can you help?
@context status
```

Expected:
```
✅ Available masks: linus-torvalds, ...
✅ Hello! Yes, I can help you.
✅ No active feature.
```

### 3. Check Cache (if needed)

```bash
# Verify plugin was installed to cache
ls ~/.cache/opencode/node_modules/@maskweaver
```

---

## Troubleshooting

### Plugin not loading

1. Check config file exists and is valid JSON:
   ```bash
   cat ~/.config/opencode/opencode.json
   ```

2. Verify the plugin name is correct:
   ```json
   {
     "plugin": ["maskweaver"]
   }
   ```

3. Clear cache and restart OpenCode:
   ```bash
   rm -rf ~/.cache/opencode/node_modules/@maskweaver
   opencode
   ```

### Embedding provider error

Check `.env` file has correct API key:
```bash
grep VOYAGEAI_API_KEY .env
```

### Masks not loading

Verify `maskDir` in config:
```bash
ls -la ./masks
```

### Module not found (dev setup)

```bash
# Rebuild packages
bun run build

# Reinstall
bun install
```

---

## Platform Notes

### Windows

- Config: `%USERPROFILE%\.config\opencode\opencode.json`
- Use backslashes in paths: `E:\\works\\maskweaver`
- Or forward slashes: `E:/works/maskweaver`

### Mac/Linux

- Config: `~/.config/opencode/opencode.json`
- Permissions: `chmod 644 ~/.config/opencode/opencode.json`

---

## For LLM Agents

If you are an LLM agent helping a user install Maskweaver, follow these steps carefully.

### Step 1: Add Plugin to OpenCode Config

#### Linux/macOS

```bash
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/opencode.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver"]
}
EOF
```

#### Windows (PowerShell)

```powershell
$configPath = "$env:USERPROFILE\.config\opencode"
New-Item -ItemType Directory -Force -Path $configPath
@"
{
  "`$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver"]
}
"@ | Out-File -Encoding UTF8 "$configPath\opencode.json"
```

### Step 2: Check User's Available Providers and Models (REQUIRED)

**Before asking any questions, run these commands to see what the user already has:**

```bash
# Check authenticated providers
opencode auth list

# Check available models
opencode models
```

Example `opencode auth list` output:
```
●  OpenAI oauth
●  Google oauth
●  GitHub Copilot oauth
●  Anthropic oauth
```

This tells you which providers the user has already authenticated. **Use this information to suggest appropriate models.**

### Step 3: Analyze Available Models and Auto-Recommend

**Run `opencode models` and analyze the output.** DO NOT ask the user about task types - directly recommend based on available models.

#### Model Classification Rules

Analyze the model list and classify each model:

**Premium tier** (for deep thinking, architecture):
- Models containing: `opus`, `o1`, `gpt-5`, `thinking`, `xhigh`, `kimi-2.5`
- Examples: `codex/gpt-5.2`, `claude-opus-4`, `o1-preview`

**Human tier** (for general development):
- Models containing: `sonnet`, `gpt-4o` (not mini), `glm-4.7` (not flash), `gemini-pro`, `gemini-3-flash` (not minimal)
- Examples: `claude-sonnet-4`, `gpt-4o`, `glm-4.7`

**Flash tier** (for quick tasks):
- Models containing: `haiku`, `flash`, `mini`, `minimal`, `instant`, `turbo`
- Examples: `claude-haiku-4`, `gpt-4o-mini`, `gemini-3-flash`

#### Priority Order (when multiple models available)

**Premium:**
1. `codex/gpt-5.2` (variant: xhigh) - Best reasoning
2. `*opus-4-5-thinking` or `*opus-4.5` - Strategic thinking
3. `kimi-coding/kimi-2.5` - Good alternative
4. `*claude-opus-4` - Reliable

**Human:**
1. `*antigravity-gemini-3-flash` or `zai-coding-plan/glm-4.7` - Fast & capable
2. `*claude-sonnet-4-5` or `*claude-sonnet-4` - Balanced
3. `*gpt-4o` - General purpose

**Flash:**
1. `*gemini-3-flash` (variant: minimal) - Fastest
2. `*glm-4.7-flash` or `*haiku-4` - Quick
3. `*gpt-4o-mini` - Cheap

### Step 4: Auto-Recommend to User

**After analyzing `opencode models`, directly recommend:**

```
🤖: 사용 가능한 모델을 확인했어요. 최적의 조합으로 설정할게요:

    📊 **추천 설정:**
    ┌─────────────┬──────────────────────────────┐
    │ 복잡한 작업 │ codex/gpt-5.2 (xhigh)        │
    │ 일반 개발   │ zai-coding-plan/glm-4.7      │
    │ 빠른 작업   │ google/antigravity-gemini... │
    └─────────────┴──────────────────────────────┘
    
    이대로 설정할까요? (다르게 하시려면 말씀해주세요)
```

**If you cannot classify a model** (unknown model name), THEN ask:

```
🤖: 일부 모델을 분류하기 어려워요. 
    `some-provider/unknown-model`은 어떤 용도로 쓰시겠어요?
    
    1. 복잡한 작업 (깊은 사고)
    2. 일반 개발 
    3. 빠른 단순 작업
```

### Step 5: Handle Edge Cases

**If only one provider available:**
```
🤖: Anthropic 모델만 사용 가능하네요. 자동으로 설정할게요:
    - 복잡한 작업: anthropic/claude-opus-4
    - 일반 개발: anthropic/claude-sonnet-4
    - 빠른 작업: anthropic/claude-haiku-4
```

**If no suitable Premium model:**
```
🤖: 복잡한 추론용 모델이 없어서, 일반 개발 모델을 대신 사용할게요:
    - 복잡한 작업: anthropic/claude-sonnet-4 (대체)
```

### Step 6: Ask About Memory System (Optional)

Ask the user:

> "프로젝트 기억 기능을 사용하시겠어요?
>
> - **예** → 이전 대화와 결정사항을 기억합니다
> - **아니오** → 기억 없이 사용합니다 (기본값)"

If yes, ask about embedding provider:

> "기억 저장 방식을 선택해주세요:
>
> 1. **Ollama** (무료) - 컴퓨터에서 직접 처리, 인터넷 불필요
> 2. **OpenAI** - 고품질 임베딩 (API 키 필요)
> 3. **VoyageAI** - 코드에 최적화된 임베딩 (API 키 필요, 추천!)
> 4. **OpenRouter** - 다양한 모델 선택 가능 (API 키 필요)
> 5. **텍스트만** - 키워드 검색만 (API 키 불필요)"

Embedding provider configuration:

| Provider | Model | Dimensions | Note |
|----------|-------|------------|------|
| Ollama | `bge-m3` | 1024 | Free, local, `ollama pull bge-m3` required |
| OpenAI | `text-embedding-3-large` | 3072 | Best quality |
| VoyageAI | `voyage-code-2` | 1536 | **Best for code!** |
| OpenRouter | `openai/text-embedding-3-large` | 3072 | Multiple providers |
| Text | `fts5` | 0 | No API key, keyword search only |

### Step 7: Create Configuration File

Based on user's answers, create `~/.config/opencode/maskweaver.config.json`:

```json
{
  "dummyHumans": {
    "flash": "anthropic/claude-haiku-4",
    "human": "anthropic/claude-sonnet-4",
    "premium": "anthropic/claude-opus-4"
  },
  "memory": {
    "provider": "text",
    "enabled": false
  },
  "language": "ko"
}
```

#### Linux/macOS

```bash
cat > ~/.config/opencode/maskweaver.config.json << 'EOF'
{
  "dummyHumans": {
    "flash": "USER_SELECTED_FLASH_MODEL",
    "human": "USER_SELECTED_HUMAN_MODEL",
    "premium": "USER_SELECTED_PREMIUM_MODEL"
  },
  "memory": {
    "provider": "USER_SELECTED_PROVIDER",
    "enabled": true
  },
  "language": "ko"
}
EOF
```

#### Windows (PowerShell)

```powershell
@"
{
  "dummyHumans": {
    "flash": "USER_SELECTED_FLASH_MODEL",
    "human": "USER_SELECTED_HUMAN_MODEL",
    "premium": "USER_SELECTED_PREMIUM_MODEL"
  },
  "memory": {
    "provider": "USER_SELECTED_PROVIDER",
    "enabled": true
  },
  "language": "ko"
}
"@ | Out-File -Encoding UTF8 "$env:USERPROFILE\.config\opencode\maskweaver.config.json"
```

### Step 8: Final Message to User

Only AFTER completing all configuration, tell the user:

> "✅ **Maskweaver 설정 완료!**
>
> **설정 내용:**
> - AI 도우미: [선택한 모델들]
> - 메모리: [사용함/사용안함]
>
> **이제 OpenCode를 재시작해주세요!**
>
> 재시작 후 다음 명령어로 확인할 수 있어요:
> - `안녕하세요` - AI 도우미 테스트
> - 가면을 써달라고 하면 전문가 모드로 답변합니다
> - `/weave help` - Weave 워크플로우 도움말
> - `/weave design docs/` - Phase 기반 개발 시작"

### Important Notes for LLM Agents

1. **DO NOT** tell the user to restart OpenCode before asking about model preferences
2. **DO NOT** use technical terms like "embedding provider" - use simple Korean
3. **DO NOT** skip the configuration questions
4. **DO** explain what each option means in simple terms
5. **DO** summarize the final configuration before asking to restart

---

## Weave Workflow (New!)

After installation, try the **Weave workflow** - a phase-driven development system with AI self-verification:

```bash
# 1. Analyze requirements and create a phase plan
/weave design docs/

# 2. Execute a phase with auto-verification
/weave craft P1

# 3. Check progress anytime
/weave status
```

**Features:**
- 🎭 **Auto Mask Selection**: AI picks the best expert for each task
- ✅ **Multi-Layer Verification**: Build → Test → E2E → Visual → A11y
- 🧠 **Global Knowledge**: Cross-project troubleshooting solutions (RAG)
- 📊 **Progress Tracking**: Real-time phase and task status

See the [README](../README.md#-weave-workflow) for full documentation.

---

## Next Steps

- 📖 [Configuration Guide](configuration.md) - Advanced options
- 🎭 [Masks Guide](masks.md) - Creating custom personas
- 🧵 [Weave Workflow](../README.md#-weave-workflow) - Phase-driven development
- 🚀 [Quick Start](../README.md#quick-start) - Usage examples

---

## Support

- 📝 [Report issues](https://github.com/ulgerang/maskweaver/issues)
- 💬 [Discussions](https://github.com/ulgerang/maskweaver/discussions)
- 📧 ulgerang@gmail.com
