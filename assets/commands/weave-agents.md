---
description: 에이전트 파일 동기화 및 설정 초기화
---

# /weave-agents - 에이전트 및 설정 관리

## 개요

에이전트 파일과 설정 파일을 관리합니다. 기존 `sync-agents`와 `init-config`를 통합한 명령어입니다.

| 플래그 | 설명 | 대응 기존 명령어 |
|--------|------|-----------------|
| `sync` | 설정 기준으로 더미 에이전트 파일 강제 재생성 | `weave sync-agents` |
| `init` | 기본 설정 파일(maskweaver.config.json) 생성 | `weave init-config` |

---

## 사용법

```bash
# 에이전트 파일 동기화
/weave-agents --sync

# 기본 설정 파일 생성
/weave-agents --init

# 동시 실행
/weave-agents --sync --init
```

---

## 입력

```yaml
sync: true   # (선택) 에이전트 파일 강제 재생성
init: true   # (선택) 기본 설정 파일 생성 (기존 파일 덮어쓰지 않음)
```

---

## 출력 예시

### 동기화

```markdown
## 🔄 Agent Sync

✅ Updated: `.opencode/agents/dummy-human-1.md`
✅ Updated: `.opencode/agents/dummy-human-2.md`

> ⚠️ **Important:** You may need to restart OpenCode for the updated agent files to take effect.
```

### 설정 초기화

```markdown
## 📝 Config Initialization

✅ Created runtime config: maskweaver.config.json
✅ Created plugin config: .opencode/maskweaver.json
```
