/**
 * Context Management Tool
 * 
 * 피처 기반 작업 컨텍스트 관리 도구
 * 
 * 설계 원칙:
 * - 의도를 드러내는 코드 (Intention-Revealing)
 * - 명확한 에러 메시지
 * - 일관된 JSON 응답 형식
 * 
 * @author Martin Fowler's Dummy Human
 */

import { z } from "zod";
import type { ToolFactory, ToolContext } from '../types.js';
import * as core from '../../context/index.js';

// ============================================================================
// Schema 정의
// ============================================================================

export const contextSchema = z.object({
  action: z.enum([
    "start", "switch", "status", "done",
    "add", "drop", "goal", "list"
  ]).describe("실행할 액션"),
  name: z.string().optional().describe("피처 이름 (start, switch에 사용)"),
  id: z.string().optional().describe("피처 ID (switch, done에 사용)"),
  file: z.string().optional().describe("파일 경로 (add, drop에 사용)"),
  goal: z.string().optional().describe("피처 목표 (start, goal에 사용)"),
});

export type ContextArgs = z.infer<typeof contextSchema>;

// ============================================================================
// 응답 헬퍼
// ============================================================================

interface ContextResponse {
  success: boolean;
  action: string;
  message: string;
  data?: unknown;
}

function createResponse(
  success: boolean,
  action: string,
  message: string,
  data?: unknown
): string {
  const response: ContextResponse = { success, action, message };
  if (data !== undefined) {
    response.data = data;
  }
  return JSON.stringify(response, null, 2);
}

function successResponse(action: string, message: string, data?: unknown): string {
  return createResponse(true, action, message, data);
}

function errorResponse(action: string, message: string): string {
  return createResponse(false, action, message);
}

// ============================================================================
// Tool Factory
// ============================================================================

export function createContextTool(): ToolFactory {
  return {
    description: `작업 컨텍스트를 관리합니다.

**액션:**
- \`start\`: 새 피처 시작 (name, goal 필요)
- \`switch\`: 피처 전환 (id 또는 name 필요)
- \`status\`: 현재 활성 피처 상태 표시
- \`done\`: 피처 완료 처리 (id 없으면 현재 피처)
- \`add\`: 현재 피처에 파일 추가 (file 필요)
- \`drop\`: 현재 피처에서 파일 제거 (file 필요)
- \`goal\`: 현재 피처 목표 변경 (goal 필요)
- \`list\`: 모든 피처 목록 조회

**예시:**
- 피처 시작: action="start", name="login-oauth", goal="OAuth 로그인 구현"
- 파일 추가: action="add", file="src/auth/oauth.ts"
- 상태 확인: action="status"`,

    args: contextSchema,

    async execute(args: ContextArgs, context: ToolContext) {
      const basePath = context.worktree;

      try {
        switch (args.action) {
          case "start":
            return await handleStart(basePath, args.name, args.goal);

          case "switch":
            return await handleSwitch(basePath, args.id, args.name);

          case "status":
            return await handleStatus(basePath);

          case "done":
            return await handleDone(basePath, args.id);

          case "add":
            return await handleAdd(basePath, args.file);

          case "drop":
            return await handleDrop(basePath, args.file);

          case "goal":
            return await handleGoal(basePath, args.goal);

          case "list":
            return await handleList(basePath);

          default:
            return errorResponse(
              args.action,
              `알 수 없는 액션입니다. 사용 가능: start, switch, status, done, add, drop, goal, list`
            );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResponse(args.action, `예기치 않은 오류: ${message}`);
      }
    }
  };
}

// ============================================================================
// 액션 핸들러
// ============================================================================

/**
 * 새 피처 시작
 * 
 * 피처를 생성하고 즉시 활성화합니다.
 */
async function handleStart(
  basePath: string,
  name: string | undefined,
  goal: string | undefined
): Promise<string> {
  if (!name || name.trim().length === 0) {
    return errorResponse("start", "피처 이름(name)을 입력해주세요. 예: name=\"login-oauth\"");
  }

  if (!goal || goal.trim().length === 0) {
    return errorResponse("start", "피처 목표(goal)를 입력해주세요. 예: goal=\"OAuth 로그인 구현\"");
  }

  // 피처 생성
  const createResult = await core.createFeature(basePath, name, goal);
  if (!createResult.success || !createResult.data) {
    return errorResponse("start", createResult.error || "피처 생성에 실패했습니다");
  }

  // 생성된 피처를 활성화
  const switchResult = await core.switchFeature(basePath, createResult.data.id);
  if (!switchResult.success) {
    return errorResponse("start", switchResult.error || "피처 활성화에 실패했습니다");
  }

  return successResponse("start", `피처 "${name}"를 시작했습니다`, {
    id: createResult.data.id,
    name: createResult.data.name,
    goal: createResult.data.goal,
    status: "active"
  });
}

/**
 * 피처 전환
 * 
 * ID 또는 이름으로 피처를 찾아 전환합니다.
 */
async function handleSwitch(
  basePath: string,
  id: string | undefined,
  name: string | undefined
): Promise<string> {
  if (!id && !name) {
    return errorResponse("switch", "피처 ID(id) 또는 이름(name)을 입력해주세요");
  }

  // ID가 없으면 이름으로 피처 찾기
  let featureId = id;

  if (!featureId && name) {
    const listResult = await core.listFeatures(basePath);
    if (!listResult.success || !listResult.data) {
      return errorResponse("switch", listResult.error || "피처 목록을 가져올 수 없습니다");
    }

    const found = listResult.data.find(f =>
      f.name.toLowerCase() === name.toLowerCase()
    );

    if (!found) {
      const available = listResult.data.map(f => f.name).join(", ");
      return errorResponse(
        "switch",
        `"${name}" 피처를 찾을 수 없습니다. 사용 가능: ${available || "(없음)"}`
      );
    }

    featureId = found.id;
  }

  const result = await core.switchFeature(basePath, featureId!);

  if (!result.success || !result.data) {
    return errorResponse("switch", result.error || "피처 전환에 실패했습니다");
  }

  return successResponse("switch", `"${result.data.name}" 피처로 전환했습니다`, {
    id: result.data.id,
    name: result.data.name,
    goal: result.data.goal,
    status: result.data.status,
    files: result.data.files
  });
}

/**
 * 현재 상태 표시
 */
async function handleStatus(basePath: string): Promise<string> {
  const activeResult = await core.getActiveFeature(basePath);

  if (!activeResult.success) {
    return errorResponse("status", activeResult.error || "상태 조회에 실패했습니다");
  }

  if (!activeResult.data) {
    return successResponse("status", "현재 활성 피처가 없습니다. 'start'로 새 피처를 시작하세요", {
      active: null
    });
  }

  const feature = activeResult.data;

  return successResponse("status", `현재 피처: ${feature.name}`, {
    id: feature.id,
    name: feature.name,
    goal: feature.goal,
    status: feature.status,
    files: feature.files,
    fileCount: feature.files.length,
    createdAt: feature.createdAt,
    updatedAt: feature.updatedAt,
    blockers: feature.blockers
  });
}

/**
 * 피처 완료
 */
async function handleDone(basePath: string, id: string | undefined): Promise<string> {
  let featureId = id;

  // ID가 없으면 현재 활성 피처 사용
  if (!featureId) {
    const activeResult = await core.getActiveFeature(basePath);

    if (!activeResult.success) {
      return errorResponse("done", activeResult.error || "활성 피처 조회에 실패했습니다");
    }

    if (!activeResult.data) {
      return errorResponse("done", "완료할 활성 피처가 없습니다. 'start'로 피처를 시작하세요");
    }

    featureId = activeResult.data.id;
  }

  const result = await core.completeFeature(basePath, featureId);

  if (!result.success || !result.data) {
    return errorResponse("done", result.error || "피처 완료에 실패했습니다");
  }

  return successResponse("done", `🎉 "${result.data.name}" 피처를 완료했습니다!`, {
    id: result.data.id,
    name: result.data.name,
    goal: result.data.goal,
    status: "completed",
    totalFiles: result.data.files.length
  });
}

/**
 * 파일 추가
 */
async function handleAdd(basePath: string, file: string | undefined): Promise<string> {
  if (!file || file.trim().length === 0) {
    return errorResponse("add", "추가할 파일 경로(file)를 입력해주세요. 예: file=\"src/auth/oauth.ts\"");
  }

  // 활성 피처 확인
  const activeResult = await core.getActiveFeature(basePath);

  if (!activeResult.success) {
    return errorResponse("add", activeResult.error || "활성 피처 조회에 실패했습니다");
  }

  if (!activeResult.data) {
    return errorResponse("add", "활성 피처가 없습니다. 먼저 'start'로 피처를 시작하세요");
  }

  const result = await core.addFileToFeature(basePath, activeResult.data.id, file);

  if (!result.success || !result.data) {
    return errorResponse("add", result.error || "파일 추가에 실패했습니다");
  }

  return successResponse("add", `"${file}"을 추가했습니다`, {
    feature: result.data.name,
    files: result.data.files,
    fileCount: result.data.files.length
  });
}

/**
 * 파일 제거
 */
async function handleDrop(basePath: string, file: string | undefined): Promise<string> {
  if (!file || file.trim().length === 0) {
    return errorResponse("drop", "제거할 파일 경로(file)를 입력해주세요. 예: file=\"src/old-file.ts\"");
  }

  // 활성 피처 확인
  const activeResult = await core.getActiveFeature(basePath);

  if (!activeResult.success) {
    return errorResponse("drop", activeResult.error || "활성 피처 조회에 실패했습니다");
  }

  if (!activeResult.data) {
    return errorResponse("drop", "활성 피처가 없습니다. 먼저 'start'로 피처를 시작하세요");
  }

  const result = await core.removeFileFromFeature(basePath, activeResult.data.id, file);

  if (!result.success || !result.data) {
    return errorResponse("drop", result.error || "파일 제거에 실패했습니다");
  }

  return successResponse("drop", `"${file}"을 제거했습니다`, {
    feature: result.data.name,
    files: result.data.files,
    fileCount: result.data.files.length
  });
}

/**
 * 목표 변경
 */
async function handleGoal(basePath: string, goal: string | undefined): Promise<string> {
  if (!goal || goal.trim().length === 0) {
    return errorResponse("goal", "새 목표(goal)를 입력해주세요. 예: goal=\"OAuth 로그인 + 소셜 연동\"");
  }

  // 활성 피처 확인
  const activeResult = await core.getActiveFeature(basePath);

  if (!activeResult.success) {
    return errorResponse("goal", activeResult.error || "활성 피처 조회에 실패했습니다");
  }

  if (!activeResult.data) {
    return errorResponse("goal", "활성 피처가 없습니다. 먼저 'start'로 피처를 시작하세요");
  }

  const result = await core.updateFeature(basePath, activeResult.data.id, { goal });

  if (!result.success || !result.data) {
    return errorResponse("goal", result.error || "목표 변경에 실패했습니다");
  }

  return successResponse("goal", `목표를 변경했습니다`, {
    feature: result.data.name,
    previousGoal: activeResult.data.goal,
    newGoal: result.data.goal
  });
}

/**
 * 모든 피처 목록
 */
async function handleList(basePath: string): Promise<string> {
  const listResult = await core.listFeatures(basePath);

  if (!listResult.success || !listResult.data) {
    return errorResponse("list", listResult.error || "피처 목록 조회에 실패했습니다");
  }

  const features = listResult.data;

  if (features.length === 0) {
    return successResponse("list", "등록된 피처가 없습니다. 'start'로 새 피처를 시작하세요", {
      total: 0,
      features: []
    });
  }

  // 활성 피처 확인
  const projectResult = await core.getProjectContext(basePath);
  const activeId = projectResult.success && projectResult.data
    ? projectResult.data.activeFeatureId
    : undefined;

  const summary = features.map(f => ({
    id: f.id,
    name: f.name,
    goal: f.goal,
    status: f.status,
    isActive: f.id === activeId,
    fileCount: f.files.length,
    updatedAt: f.updatedAt
  }));

  // 상태별 카운트
  const counts = {
    active: features.filter(f => f.status === "active").length,
    paused: features.filter(f => f.status === "paused").length,
    completed: features.filter(f => f.status === "completed").length
  };

  return successResponse("list", `총 ${features.length}개의 피처`, {
    total: features.length,
    counts,
    activeFeatureId: activeId,
    features: summary
  });
}
