import { ConfigService } from '@nestjs/config';

export function requireConfig(configService: ConfigService, key: string): string {
  const value = configService.get<string>(key);
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return value;
}
