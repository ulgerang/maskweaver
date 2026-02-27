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

**직접 설치 명령어를 실행할 필요가 없습니다!**

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
# /weave help 를 입력하면 버전 정보가 표시됩니다
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

### 3단계: 사용자의 인증된 프로바이더 확인 (필수!)

**질문하기 전에, 먼저 다음 명령어로 사용자의 환경을 확인하세요:**

```bash
# 인증된 프로바이더 확인
opencode auth list

# 사용 가능한 모델 확인
opencode models
```

`opencode auth list` 출력 예시:
```
●  OpenAI oauth
●  Google oauth
●  GitHub Copilot oauth
●  Anthropic oauth
```

이 정보로 사용자가 이미 인증한 서비스를 알 수 있습니다. **이 정보를 바탕으로 적절한 모델을 제안하세요.**

### 4단계: 사용 가능한 모델 분석 및 자동 추천

**`opencode models`를 실행하고 결과를 분석하세요.** 작업 유형을 물어보지 말고, 사용 가능한 모델을 기반으로 바로 추천하세요.

#### 모델 분류 규칙

모델 목록을 분석하여 각 모델을 분류합니다:

**Premium 티어** (깊은 사고, 아키텍처):
- 포함 키워드: `opus`, `o1`, `gpt-5`, `thinking`, `xhigh`, `kimi-2.5`
- 예시: `codex/gpt-5.2`, `claude-opus-4`, `o1-preview`

**Human 티어** (일반 개발):
- 포함 키워드: `sonnet`, `gpt-4o` (mini 제외), `glm-4.7` (flash 제외), `gemini-pro`, `gemini-3-flash` (minimal 제외)
- 예시: `claude-sonnet-4`, `gpt-4o`, `glm-4.7`

**Flash 티어** (빠른 작업):
- 포함 키워드: `haiku`, `flash`, `mini`, `minimal`, `instant`, `turbo`
- 예시: `claude-haiku-4`, `gpt-4o-mini`, `gemini-3-flash`

#### 우선순위 (여러 모델이 있을 때)

**Premium:**
1. `codex/gpt-5.2` (variant: xhigh) - 최고의 추론
2. `*opus-4-5-thinking` 또는 `*opus-4.5` - 전략적 사고
3. `kimi-coding/kimi-2.5` - 좋은 대안
4. `*claude-opus-4` - 안정적

**Human:**
1. `*antigravity-gemini-3-flash` 또는 `zai-coding-plan/glm-4.7` - 빠르고 유능
2. `*claude-sonnet-4-5` 또는 `*claude-sonnet-4` - 균형
3. `*gpt-4o` - 범용

**Flash:**
1. `*gemini-3-flash` (variant: minimal) - 가장 빠름
2. `*glm-4.7-flash` 또는 `*haiku-4` - 빠른 응답
3. `*gpt-4o-mini` - 저렴

### 5단계: 사용자에게 자동 추천

**`opencode models` 분석 후, 바로 추천합니다:**

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

**모델을 분류할 수 없을 때**만 물어봅니다:

```
🤖: 일부 모델을 분류하기 어려워요. 
    `some-provider/unknown-model`은 어떤 용도로 쓰시겠어요?
    
    1. 복잡한 작업 (깊은 사고)
    2. 일반 개발 
    3. 빠른 단순 작업
```

### 6단계: 예외 상황 처리

**프로바이더가 하나만 있을 때:**
```
🤖: Anthropic 모델만 사용 가능하네요. 자동으로 설정할게요:
    - 복잡한 작업: anthropic/claude-opus-4
    - 일반 개발: anthropic/claude-sonnet-4
    - 빠른 작업: anthropic/claude-haiku-4
```

**적합한 Premium 모델이 없을 때:**
```
🤖: 복잡한 추론용 모델이 없어서, 일반 개발 모델을 대신 사용할게요:
    - 복잡한 작업: anthropic/claude-sonnet-4 (대체)
```

### 7단계: 메모리 기능 질문 (선택사항)

사용자에게 물어보세요:

> "프로젝트 기억 기능을 사용하시겠어요?
>
> - **예** → 이전 대화와 결정사항을 기억합니다
> - **아니오** → 기억 없이 사용합니다 (기본값, 나중에 설정 가능)"

예를 선택한 경우:

> "기억 저장 방식을 선택해주세요:
>
> 1. **Ollama** (무료) - 컴퓨터에서 직접 처리, 인터넷 불필요
> 2. **OpenAI** - 고품질 (API 키 필요)
> 3. **VoyageAI** - 코드에 최적화! (API 키 필요, 추천)
> 4. **OpenRouter** - 다양한 모델 선택 가능 (API 키 필요)
> 5. **텍스트만** - 키워드 검색만 (API 키 불필요)"

기억 저장 방식별 설정:

| 방식 | 모델 | 특징 |
|------|------|------|
| Ollama | `bge-m3` | 무료, 로컬, `ollama pull bge-m3` 필요 |
| OpenAI | `text-embedding-3-large` | 고품질 |
| VoyageAI | `voyage-code-2` | **코드에 최적!** |
| OpenRouter | `openai/text-embedding-3-large` | 다양한 모델 |
| Text | `fts5` | API 키 불필요, 키워드 검색만 |

### 8단계: 설정 파일 생성

사용자 답변을 바탕으로 설정 파일을 생성합니다:

#### Linux/macOS

```bash
cat > ~/.config/opencode/maskweaver.config.json << 'EOF'
{
  "dummyHumans": {
    "flash": "선택한_빠른_모델",
    "human": "선택한_일반_모델",
    "premium": "선택한_복잡_모델"
  },
  "memory": {
    "provider": "선택한_프로바이더",
    "enabled": true_또는_false
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
    "flash": "선택한_빠른_모델",
    "human": "선택한_일반_모델",
    "premium": "선택한_복잡_모델"
  },
  "memory": {
    "provider": "선택한_프로바이더",
    "enabled": true_또는_false
  },
  "language": "ko"
}
"@ | Out-File -Encoding UTF8 "$env:USERPROFILE\.config\opencode\maskweaver.config.json"
```

### 9단계: 완료 메시지

모든 설정이 완료된 후에만 사용자에게 알려주세요:

> "✅ **Maskweaver 설정이 완료되었습니다!**
>
> **설정 내용:**
> - AI 도우미: [선택한 서비스]
> - 메모리 기능: [사용함/사용안함]
>
> **이제 OpenCode를 재시작해주세요!**
>
> 재시작 후 다음과 같이 사용할 수 있어요:
> - 일반 대화: 평소처럼 질문하세요
> - 전문가 모드: '리누스 토발즈처럼 코드 리뷰해줘'라고 요청하세요
> - `/weave help` - Weave 워크플로우 도움말
> - `/weave design docs/` - Phase 기반 개발 시작"

### LLM 에이전트 주의사항

1. **하세요**: `opencode auth list`로 먼저 인증된 프로바이더 확인
2. **하세요**: 확인된 프로바이더 기반으로 모델 제안
3. **하세요**: 각 옵션의 의미를 쉬운 말로 설명
4. **하세요**: 최종 설정 내용을 요약해서 보여주기
5. **하세요**: 모든 설정 완료 후에만 재시작 안내
6. **하지 마세요**: 프로바이더 확인 없이 모델 선택 질문
7. **하지 마세요**: "임베딩 프로바이더", "더미인간" 같은 기술 용어 사용
8. **하지 마세요**: 설정 질문 건너뛰기

---

## Weave 워크플로우 (v0.8+)

설치 완료 후, **Weave v0.8 워크플로우**를 사용해보세요. 리서치 우선과 승인 게이트가 새로 추가되었습니다:

```bash
# 1. 문서를 깊게 읽고 리서치 아티팩트 생성
/weave research docs/

# 2. 리서치 + spec + 계획 생성
/weave prepare docs/

# 3. (선택) 노트로 계획 정제
/weave refine-plan

# 4. (필수) 구현 전 계획 승인
/weave approve-plan

# 5. 자동 검증으로 Phase 실행
/weave craft P1

# 6. 언제든 진행 상황 확인
/weave status
```

**v0.8 신규 기능:**
- 📝 **리서치 우선**: 계획 전 문서 심층 분석
- 🔒 **승인 게이트**: 구현 전 계획 승인 필수
- ✏️ **Annotation cycle**: `tasks/plan-notes.md` 지시문으로 계획 정제
- 🎭 **마스크 자동 선택**: AI 가 각 작업에 최적의 전문가 선택
- ✅ **다층 검증**: Build → Test → E2E → Visual → A11y
- 🧠 **글로벌 지식**: 프로젝트 간 트러블슈팅 솔루션


---

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
