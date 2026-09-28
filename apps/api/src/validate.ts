import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import { z } from 'zod';
import type { ApiErrorBody } from '@researchpilot/core/contracts';

/** 把 zod 的校验错误转成统一的中文错误响应。 */
export function toErrorBody(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): ApiErrorBody {
  const issues = error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
  return { error: issues[0]?.message ?? '请求参数有误', issues };
}

/** 校验请求的某一部分（json、query、param），失败时返回 400。 */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) return c.json(toErrorBody(result.error), 400);
  });
}

export const idParam = z.object({
  id: z.coerce.number({ error: '编号必须是数字' }).int('编号必须是整数').positive('编号必须是正整数'),
});
