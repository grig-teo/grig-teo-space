import { Global, Module } from '@nestjs/common';
import { LoginAttemptTracker } from './login-attempt-tracker';

/**
 * Global provider of cross-cutting security services. Made `@Global()` so that
 * `LoginAttemptTracker` (a process-wide singleton) is injectable into guards
 * and controllers across every feature module without per-module imports.
 */
@Global()
@Module({
  providers: [LoginAttemptTracker],
  exports: [LoginAttemptTracker],
})
export class SecurityModule {}
