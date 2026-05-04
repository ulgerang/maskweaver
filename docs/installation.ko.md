# 설치 가이드

> Maskweaver — AI 전문가 페르소나 시스템을 [OpenCode](https://github.com/sst/opencode)에 설치하고 확인하는 완전한 가이드입니다.
>
> **빠른 버전 확인**: `maskweaver --version` 또는 `npm list maskweaver`

---

## 사람용 (가장 쉬운 방법)

아래 내용을 LLM 에이전트 세션(Claude Code, AmpCode, Cursor 등)에 붙여넣기 하세요:

```
Install and configure maskweaver by following the instructions here:
https://raw.githubusercontent.com/ulgerang/maskweaver/master/docs/installation.ko.md
```

또는 아래의 수동 설치를 따라하세요—하지만 **에이전트에게 맡기는 것을 강력 추천합니다. 사람은 실수하니까요.**

---

## 빠른 설치 (10초)

OpenCode 설정에 추가만 하면 됩니다 - **npm install 불필요!**

```json
{
  "plugin": ["maskweaver/plugin"]
}
```

**설정 파일 위치:**
- **전역**: `~/.config/opencode/opencode.json`
- **Windows**: `%USERPROFILE%\.config\opencode\opencode.json`
- **프로젝트별**: 프로젝트 루트의 `opencode.json`

OpenCode가 시작할 때 `~/.cache/opencode/node_modules/`에 자동으로 플러그인을 설치합니다.

완료! [설치 확인](#설치-확인)으로 이동하세요.

---

## 작동 방식

`opencode.json`에 플러그인 이름을 추가하면 OpenCode가:
1. `~/.cache/opencode/node_modules/`에 패키지가 있는지 확인
2. 없으면 npm에서 자동으로 `bun install` 실행
3. 플러그인 자동 로드
4. **구독 자동 감지** — `opencode.json`의 `model` 필드에서 모델 프로바이더를 감지하여 `maskweaver.config.json`을 자동 생성합니다

**직접 설치 명령어를 실행할 필요가 없습니다!**

### 구독 자동 감지 (Zero Config)

Maskweaver는 `opencode.json`의 `model` 필드를 읽어 사용 중인 모델 프로바이더를 자동 감지합니다:

| 감지된 모델 접두어 | 자동 생성되는 에이전트 풀 |
|---|---|
| `opencode-go/` | DeepSeek V4 Flash/Pro, Qwen 3.6 Plus, Kimi K2.6 |
| `zai-coding-plan/` | GLM-5 Turbo, GLM-5.1 |
| 둘 다 또는 감지 안됨 | opencode-go 풀 (기본값) |

**예시 — opencode-go 구독:**
```jsonc
// opencode.json
{
  "model": "opencode-go/deepseek-v4-flash",  // ← 이걸로 opencode-go 감지
  "plugin": ["maskweaver/plugin"]
}
```
→ DeepSeek/Qwen/Kimi 에이전트가 자동 생성됨

**예시 — zai-coding-plan 구독:**
```jsonc
// opencode.json
{
  "model": "zai-coding-plan/glm-5-turbo",  // ← 이걸로 zai-coding-plan 감지
  "plugin": ["maskweaver/plugin"]
}
```
→ GLM 에이전트가 자동 생성됨

자동 감지 결과는 `maskweaver.config.json`에 저장됩니다. 직접 편집하여 풀을 커스터마이즈할 수 있습니다.

---

## 설정 옵션

### 전역 설정

모든 프로젝트에 적용하려면 `~/.config/opencode/opencode.json` 편집:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver/plugin"]
}
```

### 프로젝트 설정

특정 프로젝트에만 적용하려면 프로젝트 루트에 `opencode.json` 생성:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver/plugin"]
}
```

프로젝트 설정은 전역 설정과 병합됩니다.

---

## 개발 설정

기여자 또는 로컬 개발용:

```bash
# 저장소 클론
git clone https://github.com/ulgerang/maskweaver.git
cd maskweaver

# 의존성 설치 (Windows에서는 pnpm 권장)
pnpm install  # 또는: bun install

# 빌드
pnpm run build

# 설정 마법사 실행 (선택)
pnpm run setup
```

> **⚠️ Windows에서 symlink 오류가 발생하면** 아래 [Windows 설치](#windows-설치) 섹션을 참조하세요.

---

## 사전 요구사항 (개발자용)

- **Node.js 18+** 또는 **Bun 1.0+**
- **opencode CLI**
- Git (저장소 클론용)
- **Windows 사용자**: 개발자 모드 또는 pnpm 사용 권장

---

## OpenCode 플러그인 설치

OpenCode를 사용하고 Maskweaver를 플러그인으로 통합하려면:

### 1. 플러그인 패키지 설치

```bash
# maskweaver 디렉토리에서
cd packages/plugin
bun link

# 프로젝트 또는 전역에서
bun link maskweaver
```

### 2. OpenCode 설정

`~/.config/opencode/opencode.json` 편집:

```json
{
  "plugin": [
    "maskweaver"
  ]
}
```

또는 JSONC 형식으로 `opencode.jsonc` 사용:

```jsonc
{
  // 전문가 페르소나를 위한 Maskweaver 플러그인
  "plugin": [
    "maskweaver"
  ]
}
```

### 3. 설치 확인

```bash
# Maskweaver 명령어가 사용 가능한지 확인
opencode --help

# 다음과 같은 Maskweaver 명령어를 볼 수 있어야 합니다:
# - @maskweaver
# - @dummy-human
# - @dummy-flash
# - @dummy-premium
# - @context
```

---

## Windows 설치

### 일반적인 문제: Symlink 오류

Windows에서 `bun install` 또는 `npm install` 실행 시 다음과 같은 오류가 발생할 수 있습니다:

```
EISDIR: Is a directory: failed to symlink dependencies for package
error: EPERM: operation not permitted, symlink
```

**원인**: Windows는 symlink 생성에 관리자 권한 또는 개발자 모드가 필요합니다.

### 해결책 1: 개발자 모드 활성화 (권장)

1. **설정** → **업데이트 및 보안** → **개발자용** 열기
2. **개발자 모드**를 **켜기**로 전환
3. 터미널 재시작
4. `bun install` 다시 실행

### 해결책 2: 관리자 터미널 사용

1. **PowerShell** 또는 **명령 프롬프트** 우클릭
2. **관리자 권한으로 실행** 선택
3. 프로젝트 디렉토리로 이동
4. `bun install` 실행

### 해결책 3: pnpm 사용 (symlink 불필요)

pnpm은 hardlink를 사용하여 symlink 문제를 피합니다:

```bash
# pnpm 설치
npm install -g pnpm

# 의존성 설치
pnpm install

# 빌드
pnpm run build
```

### 해결책 4: bunfig.toml 설정

프로젝트에 이미 `bunfig.toml`이 포함되어 있어 hardlink를 사용합니다:

```toml
[install]
auto = "hardlink"
```

이 설정으로 symlink 대신 hardlink를 사용하여 권한 문제를 피합니다.

### 플랫폼별 경로

| 플랫폼 | 설정 경로 |
|--------|----------|
| Windows | `%USERPROFILE%\.config\opencode\opencode.json` |
| macOS/Linux | `~/.config/opencode/opencode.json` |

**Windows 경로 형식**: 다음 중 하나 사용
- 백슬래시 (이스케이프): `E:\\works\\maskweaver`
- 슬래시: `E:/works/maskweaver`

---

## 수동 설정

마법사 없이 수동으로 설정하려면:

### 1. 설정 파일 생성

프로젝트 루트에 `maskweaver.config.ts` 생성:

```typescript
// maskweaver.config.ts
export default {
  // 더미인간 모델
  dummyHumans: {
    flash: 'anthropic/claude-haiku-4',
    human: 'anthropic/claude-sonnet-4',
    premium: 'anthropic/claude-opus-4'
  },
  
  // 메모리/임베딩 프로바이더
  memory: {
    provider: 'voyageai',  // 옵션: ollama, openai, voyageai, openrouter, text
    model: 'voyage-code-2',
    dimensions: 1536
  },
  
  // 가면 디렉토리
  maskDir: './masks',
  
  // 언어 선호도
  language: 'ko'  // 옵션: en, ko, zh, ja
};
```

### 2. 환경 변수 설정

프로젝트 루트에 `.env` 파일 생성:

```bash
# OpenAI 임베딩 프로바이더에 필요
OPENAI_API_KEY=your_openai_key_here

# VoyageAI 임베딩 프로바이더에 필요
VOYAGEAI_API_KEY=your_voyageai_key_here

# OpenRouter 임베딩 프로바이더에 필요
OPENROUTER_API_KEY=your_openrouter_key_here

# Ollama에 필요 (원격 인스턴스 사용 시)
OLLAMA_BASE_URL=http://localhost:11434
```

### 3. 에이전트 파일 복사 (OpenCode용)

```bash
# 에이전트 파일을 OpenCode 에이전트 디렉토리로 복사
mkdir -p ~/.opencode/agents
cp agents/*.md ~/.opencode/agents/
```

---

## 패키지별 설치

특정 기능만 필요한 경우 개별 패키지 설치:

### 메모리 시스템

```bash
npm install @maskweaver/memory

# 또는 bun으로
bun add @maskweaver/memory
```

**사용법:**

```typescript
import { hybridSearch, indexFile } from '@maskweaver/memory';

// 임베딩 함수로 초기화
const embedFn = async (text: string) => {
  // 임베딩 구현
  return embedding;
};

// 파일 인덱싱
await indexFile('./docs/architecture.md', embedFn);

// 검색
const results = await hybridSearch(
  '인증은 어떻게 작동하나요?',
  embedFn,
  { limit: 5, minScore: 0.7 }
);
```

### 컨텍스트 시스템

```bash
npm install @maskweaver/context
```

**사용법:**

```typescript
import { createFeature, addFileToFeature } from '@maskweaver/context';

// 기능 추적 시작
const feature = await createFeature({
  name: 'oauth-login',
  goal: 'OAuth2 플로우 구현'
});

// 기능에 파일 추가
await addFileToFeature(feature.id, 'src/auth/oauth.ts');
```

### 검증 시스템

```bash
npm install @maskweaver/verify
```

**사용법:**

```typescript
import { verifyWithMask } from '@maskweaver/verify';

// 다른 전문가 가면으로 코드 검증
const review = await verifyWithMask(
  generatedCode,
  'rob-pike'  // 검증에 롭 파이크의 가면 사용
);
```

---

## 임베딩 프로바이더 설정

### Ollama (로컬, 무료)

1. Ollama 설치: https://ollama.ai
2. 임베딩 모델 다운로드:
   ```bash
   ollama pull bge-m3
   # 또는
   ollama pull nomic-embed-text
   ```
3. `maskweaver.config.ts`에 설정:
   ```typescript
   memory: {
     provider: 'ollama',
     model: 'bge-m3',
     dimensions: 1024
   }
   ```

### OpenAI

1. https://platform.openai.com에서 API 키 발급
2. 환경 변수 설정:
   ```bash
   export OPENAI_API_KEY=your_key_here
   ```
3. 설정:
   ```typescript
   memory: {
     provider: 'openai',
     model: 'text-embedding-3-large',
     dimensions: 3072
   }
   ```

### VoyageAI (코드에 최적)

1. https://voyageai.com에서 API 키 발급
2. 환경 변수 설정:
   ```bash
   export VOYAGEAI_API_KEY=your_key_here
   ```
3. 설정:
   ```typescript
   memory: {
     provider: 'voyageai',
     model: 'voyage-code-2',
     dimensions: 1536
   }
   ```

### OpenRouter

1. https://openrouter.ai에서 API 키 발급
2. 환경 변수 설정:
   ```bash
   export OPENROUTER_API_KEY=your_key_here
   ```
3. 설정:
   ```typescript
   memory: {
     provider: 'openrouter',
     model: 'openai/text-embedding-3-large',
     dimensions: 3072
   }
   ```

### Text-only (임베딩 없음)

임베딩 없이 순수 전체 텍스트 검색용:

```typescript
memory: {
  provider: 'text',
  model: 'fts5',
  dimensions: 0
}
```

---

## 설치 확인

설치 후 모든 것이 작동하는지 확인:

### 0. 버전 확인

```bash
# CLI (전역 설치 또는 npx 사용 시)
maskweaver --version
# 또는
maskweaver -V

# npm
npm list maskweaver

# OpenCode 채팅 내에서
# maskweaver_status 도구를 사용하거나
# /weave-help 를 입력하면 버전 정보가 표시됩니다
```

```typescript
// 프로그래밍 방식 (Node.js / TypeScript)
import { VERSION } from 'maskweaver';
console.log(VERSION);
```

### 1. 패키지 설치 확인

```bash
# 설치된 Maskweaver 패키지 목록
npm list | grep maskweaver

# 또는 bun으로
bun pm ls | grep maskweaver
```

### 2. 가면 로딩 테스트

```bash
# 모든 가면 검증
bun run validate-masks
```

예상 출력:
```
✅ linus-torvalds.en.yaml - Valid
✅ linus-torvalds.ko.yaml - Valid
✨ All masks validated successfully!
```

### 3. 메모리 시스템 테스트

테스트 파일 `test-memory.ts` 생성:

```typescript
import { indexFile, hybridSearch } from '@maskweaver/memory';

async function test() {
  // 샘플 파일 인덱싱
  await indexFile('./README.md', embedFn);
  
  // 검색
  const results = await hybridSearch('설치', embedFn);
  console.log('검색 결과:', results);
}

test();
```

실행:
```bash
bun run test-memory.ts
```

### 4. OpenCode 통합 테스트 (플러그인 사용 시)

```bash
# OpenCode에서 시도:
@maskweaver list masks
@dummy-human 안녕하세요, 도와주실 수 있나요?
@context status
```

---

## 문제 해결

### 문제: "Module not found: @maskweaver/core"

**해결책:**
```bash
# 빌드를 실행했는지 확인
bun run build

# 또는 의존성 재설치
bun install
```

### 문제: "Embedding provider not configured"

**해결책:**
`.env` 파일을 확인하고 선택한 프로바이더에 대한 올바른 API 키가 설정되어 있는지 확인하세요.

### 문제: "Masks directory not found"

**해결책:**
`maskweaver.config.ts`의 `maskDir` 경로가 올바른 위치를 가리키는지 확인:
```bash
ls -la ./masks
```

### 문제: OpenCode가 Maskweaver 명령어를 인식하지 못함

**해결책:**
1. `~/.config/opencode/opencode.json`에 플러그인이 나열되어 있는지 확인
2. OpenCode 재시작
3. OpenCode 로그 확인:
   ```bash
   opencode --verbose
   ```

---

## LLM 에이전트용 설치 가이드

LLM 에이전트가 사용자의 Maskweaver 설치를 도와줄 때 반드시 따라야 할 단계입니다.

사용자에게 다음과 같이 인사하세요: "**Maskweaver를 설치할게요! 전설적인 개발자들의 페르소나를 AI에 입힐 수 있어요.**"

다음 단계를 따르세요:

### 1단계: OpenCode 설치 확인

```bash
if command -v opencode &> /dev/null; then
    echo "OpenCode $(opencode --version) is installed"
else
    echo "OpenCode is not installed. Please install it first."
    echo "Ref: https://opencode.ai/docs"
fi
```

OpenCode가 설치되지 않았다면 [OpenCode 설치 가이드](https://opencode.ai/docs)를 참조하세요.

### 2단계: OpenCode 설정에 플러그인 추가

#### Linux/macOS

```bash
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/opencode.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["maskweaver/plugin"]
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
  "plugin": ["maskweaver/plugin"]
}
"@ | Out-File -Encoding UTF8 "$configPath\opencode.json"
```

### 3단계: 구독 자동 감지 (필수!)

**질문하기 전에, 먼저 다음 명령어로 사용자의 환경을 확인하세요:**

```bash
# 인증된 프로바이더 확인
opencode providers list

# 사용 가능한 모델 확인
opencode models
```

`opencode providers list` 출력 예시:
```
  Credentials ~\.local\share\opencode\auth.json
│
●  Z.AI Coding Plan  api
●  OpenCode Go  api
●  GitHub Copilot  oauth
●  Anthropic  oauth
└  10 credentials
```

Maskweaver는 이 정보로 자동으로 모델 풀을 구성합니다:

| 감지된 프로바이더 | 자동 생성 에이전트 |
|---|---|
| **OpenCode Go** | DeepSeek V4 Flash/Pro, Qwen 3.6 Plus, Kimi K2.6 |
| **Z.AI Coding Plan** | GLM-5 Turbo, GLM-5.1 |
| 둘 다 | 위의 모든 에이전트 |

### 4단계: 구독 확인 및 체크 (중요!)

**구독이 만료되었지만 크레덴셜이 남아있을 수 있습니다.** 사용자에게 감지된 목록을 보여주고 확인하세요:

```
🤖: 감지된 구독을 확인했어요:

    [x] OpenCode Go (api) → opencode-go
    [x] Z.AI Coding Plan (api) → zai-coding-plan

    이 구독들이 현재 유효한가요? 
    만료된 구독이 있다면 maskweaver.config.json에서 제거해드릴게요.
```

사용자가 만료된 구독을 알려주면, 설정 파일에서 해당 풀 항목을 제거하세요.

### 5단계: 설정 파일 자동 생성

Maskweaver가 `maskweaver.config.json`을 자동 생성합니다. 직접 만들 필요 없습니다!

플러그인이 로드되면:
1. `opencode providers list` + `opencode models`로 구독 감지
2. 감지된 구독에 맞는 `maskweaver.config.json` 자동 생성
3. `.opencode/agents/dummy-*.md` 에이전트 파일 자동 생성
4. OpenCode 재시작 안내

**수동으로 설정 파일을 수정해야 하는 경우:**
- 특정 구독을 제외하고 싶을 때
- 다른 모델을 사용하고 싶을 때
- 메모리 프로바이더를 설정하고 싶을 때

`maskweaver.config.json` (프로젝트 루트 또는 `~/.config/opencode/`):
```json
{
  "dummyHumans": {
    "pool": [
      { "id": "glm-flash", "model": "zai-coding-plan/glm-5-turbo", "tier": "flash", "maxConcurrent": 10, "capabilities": ["search", "formatting", "simple-coding", "file-ops"], "costTier": "low" },
      { "id": "glm-general", "model": "zai-coding-plan/glm-5.1", "tier": "human", "maxConcurrent": 10, "capabilities": ["coding", "testing", "refactoring", "backend"], "costTier": "medium" },
      { "id": "glm-premium", "model": "zai-coding-plan/glm-5.1", "tier": "premium", "maxConcurrent": 10, "capabilities": ["architecture", "debugging", "reasoning", "complex-coding"], "costTier": "high" }
    ]
  },
  "operator": { "model": "zai-coding-plan/glm-5.1", "maxConcurrent": 10 },
  "memory": { "provider": "text-only", "enabled": false },
  "language": "ko"
}
```

### 6단계: 완료 메시지

모든 설정이 완료된 후에만 사용자에게 알려주세요:

> "✅ **Maskweaver 설정이 완료되었습니다!**
>
> **설정 내용:**
> - 감지된 구독: opencode-go, zai-coding-plan
> - 자동 생성된 에이전트: 8개 (dummy-deepseek-flash, dummy-glm-general, ...)
>
> **이제 OpenCode를 재시작해주세요!**
>
> 재시작 후 다음과 같이 사용할 수 있어요:
> - 일반 대화: 평소처럼 질문하세요
> - 전문가 모드: '리누스 토발즈처럼 코드 리뷰해줘'라고 요청하세요
> - `/weave-help` - Weave 워크플로우 도움말
> - `/weave-prepare docs/` - Phase 기반 개발 시작"

### LLM 에이전트 주의사항

1. **하세요**: `opencode providers list`로 먼저 인증된 프로바이더 확인
2. **하세요**: 감지된 구독이 실제로 유효한지 사용자에게 확인 (만료 + 크레덴셜 잔류 가능)
3. **하세요**: 자동 감지 결과를 요약해서 보여주기
4. **하세요**: 설정 파일은 자동 생성됨을 안내
5. **하세요**: 모든 설정 완료 후에만 재시작 안내
6. **하지 마세요**: 프로바이더 확인 없이 모델 선택 질문
7. **하지 마세요**: "임베딩 프로바이더", "더미인간" 같은 기술 용어 사용
8. **하지 마세요**: 설정 파일을 수동으로 만들지 마세요 — 자동 감지가 처리합니다

---

## Weave 워크플로우 (v0.8+)

설치 완료 후, **Weave v0.8+ 워크플로우**를 사용필보세요:

`ash
# 1. research + spec + 계획을 한 번에 생성
/weave-prepare docs/

# 2. (선택) 노트로 계획 정제
/weave-refine-plan

# 3. (필수) 구현 전 계획 승인
/weave-approve

# 4. Phase 실행 컨텍스트 준비
/weave-craft

# 5. (선택) 자율 빌드 루프 실행
/build action=run

# 6. 언제든 진행 상황 확인
/weave-status
`

**명령어 통합 (v0.8.16+):**
- 📝 **prepare**: 
esearch + spec + design을 하나로 통합
- 🔒 **approve**: pprove-plan을 대체
- 🔨 **build**: 루프 명령 통합 (ction=run/status/stop/list/resume/sync)
- 🤖 **agents**: sync-agents와 init-config를 대체
- 🩹 **troubleshoot**: 
ecord를 --record 플래그로 흡수
- ✏️ **Annotation cycle**: 	asks/plan-notes.md 지시문으로 계획 정제
- 🎭 **마스크 자동 선택**: AI 가 각 작업에 최적의 전문가 선택
- ✅ **다층 검증**: Build → Test → E2E → Visual → A11y
- 🧠 **글로벌 지식**: 프로젝트 간 트러블슈팅 솔루션

## 다음 단계

- 📖 고급 설정을 위한 [설정 가이드](configuration.md) 읽기
- 🎭 [가면 가이드](masks.md)에서 사용 가능한 가면 탐색
- 🧵 [Weave 워크플로우](../README.ko.md#-weave-워크플로우) - Phase 기반 개발
- 🚀 [빠른 시작](../README.ko.md#빠른-시작) 예제 확인

---

## 지원

- 📝 [이슈 보고](https://github.com/ulgerang/maskweaver/issues)
- 💬 [질문하기](https://github.com/ulgerang/maskweaver/discussions)
- 📧 연락처: ulgerang@gmail.com

---

<p align="center">
  <sub>도움이 필요하신가요? 저희가 도와드리겠습니다! 🎭</sub>
</p>
