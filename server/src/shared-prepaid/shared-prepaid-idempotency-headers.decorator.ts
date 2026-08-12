import {
  createParamDecorator,
  ExecutionContext,
  ValidationPipe
} from '@nestjs/common'

const extractIdempotencyHeaders = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest().headers
)

export function SharedPrepaidIdempotencyHeaders(): ParameterDecorator {
  return extractIdempotencyHeaders(new ValidationPipe({
    transform: true,
    whitelist: true,
    validateCustomDecorators: true
  }))
}
