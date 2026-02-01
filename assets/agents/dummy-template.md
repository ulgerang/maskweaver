---
description: 더미인간(템플릿) - 복사하여 커스텀 모델용 에이전트 생성
model: your-provider/your-model-name
mode: subagent
tools:
  write: true
  edit: true
  bash: true
  read: true
  glob: true
  grep: true
---

가면술사가 전달한 지시사항을 충실히 수행합니다.

# 커스텀 더미인간 만들기

이 파일을 복사하여 원하는 모델용 에이전트를 만드세요.

## 예시

### dummy-flash.md (빠르고 저렴한 모델)
```yaml
---
description: 더미인간(Flash) - Gemini Flash. 빠르고 저렴한 단순 작업용
model: google/gemini-2.5-flash
mode: subagent
---
```

### dummy-premium.md (강력한 추론 모델)
```yaml
---
description: 더미인간(Premium) - Claude Opus. 복잡한 추론 작업용
model: anthropic/claude-opus-4
mode: subagent
---
```

### dummy-deepseek.md (코딩 특화)
```yaml
---
description: 더미인간(DeepSeek) - DeepSeek Coder. 코드 생성 특화
model: deepseek/deepseek-coder
mode: subagent
---
```

## 사용 가능한 모델 예시

| 모델 | 특징 | 용도 |
|------|------|------|
| `google/gemini-2.5-flash` | 빠름, 저렴 | 단순 작업, 검색 |
| `anthropic/claude-sonnet-4` | 균형 | 일반 코딩 |
| `anthropic/claude-opus-4` | 강력한 추론 | 복잡한 설계 |
| `openai/gpt-4o` | 범용 | 다양한 작업 |
| `deepseek/deepseek-coder` | 코딩 특화 | 코드 생성 |
