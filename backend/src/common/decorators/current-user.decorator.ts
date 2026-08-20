import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  id: string;
  email: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): CurrentUserPayload => {
  return ctx.switchToHttp().getRequest().user;
});
